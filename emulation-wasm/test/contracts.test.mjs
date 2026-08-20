import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { controllerProfileFor, controllerProfiles } from '../adapters/controller-profiles.mjs';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = file => JSON.parse(fs.readFileSync(path.join(repoDir, file), 'utf8'));
const require = createRequire(import.meta.url);

test('four variants and five image identities are locked', () => {
  const manifest = readJson('web/wasm-game.json');
  const images = readJson('images.json');
  assert.deepEqual(Object.keys(manifest.variants), ['nes', 'snes', 'ps1', 'ps2']);
  assert.deepEqual(images.images.map(image => image.name), [
    'emulation-wasm', 'nes-wasm', 'snes-wasm', 'ps1-wasm', 'ps2-wasm'
  ]);
  assert.deepEqual(images.images.map(image => image.variant), ['suite', 'nes', 'snes', 'ps1', 'ps2']);
  assert.ok(images.images.slice(1).every(image => image.locked === true));
});

test('all public statuses use the portfolio vocabulary', () => {
  const manifest = readJson('web/wasm-game.json');
  for (const variant of Object.values(manifest.variants)) {
    assert.equal(variant.status, 'Still in development');
    assert.equal(variant.runtimeReady, false);
  }
});

test('manifest declares framework-owned persistence and custom controller policy', () => {
  const manifest = readJson('web/wasm-game.json');
  assert.deepEqual(manifest.controller, {
    mode: 'custom', connectOnLauncher: true, allowKeyboardFallback: true
  });
  assert.equal(manifest.persistence.root, '/persistent/{variant}');
  assert.equal(manifest.persistence.requestDurability, true);
  assert.ok(manifest.persistence.intervalMs > manifest.persistence.debounceMs);
  assert.equal(manifest.displayMode, '4:3');
  assert.equal(manifest.syncBackbuffer, false,
    'SDL owns the backing store while the framework owns the 4:3 CSS rectangle');
});

test('adapter profiles cover each variant and preserve analog PS2 values', () => {
  assert.deepEqual(Object.keys(controllerProfiles), ['nes', 'snes', 'ps1', 'ps2']);
  for (const variant of Object.keys(controllerProfiles)) {
    const profile = controllerProfileFor(variant);
    assert.equal(profile.mode, 'custom');
    assert.equal(profile.keyboard.KeyW, 'dpad.up');
    assert.equal(profile.keyboard.KeyA, 'dpad.left');
    assert.equal(profile.actions['dpad.up'], `${variant}.up`);
    assert.equal(profile.actions['dpad.left'], `${variant}.left`);
    assert.equal(profile.gamepad.buttons[9], 'start');
    assert.ok(Object.isFrozen(profile));
  }
  assert.equal(controllerProfileFor('ps2').preserveAnalogButtonValues, true);
  assert.throws(() => controllerProfileFor('unknown'), /Unknown controller profile/);
});

test('downstream owns no framework document artifacts', () => {
  const forbidden = ['index.html', 'service-worker.js', 'app.webmanifest'];
  for (const name of forbidden) assert.equal(fs.existsSync(path.join(repoDir, 'web', name)), false);
  const css = fs.readdirSync(path.join(repoDir, 'web'), { recursive: true }).filter(name => String(name).endsWith('.css'));
  assert.deepEqual(css, []);
});

test('framework 0.9 normalizes the active fixed-plus-media suite fail closed', () => {
  const { normalizeManifestCollection } = require('../../wasm-game-framework/server/provisioning.js');
  const manifests = normalizeManifestCollection(readJson('web/wasm-game-data.json'));
  assert.deepEqual([...manifests.keys()], ['nes', 'snes', 'ps1', 'ps2']);
  assert.equal(manifests.get('nes').files.length, 0);
  assert.equal(manifests.get('nes').mediaLibrary.minimumEntries, 1);
  assert.equal(manifests.get('snes').mediaLibrary.maxFilesPerEntry, 1);
  assert.deepEqual(manifests.get('ps1').files.map(file => file.name), ['scph5500.bin']);
  assert.deepEqual(manifests.get('ps1').files[0].names, [
    'scph5500.bin', 'scph5501.bin', 'scph5502.bin',
    'scph1000.bin', 'scph1001.bin', 'scph1002.bin', 'psxonpsp660.bin', 'bios.bin'
  ]);
  assert.equal(manifests.get('ps1').mediaLibrary.validator.export, 'validateConsoleMediaBundle');
  assert.equal(manifests.get('ps2').mediaLibrary.maxBrowserCacheBytes, 0,
    'PS2 must fail closed until the range-backed random-access contract exists');
});

