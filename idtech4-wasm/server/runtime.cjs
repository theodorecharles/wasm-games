'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {queryStatus} = require('./status.cjs');

function createManagedRuntime(options) {
  const env = options.environment || process.env;
  const {IdleServiceSupervisor, environmentOptions} = require(path.join(options.frameworkRoot, 'server/lifecycle.js'));
  const {createProvisioningStore} = require(path.join(options.frameworkRoot, 'server/provisioning.js'));
  const manifest = JSON.parse(fs.readFileSync(path.join(options.siteRoot, 'wasm-game-data.json'), 'utf8')).variants?.['doom3-mp'];
  if (!manifest) throw new Error('Doom 3 multiplayer data policy is missing.');
  const data = createProvisioningStore({manifest, dataRoot: options.dataRoot, validatorRoot: options.siteRoot});
  const map = env.D3_MANAGED_MAP || 'game/mp/d3dm1';
  if (!/^game\/mp\/d3dm[1-5]$/.test(map)) throw new Error('Unsupported managed Doom 3 map.');
  let roster = null;
  let active = null;
  let browserPeers = 0;
  const log = options.log || (line => process.stdout.write(line + '\n'));
  const alive = handle => handle.child.exitCode === null && handle.child.signalCode === null && !handle.spawnError;

  async function stop(handle) {
    if (handle.stopping) return handle.stopping;
    handle.stopping = (async () => {
      clearInterval(handle.pollTimer);
      options.onDisconnect?.();
      if (alive(handle)) await new Promise(resolve => {
        const timer = setTimeout(() => handle.child.kill('SIGKILL'), 5000);
        handle.child.once('exit', () => { clearTimeout(timer); resolve(); });
        handle.child.kill('SIGTERM');
      });
      // This path is exclusively created by mkdtemp below, never owner data.
      await fsp.rm(handle.workdir, {recursive: true, force: true});
      if (active === handle) { active = null; roster = null; }
    })();
    return handle.stopping;
  }

  async function start() {
    const installed = await data.status();
    if (!installed.ready) {
      const error = new Error('Doom 3 multiplayer files are not installed or failed validation.');
      error.statusCode = 409;
      throw error;
    }
    const workdir = await fsp.mkdtemp(path.join(os.tmpdir(), 'd3-managed-'));
    let handle;
    try {
      for (const policy of data.manifest.files) {
        // Only the nine validated retail packs enter this session. No owner
        // autoexec, saved config, arbitrary mods or platform game DLLs load.
        if (!/^base\/pak00[0-8]\.pk4$/.test(policy.path)) throw new Error('Unexpected Doom 3 server data policy.');
        const target = path.join(workdir, policy.path);
        await fsp.mkdir(path.dirname(target), {recursive: true});
        await fsp.symlink(data.filePath(policy), target);
      }
      const args = ['+set', 'fs_basepath', workdir, '+set', 'fs_cdpath', workdir,
        '+set', 'fs_savepath', path.join(workdir, 'save'), '+set', 'fs_configpath', path.join(workdir, 'save'),
        '+set', 'net_ip', '127.0.0.1', '+set', 'net_port', String(options.port),
        '+set', 'net_LANServer', '1', '+set', 'si_pure', '0',
        '+set', 'si_name', 'Browser Doom 3 Deathmatch', '+set', 'si_gameType', 'deathmatch',
        '+set', 'si_maxPlayers', '8', '+set', 'si_warmup', '0',
        '+set', 'si_map', map, '+spawnServer'];
      const child = spawn(path.join(options.nativeRoot, 'dhewm3ded'), args, {
        cwd: workdir, stdio: ['ignore', 'pipe', 'pipe'], env
      });
      handle = {child, workdir, output: '', stopping: null, pollTimer: null, spawnError: null};
      active = handle;
      const capture = chunk => {
        handle.output = (handle.output + chunk).slice(-65536);
        log(`[doom3ded] ${String(chunk).trimEnd()}`);
      };
      child.stdout.on('data', capture);
      child.stderr.on('data', capture);
      child.once('error', error => { handle.spawnError = error; });
      child.once('exit', (code, signal) => {
        log(`Doom 3 dedicated exited code=${code} signal=${signal || '-'}`);
        if (!handle.stopping && lifecycle.status().state === 'running') {
          void lifecycle.sleep('dedicated process exited').catch(error => log(error.message));
        }
      });
      const deadline = Date.now() + Math.max(1000, Number(env.D3_START_TIMEOUT_MS) || 45000);
      let lastError;
      while (Date.now() < deadline) {
        if (!alive(handle)) throw handle.spawnError || new Error('Doom 3 dedicated exited before readiness.');
        try {
          roster = await queryStatus({port: options.port, timeoutMs: 500});
          if (roster.map !== map || roster.gameType.toLowerCase() !== 'deathmatch') throw new Error('Doom 3 started the wrong match.');
          lifecycle.observeHumans(browserPeers);
          let failures = 0;
          let polling = false;
          handle.pollTimer = setInterval(async () => {
            if (polling || handle.stopping) return;
            polling = true;
            try { roster = await queryStatus({port: options.port}); failures = 0; }
            catch (error) {
              log(`Doom 3 status: ${error.message}`);
              if (++failures >= 3 && !handle.stopping) void lifecycle.sleep('dedicated status unavailable').catch(error => log(error.message));
            } finally { polling = false; }
          }, 5000);
          handle.pollTimer.unref();
          return handle;
        } catch (error) { lastError = error; await new Promise(resolve => setTimeout(resolve, 200)); }
      }
      throw new Error(`Doom 3 did not become ready: ${lastError?.message || 'timeout'}`);
    } catch (error) {
      // Framework wake() clears a failed handle; clean it up here first so a
      // failed launch cannot leak a process, socket or disposable directory.
      if (handle) await stop(handle);
      else await fsp.rm(workdir, {recursive: true, force: true});
      throw error;
    }
  }
  const lifecycle = new IdleServiceSupervisor({
    ...environmentOptions(env), maps: [map], start, stop,
    onStatus: status => options.onStatus?.(status)
  });
  return Object.freeze({
    wake: () => lifecycle.wake(),
    sleep: reason => lifecycle.sleep(reason),
    observePeers(count) { browserPeers = count; lifecycle.observeHumans(count); },
    status: () => ({...lifecycle.status(), map, connect: '127.0.0.1:27666',
      protocol: roster?.protocol || null, players: roster?.players || [],
      browserPeers, bots: 0, botStatus: 'not-installed'}),
    async shutdown() {
      // A wake in flight must finish/fail before sleeping; the framework's
      // generic sleep() does not wait for pendingWake on its own.
      if (lifecycle.pendingWake) await lifecycle.pendingWake.catch(() => {});
      await lifecycle.sleep('shutdown');
    }
  });
}
module.exports = {createManagedRuntime};
