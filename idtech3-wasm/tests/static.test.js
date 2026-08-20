'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const json = relative => JSON.parse(read(relative));

const lock = json('sources.lock.json');
assert.deepEqual(lock.framework, {
  repository: 'https://github.com/theodorecharles/wasm-game-framework.git',
  version: '0.9.4',
  commit: 'c4ad3b9e075f881d32f044299fbfeee703a9169d'
});
for (const manifest of [
  'games/quake3/site/framework-install.json',
  'games/rtcw/site/framework-install.json',
  'games/wolfet/framework-install.json'
]) {
  assert.deepEqual(json(manifest), {
    name: '@wasm-game-framework/browser',
    version: lock.framework.version,
    commit: lock.framework.commit
  });
}
assert.equal(lock.quake3.commit, '977b188e05b239b6c48d7ecda9d04e9ca03f1578');
assert.equal(lock.quake3.ioq3Commit, '4f7d7bf2159aa0a18b79bb417aa760abac817b2a');
assert.equal(lock.quake3.downstreamCommit, 'a1732e3ea8c6f0d681a4d3551e5d5eca9fd66cf7');
assert.equal(lock.quake3.downstreamCommitterDate, '2026-08-14T20:15:00-04:00');
assert.equal(lock.quake3.downstreamCommitterName, 'Ted Charles');
assert.equal(lock.quake3.downstreamCommitterEmail, 'me@tedcharles.net');
assert.equal(lock.rtcw.commit, '438e7d413b5f7277187c35b032eb0ef9093ae778');
assert.equal(lock.rtcw.downstreamCommit, 'e9782a8dcef5cf6b37f60713f7add55025d72a4e');
assert.equal(lock.rtcw.downstreamTree, '256dd10dde2e7d7418bfa0d4c8c0caa570131577');
assert.equal(lock.rtcw.downstreamCommitterName, 'Ted Charles');
assert.equal(lock.rtcw.downstreamCommitterEmail, 'me@tedcharles.net');
assert.deepEqual(lock.wolfet, {
  engineRepository: 'https://github.com/etlegacy/etlegacy.git',
  engineCommit: 'a44ab4f396370a694109da33df901d85f6fe9626',
  enginePatchSha256: '85860f7cb861497f4034eca07eb80fc27084c0685c0366d5b8071cb7c7885b58',
  modePatchSha256: '2c8d57920f43171d91f286a56ad9bf42313ff554acfcc083e477a710d35c0188',
  eth32PatchSha256: 'b08f5dc8b6d9c30b2b3221442d9f019d32c320c99882a08e8888d24215090a09',
  humanSlotPatchSha256: 'b23718ffaa0923e493d0e6ea69378de37b130e910ca406d37b4a3682f8ad1dee',
  uiPatchSha256: 'dcaf80689108a232c701cdf5df39b7775008fbcd0f8ad13423876e55720b72d8',
  icon192Sha256: '35dca9bc3a14a0f185b8ae8e2139dfed28112b77edec03658c1b45a1d8658325',
  icon512Sha256: '58c928d725ab6a8d8e2844869ad2e744e296012d31f63e27a823164f35342852'
});

