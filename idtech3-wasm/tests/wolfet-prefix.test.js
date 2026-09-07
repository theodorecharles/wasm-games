'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const vm = require('node:vm');

const game = path.resolve(__dirname, '../games/wolfet');
const framework = path.resolve(process.env.WASM_GAME_PREFIX_FRAMEWORK_DIR ||
  path.join(__dirname, '../../../wasm-game-framework'));
const clientSource = fs.readFileSync(path.join(game, 'web/js/client.js'), 'utf8');
const adapterSource = fs.readFileSync(path.join(game, 'web/game-adapter.js'), 'utf8');
const shellSource = fs.readFileSync(path.join(framework, 'dist/wasm-game-framework.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(game, 'web/wasm-game-data.json')));

function request(port, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: pathname, ...options }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.setTimeout(5000, () => req.destroy(new Error('HTTP fixture timeout')));
    req.on('error', reject);
    req.end(options.body);
  });
}

for (const basePath of ['/', '/wolfet/', '/arena/wolfet/']) {
  test(`WolfET actual HTTP routes, isolation, auth and asset boundaries at ${basePath}`, async t => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'wolfet-http-test-'));
    const dataRoot = path.join(temporary, 'data');
    t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
    for (const file of manifest.files) {
      const destination = path.join(dataRoot, file.path);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      // Small synthetic ZIP headers exercise HTTP delivery, not real PK3 validity.
      const bytes = Buffer.alloc(4096);
      bytes.set([80, 75, 3, 4]);
      fs.writeFileSync(destination, bytes);
    }
    fs.cpSync(path.join(game, 'runtime/legacy/ui'), path.join(dataRoot, 'runtime/legacy/ui'), { recursive: true });
    for (const file of ['etconfig_server.cfg', 'etconsole.log', 'qagame.mp.x86_64.so', 'session/private.json']) {
      const destination = path.join(dataRoot, 'runtime/legacy', file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, 'not-public-fixture');
    }
    const outside = path.join(temporary, 'private.txt');
    fs.writeFileSync(outside, 'not-public-fixture');
    const child = fork(path.join(__dirname, 'fixtures/wolfet-http-host.cjs'), [], {
      env: { ...process.env, ETJS_DATA_ROOT: dataRoot,
        WASM_GAME_BASE_PATH: basePath,
        WASM_GAME_FRAMEWORK_WEB_ROOT: path.join(framework, 'dist'),
        WASM_GAME_FRAMEWORK_RUNTIME_ROOT: path.join(framework, 'server'),
        WASM_GAME_PASSWORD: 'fixture-password', WASM_GAME_SESSION_SECRET: require('node:crypto').randomBytes(32).toString('base64url'),
        ETJS_TRUST_PROXY: '0', ETJS_ADMIN_IPS: '' },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc']
    });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    t.after(async () => {
      if (child.exitCode !== null) return;
      const exited = once(child, 'exit');
      child.send('close');
      const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
      await exited;
      clearTimeout(timer);
    });
    const { port: backend } = await new Promise((resolve, reject) => {
      child.once('message', resolve);
      child.once('exit', code => reject(new Error(`Fixture exited ${code}: ${stderr}`)));
    });
    const proxy = http.createServer((req, res) => {
      if (!req.url.startsWith(basePath)) { res.writeHead(404); res.end(); return; }
      const upstream = http.request({ hostname: '127.0.0.1', port: backend,
        path: '/' + req.url.slice(basePath.length), method: req.method,
        headers: { ...req.headers, 'x-forwarded-for': '198.51.100.9' } }, response => {
        res.writeHead(response.statusCode, response.headers); response.pipe(res);
      });
      upstream.on('error', () => { res.writeHead(502); res.end(); });
      req.pipe(upstream);
    });
    await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { proxy.closeAllConnections(); proxy.close(resolve); }));
    const port = proxy.address().port;
    const get = (suffix, options) => request(port, basePath + suffix, options);
    const html = await get('');
    assert.equal(html.status, 200);
    assert.match(html.body.toString(), new RegExp(`<base href="${basePath}">`));
    assert.equal(html.headers['cross-origin-opener-policy'], 'same-origin');
    assert.equal(html.headers['cross-origin-embedder-policy'], 'require-corp');
    assert.equal(html.headers['x-content-type-options'], 'nosniff');
    for (const [, url] of html.body.toString().matchAll(/(?:src|href)="(\/[^"#]*)"/g)) {
      assert.ok(url.startsWith(basePath), url);
    }
    const configJs = await get('wasm-game-config.js');
    const globals = {};
    vm.runInNewContext(configJs.body.toString(), globals);
    assert.equal(globals.WASM_GAME_BASE_PATH, basePath);
    assert.equal(globals.WASM_GAME_VARIANT, 'wolfet');
    const pwa = JSON.parse((await get('app.webmanifest')).body);
    for (const key of ['id', 'scope', 'start_url']) assert.equal(pwa[key], basePath);
    for (const icon of pwa.icons) assert.ok(icon.src.startsWith(basePath));
    const worker = await get('service-worker.js');
    assert.equal(worker.headers['service-worker-allowed'], basePath);
    const listeners = {}, deletions = [];
    const ownCache = `wasm-game-shell-0.9.6:${encodeURIComponent(basePath)}`;
    const staleCache = `wasm-game-shell-0.9.5:${encodeURIComponent(basePath)}`;
    vm.runInNewContext(worker.body.toString(), {
      self: { addEventListener: (name, fn) => { listeners[name] = fn; }, clients: { claim() {} } },
      caches: { keys: async () => [ownCache, staleCache, 'wasm-game-shell-0.9.5:%2Fsibling%2F'],
        delete: async key => { deletions.push(key); } }
    });
    let activation;
    listeners.activate({ waitUntil: promise => { activation = promise; } });
    await activation;
    assert.deepEqual(deletions, [staleCache], 'activation must not evict sibling game caches');
    assert.equal((await get('%63onfig.json')).status, 401, 'encoded path cannot bypass authentication');
    assert.equal((await get('game-data/status')).status, 401);
    const login = await get('auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'fixture-password' }) });
    assert.equal(login.status, 200);
    assert.ok(login.headers['set-cookie'][0].includes(`Path=${basePath};`));
    const headers = { cookie: login.headers['set-cookie'][0].split(';')[0] };
    const config = JSON.parse((await get('config.json', { headers })).body);
    assert.equal(config.variant, 'wolfet');
    assert.equal(config.wsPath, basePath + 'ws');
    assert.equal(config.admin, undefined, 'proxy proximity is not administrator authority');
    for (const asset of config.assets) {
      assert.ok(asset.url.startsWith(basePath), asset.url);
      assert.ok(['/etmain', '/legacy'].includes(asset.parent), 'native FS parent must remain unchanged');
      assert.equal(asset.url.split('?')[0], basePath + asset.parent.slice(1) + '/' + asset.name);
    }
    assert.equal((await get('admin', { method: 'POST', headers, body: '{}' })).status, 403);
    const status = JSON.parse((await get('status', { headers })).body);
    assert.equal(status.state, 'sleeping');
    assert.equal(status.peers, 0);
    const data = JSON.parse((await get('game-data/status?variant=doom', { headers })).body);
    assert.equal(data.variant, 'wolfet');
    assert.equal(data.files.length, 6);
    const partial = await get('etmain/pak0.pk3', { headers: { ...headers, range: 'bytes=0-3' } });
    assert.equal(partial.status, 206);
    assert.deepEqual([...partial.body], [80, 75, 3, 4]);
    for (const range of ['bytes=-4', 'bytes=4092-', 'bytes=4092-99999']) {
      const response = await get('game-data/files/etmain-pak0.pk3', { headers: { ...headers, range } });
      assert.equal(response.status, 206, range);
      assert.equal(response.body.length, 4);
      assert.equal(response.headers['content-range'], 'bytes 4092-4095/4096');
    }
    for (const range of ['bytes=-0', 'bytes=-', 'bytes=1-0', 'bytes=5000-', 'bytes=0-1,3-4', 'bytes=-9007199254740992']) {
      assert.equal((await get('etmain/pak0.pk3', { headers: { ...headers, range } })).status, 416, range);
    }
    const head = await get('etmain/pak0.pk3', { method: 'HEAD', headers });
    assert.equal(head.status, 200);
    assert.equal(head.body.length, 0);
    assert.equal(head.headers['content-length'], '4096');
    assert.equal((await get('legacy/ui/etjs_main.menu', { headers })).status, 200);
    for (const target of ['legacy/etconfig_server.cfg', 'legacy/etconsole.log', 'legacy/qagame.mp.x86_64.so',
      'legacy/session/private.json', 'runtime/.rcon-password', 'data/runtime/legacy/etconfig_server.cfg',
      'legacy/ui/../etconfig_server.cfg', 'legacy/ui/%2e%2e/etconfig_server.cfg',
      'legacy/ui/%252e%252e/etconfig_server.cfg', 'legacy/ui/%5c..%5cetconfig_server.cfg',
      'js/missing.js', 'missing.wasm']) {
      const response = await get(target, { headers });
      assert.equal(response.status, 404, target);
      assert.ok(!response.body.includes('not-public-fixture'));
      assert.ok(!response.body.includes(temporary));
    }
    assert.equal((await get('%zz', { headers })).status, 400);
    assert.equal((await get('js/client.js', { method: 'POST', headers })).status, 405);
    // Replace only test-owned fixture files with symlinks to a sibling directory.
    for (const rel of ['runtime/etmain/pak0.pk3', 'runtime/legacy/ui/main.menu']) {
      fs.unlinkSync(path.join(dataRoot, rel));
      fs.symlinkSync(outside, path.join(dataRoot, rel));
    }
    for (const target of ['etmain/pak0.pk3', 'game-data/files/etmain-pak0.pk3', 'legacy/ui/main.menu']) {
      assert.equal((await get(target, { headers })).status, 404, target);
    }
    if (basePath !== '/') assert.equal((await request(port, '/config.json')).status, 404);
  });

  test(`WolfET browser URLs preserve native filesystem paths at ${basePath}`, async () => {
    const requests = [];
    const element = { classList: { add() {}, remove() {} }, addEventListener() {}, focus() {},
      setAttribute() {}, style: {}, dataset: {}, width: 800, height: 600, clientWidth: 800, clientHeight: 600,
      getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }) };
    const env = { URL, URLSearchParams, WASM_GAME_BASE_PATH: basePath,
      document: { getElementById: () => element, createElement: () => ({}),
        head: { appendChild(script) { requests.push(script.src); script.onload(); } } },
      console: { info() {}, warn() {}, error() {}, log() {} },
      fetch: async url => { requests.push(url); return { ok: true, text: async () => 'fixture-menu' }; },
      ETJSPk3Download: { fetchPakBytes: async file => { requests.push(file.url); return file; } }
    };
    env.window = env;
    const context = vm.createContext(env);
    vm.runInContext(shellSource, context);
    vm.runInContext(fs.readFileSync(path.join(game, 'web/js/player-name.js'), 'utf8'), context);
    vm.runInContext(adapterSource, context);
    // Expose just pure/file-I/O bootstrap seams inside the test VM; never load
    // or start an actual engine in an automation helper or this test process.
    const hook = 'window.__prefixTest = { gameFilesFromConfig, defaultGameFiles, fetchPakBytes, writeMenuFiles, engineArgs };';
    vm.runInContext(clientSource.replace('  window.ETJSGameAdapter = {', hook + '\n  window.ETJSGameAdapter = {'), context);
    env.ETJSGameAdapter.init = () => {};
    await env.WasmGameAdapter.init({});
    assert.deepEqual(requests.splice(0), ['player-name.js?v=2', 'etjs-input.js?v=3', 'bind-store.js?v=2',
      'pk3-cache.js?v=3', 'pk3-download.js?v=1', 'client.js?v=26'].map(file => basePath + 'js/' + file));
    const api = env.__prefixTest;
    const files = [...api.defaultGameFiles()].map(file => ({ ...file, url: env.WasmGameFramework.publicUrl(file.url) + '?v=abcdef',
      cacheKey: file.name + '@sha256:' + 'a'.repeat(64), bytes: 4096 }));
    assert.equal(api.gameFilesFromConfig({ assets: files }), files, 'prefixed content-addressed metadata must not fall back');
    for (const bad of ['https://evil.invalid/pak0.pk3', '//evil.invalid/pak0.pk3', '/sibling/etmain/pak0.pk3',
      basePath + 'etmain/other.pk3', basePath + 'etmain/../pak0.pk3', basePath + 'etmain/pak0.pk3?v=x']) {
      const invalid = files.map((file, index) => index ? file : { ...file, url: bad });
      assert.notEqual(api.gameFilesFromConfig({ assets: invalid }), invalid, bad);
    }
    await api.fetchPakBytes(files[0]);
    assert.equal(requests.pop(), files[0].url, 'already prefixed PK3 URL must not be prefixed twice');
    await api.fetchPakBytes(api.defaultGameFiles()[0]);
    assert.equal(requests.pop(), basePath + 'etmain/pak0.pk3');
    const writes = [];
    await api.writeMenuFiles({ mkdir() {}, writeFile: file => writes.push(file) });
    assert.equal(requests.length, 7);
    assert.ok(requests.every(url => url.startsWith(basePath + 'legacy/ui/')));
    assert.equal(writes.length, 14);
    assert.ok(writes.every(file => file.startsWith('/legacy/ui/') || file.startsWith('/home/legacy/ui/')));
    const args = api.engineArgs('PrefixProof', { connect: '127.0.0.1:27960', mode: 'arcade' });
    assert.equal(args[args.indexOf('fs_homepath') + 1], '/home');
  });
}