test('adapter uses the released controller, persistence, and selected-media contracts', () => {
  const adapter = fs.readFileSync(path.join(repoDir, 'web/game-adapter.js'), 'utf8');
  assert.match(adapter, /controllerFrame\(detail\)/);
  assert.match(adapter, /controllerChanged\(detail, context\)/);
  assert.doesNotMatch(adapter, /controllerInput|controllerConnected|controllerDisconnected/);
  assert.match(adapter, /context\.dataClient\.media\.load/);
  assert.match(adapter, /context\.dataClient\.load/);
  assert.match(adapter, /\['scph5500\.bin', 'scph5501\.bin', 'scph5502\.bin'\]/,
    'one validated firmware input is mounted under every Mednafen regional alias');
  assert.match(adapter, /_Emulation_BrowserSetAxis/,
    'PS1 analog sticks must cross the native adapter boundary');
  assert.match(adapter, /await context\.persistence\.attach/);
  assert.match(adapter, /context\.framework\.mountOwnerFiles/);
  assert.match(adapter, /requiresRandomAccessMedia/);
  assert.match(adapter, /resumeNativeAudio\(runtime\.module\)/);
  assert.match(adapter, /context\.showRuntime\('loading'\)[\s\S]*runtime\.module\.callMain/,
    'SDL must not initialize against a hidden zero-size canvas');
  assert.match(adapter, /Emulation_BrowserResize\?\.\(detail\.cssWidth, detail\.cssHeight\)/,
    'native SDL receives framework-computed logical dimensions');
  assert.match(adapter, /setCanvasSize\?\.\(detail\.cssWidth, detail\.cssHeight/,
    'native-managed canvas backing follows the same framework-computed rectangle');
  assert.doesNotMatch(adapter, /setCanvasSize\(detail\.requestedWidth/,
    'the adapter must not overwrite the framework/SDL backing store with raw viewport dimensions');
  assert.match(adapter, /setTimeout\(finish, 250\)/,
    'a browser that never settles AudioContext.resume() must not deadlock launch');
  assert.match(adapter, /runtime\.nativeLog\.slice\(-8\)\.join/,
    'native startup failures must preserve their actionable diagnostic tail');
  const staging = fs.readFileSync(path.join(repoDir, 'scripts/prepare-site.mjs'), 'utf8');
  assert.match(staging, /'wasm-game-data\.json'/,
    'every suite and locked image must ship the active declarative data policy');
  const images = fs.readFileSync(path.join(repoDir, 'scripts/build-images.sh'), 'utf8');
  assert.match(images, /requested = process\.argv\.slice\(3\)/,
    'development builds can select only variants with real runtime artifacts');
});

test('native browser host links the framework persistence backend', () => {
  const cmake = fs.readFileSync(path.join(repoDir, 'CMakeLists.txt'), 'utf8');
  assert.match(cmake, /-sFORCE_FILESYSTEM=1/);
  assert.match(cmake, /-lidbfs\.js/);
  assert.match(cmake, /'setCanvasSize'/);
  assert.match(cmake, /-sDISABLE_EXCEPTION_CATCHING=0/);
  assert.match(cmake, /-fexceptions/);
  assert.match(cmake, /_Emulation_BrowserAudioFrameCount/);
  assert.match(cmake, /_Emulation_BrowserSetAxis/);
  assert.match(cmake, /_Emulation_BrowserStateOperationStatus/);
  const host = fs.readFileSync(path.join(repoDir, 'engine/src/jg_browser_host.cpp'), 'utf8');
  assert.match(host, /jg_setup_audio\(\);[\s\S]*jg_game_load\(\)/,
    'audio buffers/spec must exist before a core creates streams during game load');
  assert.match(host, /pending_state_operation[\s\S]*emulation_host_save_state/,
    'browser save requests must serialize inside the native frame loop');
  assert.match(host, /jg_get_coreinfo\(kCoreSystemName\)/,
    'the shared host must select the requested subsystem before core initialization');
  const snes = fs.readFileSync(path.join(repoDir, 'cmake/variants/snes.cmake'), 'utf8');
  assert.match(snes, /-sASYNCIFY=1/);
  for (const database of ['boards.bml']) {
    assert.match(snes, new RegExp(`${database.replace('.', '\\.')}@/core/${database.replace('.', '\\.')}`));
  }
  for (const database of ['SuperFamicom.bml', 'BSMemory.bml', 'SufamiTurbo.bml']) {
    assert.match(snes, new RegExp(`empty-snes-database\\.bml@/core/${database.replace('.', '\\.')}`));
  }
  const ps1 = fs.readFileSync(path.join(repoDir, 'cmake/variants/ps1.cmake'), 'utf8');
  assert.match(ps1, /libmednafen-jg\.a/);
  assert.match(ps1, /-sPTHREAD_POOL_SIZE=2/);
  assert.match(host, /EMULATION_VARIANT_PS1/);
  assert.match(host, /firmware_root/);
});

test('normal launcher and README copy avoid storage boilerplate', () => {
  const manifest = readJson('web/wasm-game.json');
  const normal = [manifest.description, ...Object.values(manifest.variants).flatMap(value => [value.description, value.pwa.description])].join('\n');
  assert.doesNotMatch(normal, /\b(?:legal(?:ly)?|illegal|piracy|owner[- ]?(?:supplied|provided)|game data|cached?|uploaded?)\b/i);
  assert.doesNotMatch(fs.readFileSync(path.join(repoDir, 'README.md'), 'utf8'), /\b(?:legal(?:ly)?|illegal|piracy)\b/i);
});

test('source lock and shell scripts validate', () => {
  execFileSync(process.execPath, [path.join(repoDir, 'scripts/verify-source-lock.mjs')], { stdio: 'pipe' });
  for (const script of ['fetch-sources.sh', 'build-native-core.sh', 'build-web.sh', 'build-images.sh']) {
    const result = spawnSync('bash', ['-n', path.join(repoDir, 'scripts', script)], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
});

test('native core builder exposes only verified milestones', () => {
  const script = fs.readFileSync(path.join(repoDir, 'scripts/build-native-core.sh'), 'utf8');
  assert.match(script, /nestopia-jg\/nestopia\/libnestopia-jg\.a/);
  assert.match(script, /bsnes-jg\/bsnes\/libbsnes-jg\.a/);
  assert.match(script, /USE_VENDORED_SAMPLERATE=1/);
  assert.match(script, /0001-emscripten-fiber-backend\.patch/);
  const fiberPatch = fs.readFileSync(path.join(repoDir, 'patches/bsnes-jg/0001-emscripten-fiber-backend.patch'), 'utf8');
  assert.match(fiberPatch, /emscripten_fiber_init_from_current_context/);
  assert.match(fiberPatch, /emscripten_fiber_swap/);
  assert.match(script, /mednafen-jg\/jollygood\/mednafen\/libmednafen-jg\.a/);
  assert.match(script, /0001-emscripten-internal-codecs\.patch/);
  const mednafenPatch = fs.readFileSync(path.join(repoDir, 'patches/mednafen-jg/0001-emscripten-internal-codecs.patch'), 'utf8');
  assert.match(mednafenPatch, /zstd\/decompress\/zstd_decompress\.c/);
  assert.match(mednafenPatch, /defined\(__EMSCRIPTEN__\)/);
  assert.match(script, /existing Play! browser host is intentionally excluded/);
});

test('Play native build policy excludes its existing browser host', () => {
  const play = readJson('source-lock.json').sources.play;
  assert.deepEqual(play.excludedFromBuild, ['js/play_browser', 'Source/ui_js', 'build_cmake']);
  const runtimeSources = [
    'CMakeLists.txt', 'web/game-adapter.js', 'scripts/build-web.sh', 'scripts/prepare-site.mjs'
  ].map(file => fs.readFileSync(path.join(repoDir, file), 'utf8')).join('\n');
  assert.doesNotMatch(runtimeSources, /js\/play_browser|Source\/ui_js|generated Play\.wasm/);
});

test('framework lock names the tested 0.9.6 release exactly', () => {
  const lock = readJson('framework-lock.json');
  assert.equal(lock.version, '0.9.6');
  assert.equal(lock.status, 'released');
  assert.match(lock.commit, /^[0-9a-f]{40}$/);
  assert.equal(lock.commit, 'ad0226db55a2925bb250c6e31ca6786bd0dc73bd');
  assert.ok(lock.requiredContracts.includes('variant-scoped-persistence'));
  assert.ok(lock.requiredContracts.includes('launch-card-controller-connection'));
  assert.ok(lock.requiredContracts.includes('media-library-provisioning'));
  assert.ok(lock.requiredContracts.includes('atomic-multi-file-media'));
  assert.ok(lock.requiredContracts.includes('selected-media-browser-cache'));
  assert.ok(lock.requiredContracts.includes('bounded-storage-durability'));
  assert.ok(lock.requiredContracts.includes('direct-media-selection'));
  assert.ok(lock.requiredContracts.includes('bounded-parallel-media-restore'));
});