const framework = childProcess.spawnSync('sh', ['scripts/assert-framework.sh'], {
  cwd: root,
  encoding: 'utf8'
});
assert.equal(framework.status, 0, framework.stderr);
assert.match(framework.stdout, /wasm-game-framework/);
const prepareSource = read('scripts/prepare-source.sh');
assert.match(prepareSource, /GIT_COMMITTER_NAME=.*downstreamCommitterName/);
assert.match(prepareSource, /GIT_COMMITTER_EMAIL=.*downstreamCommitterEmail/);
assert.match(prepareSource, /rev-parse HEAD.*rtcw\.downstreamCommit/);
const prepareWolfET = read('scripts/prepare-wolfet-source.sh');
assert.match(prepareWolfET, /GAME="\$ROOT\/games\/wolfet"/);
assert.match(prepareWolfET, /cp -a "\$GAME\/\." "\$TREE\/"/);
assert.doesNotMatch(prepareWolfET, /git -C "\$SOURCE" archive/);
assert.doesNotMatch(prepareWolfET, /WOLFET_WASM_SOURCE_DIR|WOLFET_ICON_DIR|wolfetjs/);
assert.match(prepareWolfET, /enginePatchSha256/);
assert.match(prepareWolfET, /modePatchSha256/);
assert.match(prepareWolfET, /eth32PatchSha256/);
assert.match(prepareWolfET, /humanSlotPatchSha256/);
assert.match(prepareWolfET, /uiPatchSha256/);
assert.match(prepareWolfET, /icon\$\{size\}Sha256/);
assert.match(prepareWolfET, /menuCursor/);
assert.doesNotMatch(prepareWolfET, /game-data|runtime\/etmain\/.*\.pk3/);
assert.ok(fs.existsSync(path.join(root, 'games/wolfet/web/game-adapter.js')));
assert.ok(fs.existsSync(path.join(root, 'games/wolfet/server/supervisor.js')));
assert.ok(fs.existsSync(path.join(root, 'games/wolfet/Dockerfile')));
assert.equal(json('games/wolfet/web/wasm-game.json').menuCursor, 'native');
assert.equal(json('games/wolfet/web/wasm-game.json').adapter, '/game-adapter.js');
assert.match(read('games/wolfet/runtime/legacy/ui/etjs_ingame.menu'),
  /YESNOACTION\([\s\S]*setcvar cl_aimbotmenu 0,\s*_\("Enable or disable aimbot"\)/);
assert.doesNotMatch(read('games/wolfet/runtime/legacy/ui/etjs_ingame.menu'),
  /YESNOACTION\([\s\S]*tooltip _\("Enable or disable aimbot"\)/);
const buildQ3 = read('scripts/build-q3-image.sh');
const buildRTCW = read('scripts/build-rtcw-images.sh');
const buildWolfET = read('scripts/build-wolfet-image.sh');
assert.match(buildQ3, /quake3-wasm:devel/);
assert.doesNotMatch(buildQ3, /idtech3-quake3-wasm/);
assert.match(buildRTCW, /rtcw-sp-wasm:devel/);
assert.match(buildRTCW, /rtcw-mp-wasm:devel/);
assert.doesNotMatch(buildRTCW, /idtech3-rtcw-/);
assert.match(buildWolfET, /wolfet-wasm:devel/);
assert.doesNotMatch(buildWolfET, /idtech3-wolfet-wasm/);
assert.match(buildWolfET, /--platform linux\/amd64/);
assert.match(buildWolfET, /web\/index\.html/);
assert.match(buildWolfET, /web\/service-worker\.js/);
assert.match(buildWolfET, /web\/app\.webmanifest/);
assert.match(buildWolfET, /games\/wolfet/);
const packageManifest = json('package.json');
assert.equal(packageManifest.scripts['prepare:wolfet'], 'sh scripts/prepare-wolfet-source.sh');
assert.equal(packageManifest.scripts['image:wolfet'], 'sh scripts/build-wolfet-image.sh');

const patchHashes = {
  'patches/quake3/0001-Add-framework-join-and-lifecycle-QVM-hooks.patch': 'c5e6db4ce78ae894171ed6c5f14133110149ce8d2d1d6f97b2df1241683c4351',
  'patches/rtcw/0001-Add-canonical-RTCW-browser-source-scaffold.patch': '6a708390ab21b71f8dc018096362c83cc1e4cf5fb0b441dee3cddc380eea5cf4',
  'patches/rtcw/0002-Add-RTCW-framework-browser-integration-seams.patch': 'f76be42b2b8ee6a24c37f8593eee742efd0878007aed7aba7db8259056f6b26c',
  'patches/rtcw/0003-Fix-RTCW-browser-viewport-and-legacy-GL-state.patch': '79bcfb64632735147ea13f4ed2e33e1f4a9934c14ecd5d1a397d89b5854de183',
  'patches/rtcw/0004-Fix-RTCW-browser-menu-transitions-and-pointer-input.patch': '05764a0b7557c7c45b1f2ed5261bdf783acc68864337b08f51ca0ae620f6bebb',
  'patches/rtcw/0005-Add-managed-RTCW-multiplayer-join-seam.patch': '6b37c27f0b73b7c168323ba8edb8e96279188702734ccbe2f93f93d9278da7c5',
  'patches/rtcw/0006-Align-RTCW-artifact-test-with-framework-shell.patch': '1441325958c4242bd58e981afab9e8af9ce5feb5356fdc981db474d597716a55',
  'patches/rtcw/0007-Add-dedicated-OmniBot-fill-for-RTCW-multiplayer.patch': 'a6e32f39916d3dd16ec58ba4321aa5cca79e20d8c04595ab5c2729489f9ce426',
  'patches/rtcw/0008-Add-Emscripten-WebSocket-transport-for-RTCW-MP.patch': '2aeec1f02f487ad64a3b90a217f5246b6a4672bd2540adac2dfa340394640c48',
  'patches/rtcw/0009-Pump-SOCKFS-packets-each-browser-frame-like-WolfET.patch': 'b1b564c09f7b6fbbe45a068ff67a7374de939b211e68385c8012d6ab8cac7494',
  'patches/rtcw/0010-Fix-WebGL-black-world-software-mips-and-two-pass-lightmaps.patch': '4cfeabe64d977d4d474946846207889c962faeaae453fe4bb75e495db4957511',
  'patches/rtcw/0011-Brighten-Emscripten-lightmaps-and-software-gamma.patch': '9d1fabda834ef6386e5b23dca31d6ef479aec41ed8b13c64e88860655834176b',
  'patches/rtcw/0012-Fix-WebGL-lightmapped-world-sequential-TMU-and-RGBA-mips.patch': '210be9affbf57412021b8d30fb2eb41a9c7461927c64abd951b4ab385b18f028',
  'patches/rtcw/0013-Restore-world-albedo-and-wire-rshook-cgame-QVM.patch': '0e153cd4040c2f421c2497e274052426a03058ada83e93dd3b9ec3187be6c465',
  'patches/rtcw/0014-Draw-lightmaps-before-albedo-on-WebGL.patch': 'f52e7f4f5936b39b083bfb9a691b6aaa6e43cfd87f1f3747d58cbdeeaac00a2c',
  'patches/rtcw/0015-Fix-rshook-colors-and-aim-snap.patch': 'aed8227f1e61d7f8cdcc907824b2670af3efe53313d4940c85911c935bc8d1c3',
  'patches/rtcw/0016-Draw-map-albedo-before-lightmaps-on-WebGL.patch': '62ee4ddae8e19a7ae4d1235ee9b5edacb8467d9dc7496711e54c8f19e3c7c072',
  'patches/rtcw/0017-Multiply-map-albedo-and-lightmaps-in-one-WebGL-shader.patch': '12e5ee24817105801d901cbd1129dcc5444b13c43e85e66f2cf86c4346ccde70',
  'patches/rtcw/0018-Bind-WebGL-lightmaps-on-TMU1-and-use-BSP-lightmap-UVs.patch': '3edb35ac2a2d0046ed885c32ba1b1cb262864673e6b6062218d6f95cb53b4e6a'
};
for (const [relative, expected] of Object.entries(patchHashes)) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex');
  assert.equal(actual, expected, relative);
}
const q3Game = json('games/quake3/site/wasm-game.json');
const q3Data = json('games/quake3/site/wasm-game-data.json');
assert.equal(Object.hasOwn(q3Game, 'description'), false);
assert.equal(q3Game.pwa.description, 'Quake III Arena for the browser.');
assert.equal(q3Game.adapter, '/game-adapter.js');
assert.equal(q3Game.displayMode, 'dynamic');
assert.equal(q3Game.resizeTransition, 'immediate');
assert.equal(q3Game.menuCursor, 'native');
assert.deepEqual([q3Game.pointerWidth, q3Game.pointerHeight, q3Game.pointerFit], [640, 480, 'contain']);
assert.equal(q3Game.fullscreen, true);
assert.equal(q3Game.controller.mode, 'disabled');
assert.equal(q3Game.persistence.root, '/persistent/quake3');
assert.ok(q3Game.pwa.icons.some(icon => icon.sizes === 'any'));
assert.ok(q3Game.pwa.icons.some(icon => icon.sizes === '512x512'));
assert.equal(q3Data.files.length, 9);
q3Data.files.forEach((file, index) => {
  assert.equal(file.name, `pak${index}.pk3`);
  assert.match(file.sha256, /^[a-f0-9]{64}$/);
});

const q3Patch = read('patches/quake3/0001-Add-framework-join-and-lifecycle-QVM-hooks.patch');
assert.match(q3Patch, /JOIN GAME/);
assert.match(q3Patch, /ui_joinGameRequested/);
assert.match(q3Patch, /ui_joinGameName/);
assert.match(q3Patch, /ui_joinGameIssued/);
assert.match(q3Patch, /WASM_HUMAN_JOINED/);
assert.match(q3Patch, /WASM_HUMAN_LEFT/);
assert.match(q3Patch, /WASM_BOT_JOINED/);
assert.match(q3Patch, /WASM_BOT_LEFT/);
assert.match(q3Patch, /WebGL has no GL_TEXTURE_BORDER_COLOR pname/);
assert.match(q3Patch, /#ifndef __EMSCRIPTEN__/);
assert.doesNotMatch(q3Patch, /^\+.*s_main\.(singleplayer|multiplayer)/m);
assert.match(q3Patch, /^\+\s*s_main\.joinGame\.string\s*= "JOIN GAME";/m);
assert.match(q3Patch, /^\+\s*s_main\.credits\.string\s*= "CREDITS";/m);
assert.match(q3Patch, /Menu_AddItem\( &s_main\.menu,\s*&s_main\.joinGame \);[\s\S]*Menu_AddItem\( &s_main\.menu,\s*&s_main\.setup \);[\s\S]*Menu_AddItem\( &s_main\.menu,\s*&s_main\.cinematics \);[\s\S]*Menu_AddItem\( &s_main\.menu,\s*&s_main\.credits \);/);
assert.doesNotMatch(q3Patch, /^\+.*s_main\.(demos|mods|teamArena|exit)/m);
assert.match(q3Patch, /^\+\s*case ID_CREDITS:\s*$/m);
assert.match(q3Patch, /^\+\s*UI_CreditMenu\(\);\s*$/m);
assert.doesNotMatch(q3Patch, /^\+.*trap_Cmd_ExecuteText.*quit/m);
assert.match(q3Patch, /^\s+case ID_LEAVEARENA:\s*$/m);
assert.match(q3Patch, /^\s+case ID_QUIT:\s*$/m);
assert.match(q3Patch, /^\+\s*trap_Cmd_ExecuteText\( EXEC_APPEND, "disconnect\\n" \);/m);
assert.doesNotMatch(q3Patch, /^\+.*"(START|ADD BOTS|REMOVE BOTS|TEAM ORDERS|RESTART ARENA)"/m);
assert.match(q3Patch, /^-\s*if\( !UI_CanShowTierVideo\( 1 \) \) \{/m);
assert.match(q3Patch, /^-\s*if\( !UI_CanShowTierVideo\( 8 \) \) \{/m);
assert.match(q3Patch, /trap_Cvar_Set\( "ui_captureIntent", "1" \)/);
assert.match(q3Patch, /uis\.cursorx = 320;[\s\S]*uis\.cursory = 240;/);
assert.match(q3Patch, /CG_SetInitialSnapshot[\s\S]*trap_Cvar_Set\( "cg_wasmActive", "1" \)/);
assert.match(q3Patch, /CG_Init[\s\S]*trap_Cvar_Set\( "cg_wasmActive", "0" \)/);
assert.match(q3Patch, /UI_ApplyWasmResize/);
assert.match(q3Patch, /trap_Cmd_ExecuteText\( EXEC_NOW, "vid_restart fast\\n" \)/);
assert.match(q3Patch, /CG_ApplyWasmResize/);
assert.match(q3Patch, /cg_wasmResizeSerial/);
assert.match(q3Patch, /trap_SendConsoleCommand\( "vid_restart fast\\n" \)/);
assert.match(q3Patch, /UI_ApplyWasmPointer/);
assert.match(q3Patch, /ui_wasmPointerSerial/);
assert.match(q3Patch, /ui_wasmPointerAppliedX/);
assert.match(q3Patch, /ui_wasmCaptureTarget", "join"/);
assert.match(q3Patch, /ui_wasmCaptureTarget", "resume"/);
const rtcwPatch = read('patches/rtcw/0001-Add-canonical-RTCW-browser-source-scaffold.patch');
assert.doesNotMatch(rtcwPatch, /diff --git a\/.*(?:index\.html|service-worker\.js|app\.webmanifest|\.css)\b/);
const rtcwBrowserPatch = read('patches/rtcw/0002-Add-RTCW-framework-browser-integration-seams.patch');
assert.doesNotMatch(rtcwBrowserPatch, /diff --git a\/.*(?:index\.html|service-worker\.js|app\.webmanifest|\.css)\b/);
assert.match(rtcwBrowserPatch, /RTCW_BrowserRuntimeState/);
assert.match(rtcwBrowserPatch, /RTCW_BrowserControllerReleaseAll/);
assert.match(rtcwBrowserPatch, /RTCW_BrowserPersistenceChanged/);
assert.match(rtcwBrowserPatch, /GLimp_BrowserResize/);
const q3Adapter = read('games/quake3/site/game-adapter.js');
assert.match(q3Adapter, /ownerFilesMounted/);
assert.match(q3Adapter, /if \(ownerFilesMounted\) \{\s*callback\(null\);/);
assert.match(q3Adapter, /noExitRuntime: true/);
assert.match(q3Adapter, /'com_hunkMegs', '128'/);
const q3Rewrite = read('games/quake3/scripts/rewrite-quakejs.js');
assert.match(q3Rewrite, /pname === 0x1004/);
assert.match(q3Rewrite, /GL_TEXTURE_BORDER_COLOR is not a WebGL pname/);
assert.match(q3Rewrite, /canSkip = false/);
assert.match(q3Rewrite, /preserveDrawingBuffer: true/);
assert.match(q3Rewrite, /GL_UNSIGNED_INT/);
assert.match(q3Rewrite, /GLImmediate\.indexData\[i\] = HEAPU32/);
assert.match(q3Rewrite, /GLImmediate\.flush\(count, 0, indices, type\)/);
assert.match(q3Adapter, /module\.setCanvasSize\(lastResize\.width, lastResize\.height, true\)/);
assert.match(q3Adapter, /setCvar\('ui_wasmResizeSerial', resizeSerial\)/);
assert.match(q3Adapter, /setCvar\('cg_wasmResizeSerial', resizeSerial\)/);
assert.match(q3Adapter, /const playerName = cleanName\(context\.preferences\.values\(\)\.playerName\)/);
assert.match(q3Adapter, /setCvar\('ui_joinGameName', playerName\)/);
assert.match(q3Adapter, /getCvar\('ui_captureIntent'\) === '1'/);
assert.match(q3Adapter, /readCaptureIntent\(\)/);
assert.match(q3Adapter, /menu && getCvar\('ui_captureIntent'\) === '1'\) return 'loading'/);
assert.doesNotMatch(q3Adapter, /if \(getCvar\('ui_captureIntent'\) === '1'\) return 'gameplay'/);
assert.match(q3Adapter, /dataset\.q3NativeViewport/);
assert.match(q3Adapter, /dataset\.q3NativeName/);
assert.match(q3Adapter, /dataset\.q3JoinIssued/);
assert.doesNotMatch(q3Adapter, /Restoring Quake III PAKs|Browser cache and container files|Starting the QuakeJS engine/);
assert.match(q3Adapter, /\[engine state\]/);
assert.match(q3Adapter, /if \(nativeEngineState\(\) === 'gameplay'\) pushEscape\(\)/);
assert.doesNotMatch(q3Adapter, /setTimeout\(\(\) => \{\s*if \(nativeEngineState\(\) === 'gameplay'\) pushEscape\(\)/);
assert.match(q3Adapter, /setCvar\('ui_wasmPointerX', Math\.round\(detail\.x\)\)/);
assert.match(q3Adapter, /setCvar\('ui_wasmPointerY', Math\.round\(detail\.y\)\)/);
assert.match(q3Adapter, /setCvar\('ui_wasmPointerSerial', pointerSerial\)/);
assert.doesNotMatch(q3Adapter, /pushMouseMove\(detail\.x, detail\.y/);
assert.match(q3Adapter, /captureGestureTarget = getCvar\('ui_wasmCaptureTarget'\)/);
assert.match(q3Adapter, /dataset\.q3CaptureGesture = target/);
assert.match(q3Adapter, /inputCaptureChanged\(captured\)/);
assert.match(q3Adapter, /getCvar\('cg_wasmActive'\) === '1'[\s\S]*document\.pointerLockElement === context\.elements\.canvas[\s\S]*getCvar\('ui_captureIntent'\) === '1'/);
assert.doesNotMatch(q3Adapter, /if \(captured && getCvar\('ui_captureIntent'\) === '1'\)/);
assert.match(q3Adapter, /dataset\.q3AudioState/);
assert.match(q3Adapter, /dataset\.q3ResizeRequested/);
assert.match(q3Adapter, /dataset\.q3ResizeCvarWrite/);
assert.doesNotMatch(q3Adapter, /Math\.max\(640, (?:lastResize\.|detail\.)/);
assert.doesNotMatch(q3Adapter, /Math\.max\(480, (?:lastResize\.|detail\.)/);
assert.match(q3Adapter, /Math\.max\(2, detail\.requestedWidth\)/);
assert.match(q3Adapter, /Math\.max\(2, detail\.requestedHeight\)/);
assert.match(q3Adapter, /createQualityController/);
assert.match(q3Adapter, /context\.persistence\.attach\(globalThis\.FS/);
assert.match(q3Adapter, /'fs_homepath', context\.persistence\.root/);
assert.match(q3Adapter, /dataset\.q3Persistence = 'ready'/);
assert.match(q3Adapter, /dataset\.q3PersistenceSaves/);
assert.match(q3Rewrite, /FS\.filesystems = \{ MEMFS: MEMFS, IDBFS: IDBFS \}/);
assert.match(q3Adapter, /controllerFrame\(detail\)/);
assert.match(q3Adapter, /controllerChanged\(detail\)/);
assert.match(q3Adapter, /pushMouseMove\(0, 0, Number\(actions\.lookX/);
assert.equal(q3Game.identity, true);
assert.equal(q3Game.graphics, true);
assert.equal(q3Game.pointerLock, true);
assert.equal(q3Game.defaultFullscreen, false);
assert.match(q3Game.provisioningText, /PAK files/);
const q3Server = read('games/quake3/server/server.cfg');
assert.match(q3Server, /seta sv_maxclients 9/);
assert.match(q3Server, /seta bot_minplayers 8/);
assert.match(q3Server, /q3dm6/);
assert.match(q3Server, /q3dm17/);
const q3Supervisor = read('games/quake3/server/supervisor.js');
assert.match(q3Supervisor, /WASM_HUMAN_JOINED/);
assert.match(q3Supervisor, /bots: botClients\.size/);
assert.match(q3Supervisor, /MAP_ROTATION/);
assert.match(q3Supervisor, /websocket proxy upgrade path=/);
assert.match(q3Supervisor, /createPasswordGate/);
assert.match(q3Supervisor, /passwordGate\.authenticated\(request\)/);
assert.match(q3Supervisor, /createProvisioningStore/);
assert.doesNotMatch(q3Supervisor, /staticRequest\('\/game-data\/status'\)/,
  'native readiness must not depend on a public child HTTP request');

const rtcwGame = json('games/rtcw/site/wasm-game.json');
const rtcwData = json('games/rtcw/site/wasm-game-data.json');
assert.deepEqual(Object.keys(rtcwGame.variants), ['rtcw-sp', 'rtcw-mp']);
assert.equal(rtcwGame.nativeManaged, true);
assert.equal(rtcwGame.pointerLock, true);
assert.equal(rtcwGame.pointerWidth, 640);
assert.equal(rtcwGame.pointerHeight, 480);
assert.equal(rtcwGame.displayMode, '4:3');
assert.equal(rtcwGame.pointerFit, 'contain');
assert.equal(rtcwGame.graphics, true);
assert.equal(rtcwGame.controller.mode, 'disabled');
assert.equal(rtcwGame.variants['rtcw-sp'].persistence.root, '/persistent/rtcw-sp');
assert.equal(rtcwGame.variants['rtcw-mp'].persistence.root, '/persistent/rtcw-mp');
assert.equal(rtcwGame.menuCursor, 'native');
assert.equal(rtcwGame.variants['rtcw-sp'].identity, false);
assert.equal(rtcwGame.variants['rtcw-mp'].identity, true);
assert.equal(rtcwGame.variants['rtcw-sp'].pwa.description, 'Return to Castle Wolfenstein for the browser.');
assert.equal(rtcwGame.variants['rtcw-mp'].pwa.description, 'Return to Castle Wolfenstein Multiplayer for the browser.');
assert.equal(rtcwData.variants['rtcw-sp'].files.length, 5);
assert.equal(rtcwData.variants['rtcw-mp'].files.length, 15);
assert.equal(rtcwData.version, 'retail-paks-sha256-v1');
for (const variant of Object.values(rtcwGame.variants)) {
  assert.ok(variant.pwa.icons.some(icon => icon.sizes === 'any'));
  assert.ok(variant.pwa.icons.some(icon => icon.sizes === '512x512'));
}
const rtcwAdapter = read('games/rtcw/site/game-adapter.js');
assert.match(rtcwAdapter, /context\.persistence\.attach\(module\.FS/);
assert.match(rtcwAdapter, /context\.persistence\.root/);
assert.match(rtcwAdapter, /mountOwnerFiles\(module\.FS/);
assert.match(rtcwAdapter, /module\.callMain\(engineArguments\(values\)\)/);
assert.match(rtcwAdapter, /_RTCW_Browser\$\{name\}/);
assert.doesNotMatch(rtcwAdapter, /controllerFrame\(detail\)/);
assert.doesNotMatch(rtcwAdapter, /controllerChanged\(detail\)/);
assert.doesNotMatch(rtcwAdapter, /ControllerReleaseAll/);
assert.match(rtcwAdapter, /readCaptureIntent\(\)/);
assert.match(rtcwAdapter, /inputCaptureChanged\(captured\)/);
assert.match(rtcwAdapter, /ResizeRequested/);
assert.match(rtcwAdapter, /PointerPosition/);
assert.match(rtcwAdapter, /stopImmediatePropagation/);
assert.match(read('games/rtcw/site/game-adapter.js'), /createWakeClient/);
assert.match(read('patches/rtcw/0008-Add-Emscripten-WebSocket-transport-for-RTCW-MP.patch'), /-lwebsocket\.js/);
const rtcwMode = read('games/rtcw/server/mode.js');
assert.match(rtcwMode, /RTCW_MODE/);
assert.match(rtcwMode, /arcade/);
assert.match(rtcwMode, /vanilla/);
assert.match(read('games/rtcw/docker/Dockerfile.mp'), /RTCW_MODE=arcade/);
assert.match(read('games/rtcw/server/supervisor.js'), /g_arcade/);
assert.match(read('games/rtcw/server/supervisor.js'), /require\('\.\/mode'\)/);
assert.match(rtcwAdapter, /\/ws/);
assert.match(rtcwAdapter, /showRuntime\('loading'\)/);
assert.doesNotMatch(rtcwAdapter, /showLoading\(/);
assert.match(rtcwAdapter, /mp_wasm\.pk3/);
assert.match(rtcwAdapter, /sp_wasm\.pk3/);
assert.doesNotMatch(rtcwAdapter, /zz_wasm_/);
assert.match(rtcwAdapter, /setDisplay/);
assert.match(rtcwAdapter, /displayMode: '4:3'/);
assert.match(rtcwAdapter, /displayMode: 'dynamic'/);
assert.match(rtcwAdapter, /cssWidth \|\| detail\.requestedWidth/);
const rtcwMpMenu = read('games/rtcw/site/menus/src/mp/ui_mp/main.menu');
assert.match(rtcwMpMenu, /text "JOIN GAME"/);
assert.match(rtcwMpMenu, /rect 3 396 210 18/);
assert.match(rtcwMpMenu, /textalign 1/);
assert.match(rtcwMpMenu, /setcvar ui_wasmJoinRequested 1/);
assert.doesNotMatch(rtcwMpMenu, /open joinserver/);
assert.doesNotMatch(rtcwMpMenu, /open quit_popmenu/);
assert.match(rtcwMpMenu, /name quit[\s\S]*visible 0/);
assert.match(rtcwMpMenu, /name play[\s\S]*visible 0/);
const rtcwSpMenu = read('games/rtcw/site/menus/src/sp/ui/main.menu');
assert.match(rtcwSpMenu, /name playselection[\s\S]*visible 0/);
assert.doesNotMatch(rtcwSpMenu, /open multi_popmenu/);
const rtcwJoinStub = read('games/rtcw/site/menus/src/mp/ui_mp/joinserver.menu');
assert.match(rtcwJoinStub, /setcvar ui_wasmJoinRequested 1/);
assert.match(rtcwJoinStub, /open main/);
assert.ok(fs.existsSync(path.join(root, 'games/rtcw/site/menus/mp_wasm.pk3')));
assert.ok(fs.existsSync(path.join(root, 'games/rtcw/site/menus/sp_wasm.pk3')));
assert.ok(!fs.existsSync(path.join(root, 'games/rtcw/site/menus/zz_wasm_mp.pk3')));
const rtcwViewportPatch = read('patches/rtcw/0003-Fix-RTCW-browser-viewport-and-legacy-GL-state.patch');
assert.match(rtcwViewportPatch, /UI_BROWSER_RESIZE/);
assert.match(rtcwViewportPatch, /CG_BROWSER_RESIZE/);
assert.match(rtcwViewportPatch, /RTCW_BrowserPointerPosition/);
assert.match(rtcwViewportPatch, /GL_UNSAFE_OPTS=0/);
const rtcwMenuPatch = read('patches/rtcw/0004-Fix-RTCW-browser-menu-transitions-and-pointer-input.patch');
assert.match(rtcwMenuPatch, /_UI_SetActiveMenu\( UIMENU_NONE \)/);
assert.match(rtcwMenuPatch, /JOIN GAME/);
assert.match(rtcwMenuPatch, /ui_wasmJoinRequested/);
assert.match(rtcwMenuPatch, /framework supplies an absolute 640x480 UI cursor/);
const rtcwJoinPatch = read('patches/rtcw/0005-Add-managed-RTCW-multiplayer-join-seam.patch');
assert.match(rtcwJoinPatch, /RTCW_BrowserJoinRequested/);
assert.match(rtcwJoinPatch, /RTCW_BrowserJoinServer/);
assert.match(rtcwJoinPatch, /127\.0\.0\.1:27960/);
assert.doesNotMatch(rtcwAdapter, /Still in development/);
const buildRtcw = read('scripts/build-rtcw-images.sh');
assert.match(buildRtcw, /build-web-sp\.sh/);
assert.match(buildRtcw, /build-web-mp\.sh/);
assert.match(read('scripts/pack-rtcw-menus.py'), /rewrites mp_\* -> zz_\*/);
assert.match(buildRtcw, /pack-rtcw-menus\.py/);
assert.match(buildRtcw, /site\/menus/);
assert.match(buildRtcw, /iowolfsp\.wasm/);
assert.match(buildRtcw, /iowolfmp\.wasm/);
assert.match(read('patches/rtcw/0008-Add-Emscripten-WebSocket-transport-for-RTCW-MP.patch'), /-lwebsocket\.js/);
assert.doesNotMatch(read('games/rtcw/site/game-adapter.js'), /subprotocol:/);
assert.match(read('games/rtcw/site/game-adapter.js'), /\/ws/);
assert.match(read('games/rtcw/site/game-adapter.js'), /net_port', '27951'/);
assert.match(read('patches/rtcw/0009-Pump-SOCKFS-packets-each-browser-frame-like-WolfET.patch'), /NET_Sleep\(0\)/);
assert.match(read('patches/rtcw/0009-Pump-SOCKFS-packets-each-browser-frame-like-WolfET.patch'), /SOCKFS/);
assert.match(read('patches/rtcw/0010-Fix-WebGL-black-world-software-mips-and-two-pass-lightmaps.patch'), /GL_GENERATE_MIPMAP/);
assert.match(read('patches/rtcw/0010-Fix-WebGL-black-world-software-mips-and-two-pass-lightmaps.patch'), /GLS_SRCBLEND_DST_COLOR/);
assert.match(read('patches/rtcw/0011-Brighten-Emscripten-lightmaps-and-software-gamma.patch'), /r_gamma/);
assert.match(read('patches/rtcw/0012-Fix-WebGL-lightmapped-world-sequential-TMU-and-RGBA-mips.patch'), /disabling multitexture on WebGL/);
assert.match(read('patches/rtcw/0012-Fix-WebGL-lightmapped-world-sequential-TMU-and-RGBA-mips.patch'), /internalFormat = GL_RGBA/);
assert.match(read('games/rtcw/site/game-adapter.js'), /r_ext_multitexture', '0'/);
assert.match(read('games/rtcw/site/game-adapter.js'), /r_ignoreFastPath', '1'/);
assert.match(read('patches/rtcw/0013-Restore-world-albedo-and-wire-rshook-cgame-QVM.patch'), /CollapseMultitexture/);
assert.match(read('patches/rtcw/0013-Restore-world-albedo-and-wire-rshook-cgame-QVM.patch'), /PERS_TEAM/);
assert.match(read('patches/rtcw/0014-Draw-lightmaps-before-albedo-on-WebGL.patch'), /Lightmap first/);
assert.match(read('patches/rtcw/0015-Fix-rshook-colors-and-aim-snap.patch'), /rshookglow/);
assert.match(read('patches/rtcw/0016-Draw-map-albedo-before-lightmaps-on-WebGL.patch'), /RB_DrawAlbedoThenLightmap/);
assert.match(read('patches/rtcw/0017-Multiply-map-albedo-and-lightmaps-in-one-WebGL-shader.patch'), /RB_ES2_DrawLightmap/);
assert.match(read('patches/rtcw/0017-Multiply-map-albedo-and-lightmaps-in-one-WebGL-shader.patch'), /d \* l \* v_color/);
assert.match(read('patches/rtcw/0018-Bind-WebGL-lightmaps-on-TMU1-and-use-BSP-lightmap-UVs.patch'), /tess\.texCoords\[id\]\[1\]/);
assert.match(read('patches/rtcw/0015-Fix-rshook-colors-and-aim-snap.patch'), /delta_angles/);
assert.match(read('scripts/pack-rtcw-menus.py'), /\.shader/);
assert.match(read('games/rtcw/site/menus/src/mp/scripts/rshook.shader'), /rgbGen entity/);
assert.match(read('games/rtcw/site/game-adapter.js'), /r_greyscale', '0'/);
assert.doesNotMatch(read('games/rtcw/site/game-adapter.js'), /r_gamma', '1\.5'/);
assert.doesNotMatch(read('games/rtcw/site/game-adapter.js'), /r_intensity', '1\.4'/);
assert.match(read('patches/rtcw/0009-Pump-SOCKFS-packets-each-browser-frame-like-WolfET.patch'), /-.*trap_BotAllocateClient/);

const readme = read('README.md');
assert.match(readme, /\| Wolfenstein: Enemy Territory \| Live \|/);
assert.match(readme, /\| Quake III Arena \| Still in development \|/);
assert.match(readme, /\| Return to Castle Wolfenstein SP\/MP \| Still in development \|/);
assert.match(readme, /Unified id Tech 3 selector image \| Still in development \| Omitted/);
assert.doesNotMatch(readme, /image:suite/);
assert.match(readme, /npm run image:wolfet/);
assert.match(readme, /WASM_GAME_PASSWORD/);
assert.match(readme, /same secret/);
assert.match(readme, /framework 0\.9\.4 metadata/);
assert.doesNotMatch(readme, /framework 0\.7 metadata/);
assert.doesNotMatch(readme, new RegExp(`\\b${'partial' + 'ly'}\\b`, 'i'));
assert.doesNotMatch(readme, new RegExp(`\\b${'most' + 'ly'}\\b`, 'i'));

for (const file of [
  'games/quake3/site/game-adapter.js',
  'games/quake3/server/supervisor.js',
  'games/quake3/scripts/rewrite-quakejs.js',
  'games/quake3/scripts/rewrite-quakejs-dedicated.js',
  'games/rtcw/site/game-adapter.js',
  'games/wolfet/web/game-adapter.js',
  'games/wolfet/server/supervisor.js'
]) {
  const syntax = childProcess.spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
  assert.equal(syntax.status, 0, `${file}: ${syntax.stderr}`);
}

console.log('static family pins, manifests, adapters, and compatibility checks passed');
