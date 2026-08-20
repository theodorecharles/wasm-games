'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WEB = path.join(__dirname, '..', 'web');
const FRAMEWORK_WEB = path.join(__dirname, '..', '.generated', 'shared-shell');

function assertNoUnguardedNode(src, file) {
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    if (/^\s*\/\//.test(line) || /\/\*/.test(line)) {
      return;
    }
    if (/\brequire\s*\(/.test(line) && !/typeof module/.test(line) && !/typeof require/.test(line)) {
      // allow require only inside a module.exports / typeof module guard on nearby lines
      const window = lines.slice(Math.max(0, i - 6), i + 1).join('\n');
      assert.match(window, /typeof module/, file + ':' + (i + 1) + ' unguarded require');
    }
  });
}

describe('browser client scripts', () => {
  it('uses the canonical framework document plus a game manifest and adapter', () => {
    const html = fs.readFileSync(path.join(FRAMEWORK_WEB, 'index.html'), 'utf8');
    const framework = JSON.parse(fs.readFileSync(path.join(FRAMEWORK_WEB, 'wasm-game-framework.json'), 'utf8'));
    const lock = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'framework-lock.json'), 'utf8'));
    const config = JSON.parse(fs.readFileSync(path.join(WEB, 'wasm-game.json'), 'utf8'));
    const adapter = fs.readFileSync(path.join(WEB, 'game-adapter.js'), 'utf8');
    const client = fs.readFileSync(path.join(WEB, 'js', 'client.js'), 'utf8');
    assert.equal(fs.existsSync(path.join(WEB, 'index.html')), false, 'WolfET must not fork the framework document');
    assert.equal(fs.existsSync(path.join(WEB, 'css', 'etjs.css')), false, 'WolfET must not fork the framework shell CSS');
    assert.equal(framework.version, '0.9.4');
    assert.equal(lock.version, '0.9.4');
    assert.equal(lock.commit, 'c4ad3b9e075f881d32f044299fbfeee703a9169d');
    assert.match(html, /id="launcher-form"/);
    assert.match(html, /id="launcher"/);
    assert.match(html, /id="player-name"/);
    assert.equal(config.icon, '/img/et-512.png');
    assert.equal(config.displayMode, 'dynamic');
    assert.equal(config.nativeManaged, true);
    assert.equal(config.resizeTransition, 'immediate');
    assert.equal(config.pointerWidth, 640);
    assert.equal(config.pointerHeight, 480);
    assert.equal(config.pointerFit, 'contain');
    assert.equal(config.menuCursor, 'native');
    assert.equal(config.adapter, '/game-adapter.js');
    assert.equal(config.fullscreen, true);
    assert.equal(config.persistence.root, '/persistent/wolfet');
    assert.equal(config.controller.mode, 'disabled');
    assert.equal(config.pwa.icons.length, 2);
    assert.deepEqual(config.pwa.icons.map((icon) => icon.src), ['/img/et-192.png', '/img/et-512.png']);
    assert.match(html, /rel="manifest" href="\/app\.webmanifest"/);
    assert.match(html, /data-shell-launch-fullscreen/);
    assert.match(adapter, /player-name\.js/);
    assert.match(adapter, /etjs-input\.js/);
    assert.match(adapter, /bind-store\.js/);
    assert.match(adapter, /pk3-cache\.js/);
    assert.match(adapter, /pk3-download\.js/);
    assert.match(adapter, /client\.js\?v=26/);
    assert.match(adapter, /readCaptureIntent/);
    assert.match(adapter, /captureLost/);
    ['pointerMove', 'pointerButton', 'inputCaptureChanged', 'preferencesChanged',
      'controllerFrame', 'controllerChanged',
      'contextLost', 'contextRestored'].forEach((hook) => assert.match(adapter, new RegExp(hook)));
    assert.match(client, /canonicalContext\.persistence\.attach\(FS/);
    assert.match(client, /canonicalContext\.persistence\.save\(\)/);
    assert.match(client, /dataset\.etjsPersistence = 'ready'/);
    assert.match(client, /dataset\.etjsPersistenceSaves/);
    assert.match(client, /canonicalControllerFrame/);
    assert.match(client, /addLook\(-Number\(actions\.lookX/);
    assert.doesNotMatch(client, /(?:request|exit)PointerLock|webkitRequestPointerLock/,
      'only the canonical framework may own pointer lock');
    assert.doesNotMatch(client,
      /Preparing official game data|Downloading game data|local game cache|cached game data|files cached/,
      'normal loading copy must remain game-focused');
    assert.match(client, /frameworkCaptureIntent = true;\s*setFrameworkEngineState\('loading'\)/,
      'JOIN must publish trusted capture intent while honestly reporting loading');
    const join = client.split('etjsWakeAndJoin: function')[1]
      .split('etjsAdminCommand: function')[0];
    assert.match(join, /wasmShell\.showRuntime\(\)/,
      'JOIN must stay on the native runtime while connecting');
    assert.doesNotMatch(join, /showLoading\(\)|loadPanel\.hidden = false/,
      'JOIN must not reveal the launcher after native menu admission');
    assert.match(client, /frameworkCaptureIntent \? 'loading'/,
      'the native state pump must retain loading until the first active game state');
    assert.match(client, /hideLoadPanel\('gameplay'\);\s*frameworkCaptureIntent = false;/,
      'the first active cgame signal must transition capture intent into gameplay');
    assert.match(client, /if \(!canonicalContext\) \{\s*showInGameMenuWhenUncaptured\('pointer-lock-lost'\)/,
      'the legacy pointer-lock listener must not inject a second Escape under the framework');
    assert.match(html, /shared-shell\/wasm-game-framework\.js/);
    assert.match(html, /shared-shell\/wasm-game-framework\.css/);
    assert.match(html, /shared-shell\/wasm-game-bootstrap\.js/);
    assert.doesNotMatch(html, /WolfWasm|wolfwasm/);
    assert.match(html, /data-shell-launcher/);
    assert.match(html, /data-shell-runtime/);
    assert.match(html, /data-shell-canvas/);
    assert.match(html, /id="game-canvas"/);
    assert.match(html, /id="loading"/);
    assert.match(html, /id="loading-console"/);
    assert.match(html, /role="log"/);
    assert.match(html, /id="graphics-profile"/);
    assert.match(html, /id="dynamic-quality"/);
    assert.match(html, /id="fps-target"/);
  });

  it('delegates every canonical adapter lifecycle and input hook', async () => {
    const src = fs.readFileSync(path.join(WEB, 'game-adapter.js'), 'utf8');
    const calls = [];
    const inner = {};
    ['init', 'start', 'readEngineState', 'readCaptureIntent', 'resize', 'captureLost',
      'pointerMove', 'pointerButton', 'inputCaptureChanged', 'preferencesChanged',
      'controllerFrame', 'controllerChanged',
      'contextLost', 'contextRestored'].forEach((name) => {
      inner[name] = function () { calls.push([name, ...arguments]); return name; };
    });
    const sandbox = {
      window: { ETJSGameAdapter: inner },
      document: {
        createElement: () => ({}),
        head: { appendChild: (script) => script.onload() }
      },
      Promise: Promise
    };
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    const adapter = sandbox.window.WasmGameAdapter;
    await adapter.init({ shell: true });
    await adapter.start({ shell: true });
    adapter.readEngineState();
    adapter.readCaptureIntent();
    adapter.resize({ requestedWidth: 800, requestedHeight: 600 }, {});
    adapter.captureLost({}, {});
    adapter.pointerMove({ x: 320, y: 240 }, {}, {});
    adapter.pointerButton({ button: 0, pressed: true }, {}, {});
    adapter.inputCaptureChanged(true, {});
    adapter.preferencesChanged({ targetFps: 60 }, {});
    adapter.controllerFrame({ actions: {} }, {});
    adapter.controllerChanged({ activeIndex: null }, {});
    adapter.contextLost({}, {});
    adapter.contextRestored({}, {});
    assert.deepEqual(calls.map((entry) => entry[0]), [
      'init', 'start', 'readEngineState', 'readCaptureIntent', 'resize', 'captureLost',
      'pointerMove', 'pointerButton', 'inputCaptureChanged', 'preferencesChanged',
      'controllerFrame', 'controllerChanged',
      'contextLost', 'contextRestored'
    ]);
  });

  it('evaluates player-name.js in a browser-like environment', () => {
    const src = fs.readFileSync(path.join(WEB, 'js', 'player-name.js'), 'utf8');
    assertNoUnguardedNode(src, 'player-name.js');
    const store = {};
    const sandbox = {
      window: {},
      localStorage: {
        getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); }
      }
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    assert.equal(typeof sandbox.window.ETJSName.savePlayerName, 'function');
    sandbox.window.ETJSName.savePlayerName('BrowserTed');
    assert.equal(store['etjs.playerName'], 'BrowserTed');
    assert.equal(sandbox.window.ETJSName.loadPlayerName(), 'BrowserTed');
  });

  it('evaluates client.js in a browser-like environment without throwing', () => {
    const nameSrc = fs.readFileSync(path.join(WEB, 'js', 'player-name.js'), 'utf8');
    const src = fs.readFileSync(path.join(WEB, 'js', 'client.js'), 'utf8');
    const downloadSrc = fs.readFileSync(path.join(WEB, 'js', 'pk3-download.js'), 'utf8');
    assertNoUnguardedNode(src, 'client.js');
    assert.doesNotMatch(src, /\bmodule\.exports\b/);
    const store = {};
    const input = {
      classList: { add: () => {}, remove: () => {} },
      addEventListener: () => {},
      focus: () => {},
      value: '',
      hidden: true,
      textContent: '',
      clientWidth: 1024,
      clientHeight: 768,
      width: 1024,
      height: 768
    };
    const document = {
      getElementById: () => input,
      addEventListener: () => {},
      readyState: 'complete',
      body: { appendChild: () => {} },
      createElement: () => ({ addEventListener: () => {} })
    };
    const sandbox = {
      window: {
        addEventListener: () => {},
        location: { hostname: 'localhost', host: 'localhost:8080' }
      },
      document: document,
      console: console,
      localStorage: {
        getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); }
      }
    };
    sandbox.window.document = document;
    sandbox.window.localStorage = sandbox.localStorage;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(nameSrc, sandbox);
    vm.runInContext(downloadSrc, sandbox);
    assert.doesNotThrow(() => vm.runInContext(src, sandbox));
    assert.equal(typeof sandbox.window.ETJSName.loadPlayerName, 'function');
  });
});
