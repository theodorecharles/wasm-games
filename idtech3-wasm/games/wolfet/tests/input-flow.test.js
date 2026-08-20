'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const input = require(path.join(ROOT, 'web', 'js', 'etjs-input.js'));

describe('shipped input helpers (window map, WASD, attack)', () => {
  it('maps a canvas-center click to 320,240 across the full window (QuakeJS stretch)', () => {
    const rect = { left: 0, top: 0, width: 1280, height: 800 };
    const mid = input.letterboxTo640(640, 400, rect);
    assert.ok(Math.abs(mid.x - 320) < 1, 'x=' + mid.x);
    assert.ok(Math.abs(mid.y - 240) < 1, 'y=' + mid.y);
  });

  it('maps contained UI through an aspect-preserving centered 640x480 viewport', () => {
    const rect = { left: 0, top: 0, width: 1280, height: 800 };
    const mid = input.letterboxTo640(640, 400, rect, true);
    assert.ok(Math.abs(mid.x - 320) < 1, 'x=' + mid.x);
    assert.ok(Math.abs(mid.y - 240) < 1, 'y=' + mid.y);
    assert.ok(Math.abs(mid.xoff - (1280 - 640 * (800 / 480)) / 2) < 1,
      'xoff=' + mid.xoff);
    const pagePoint = input.from640(495, 463, 1280, 800, true);
    const roundTrip = input.letterboxTo640(pagePoint.x, pagePoint.y, rect, true);
    assert.ok(Math.abs(roundTrip.x - 495) < 1, 'roundTrip.x=' + roundTrip.x);
    assert.ok(Math.abs(roundTrip.y - 463) < 1, 'roundTrip.y=' + roundTrip.y);
  });

  it('exposes the JOIN GAME control in 640 space so a page click can hit it', () => {
    assert.ok(input.JOIN_GAME_640);
    assert.equal(input.clickHitsRect(
      input.JOIN_GAME_640.x + 10,
      input.JOIN_GAME_640.y + 10,
      input.JOIN_GAME_640
    ), true);
  });

  it('maps a known limbo OK region inside 640x480', () => {
    const rect = { left: 0, top: 0, width: 1280, height: 800 };
    /* OK is roughly 470,430 in 640 space on the official panel */
    const mapped = input.letterboxTo640(890, 717, rect);
    assert.ok(input.clickHitsRect(mapped.x, mapped.y, { x: 430, y: 400, w: 100, h: 50 }));
  });

  it('exposes the official limbo Cancel hit box', () => {
    assert.ok(input.LIMBO_CANCEL_640);
    assert.equal(input.clickHitsRect(584, 463, input.LIMBO_CANCEL_640), true);
    assert.equal(input.clickHitsRect(575, 452, input.LIMBO_CANCEL_640), false);
    assert.ok(input.LIMBO_ALLIES_640);
    assert.equal(input.clickHitsRect(539, 210, input.LIMBO_ALLIES_640), true);
  });

  it('WASD held state becomes a non-zero move command', () => {
    assert.deepEqual(input.moveFromHeld({ KeyW: true }), { forward: 1, right: 0, up: 0 });
    assert.deepEqual(input.moveFromHeld({ KeyS: true, KeyD: true }), { forward: -1, right: 1, up: 0 });
    assert.deepEqual(input.moveFromHeld({}), { forward: 0, right: 0, up: 0 });
  });

  it('mouse1 attacks once play has started, even without pointer lock', () => {
    assert.equal(input.shouldFireOnMouseDown(true, false, false), true);
    assert.equal(input.shouldFireOnMouseDown(true, false, true), true);
    assert.equal(input.shouldFireOnMouseDown(true, true, false), false);
    assert.equal(input.shouldFireOnMouseDown(false, false, false), false);
  });

  it('engine SetMove is added onto the usercmd in CL_KeyMove', () => {
    const src = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'client', 'cl_input.c'), 'utf8');
    assert.match(src, /void ETJS_SetMove/);
    assert.match(src, /etjsMoveForward/);
    assert.match(src, /cmd->forwardmove/);
    assert.match(src, /BUTTON_TALK/);
    assert.match(src, /etjs_limbo/);
    assert.match(src, /etjs_intermission/);
    assert.match(src, /do not set BUTTON_TALK from leftover catchers/);
    assert.match(src, /kb\[KB_FORWARD\]\.active/);
  });

  it('page pumps SetMove from held WASD and does not steal those keys from SDL', () => {
    const client = fs.readFileSync(path.join(ROOT, 'web', 'js', 'client.js'), 'utf8');
    assert.match(client, /requestAnimationFrame\(pumpMove\)/);
    assert.match(client, /resolveCode/);
    assert.match(client, /KeyW: '\+forward'/);
    const onKeyDown = client.split('function onKeyDown')[1].split('function onKeyUp')[0];
    assert.match(onKeyDown, /K_CONSOLE/);
    assert.match(onKeyDown, /isConsoleEvent/);
    assert.match(client, /K_CONSOLE = 297/);
    const menuBranch = (onKeyDown.split('if (uiOpen())')[1] || '').split('if (typingMode)')[0];
    assert.match(menuBranch, /ev\.preventDefault\(\);\s*ev\.stopImmediatePropagation\(\);/);
    const worldBranch = onKeyDown.split('var key = CODE_TO_KEY[code]')[1] || '';
    assert.match(worldBranch, /if \(bareControl\(code\)\)[\s\S]*else[\s\S]*ev\.preventDefault/);
    const typingBranch = onKeyDown.split('if (typingMode)')[1].split('var key = CODE_TO_KEY[code]')[0];
    assert.match(typingBranch, /ev\.key\.length === 1[\s\S]*sendChar\(ev\.key\.codePointAt\(0\)\)/);
    assert.match(client, /function sendChar[\s\S]*_ETJS_CharEvent/);
  });

  it('delegates native menu input while the framework alone owns pointer lock', () => {
    const client = fs.readFileSync(path.join(ROOT, 'web', 'js', 'client.js'), 'utf8');
    assert.doesNotMatch(client, /(?:request|exit)PointerLock|webkitRequestPointerLock/);
    assert.match(client, /offsetWidth/);
    assert.match(client, /setCanvasSize/);
    const mouseDown = client.split('function onMouseDown')[1].split('function onMouseUp')[0];
    assert.match(mouseDown, /held\['mouse'/);
    assert.match(mouseDown, /uiOpen\(\)/);
    assert.match(client, /canonicalPointerMove = function[\s\S]*pushCursorPoint\(detail\.x, detail\.y\)/);
    assert.match(client, /canonicalPointerButton = function[\s\S]*sendKey\(mkey, 1\)/);
    assert.match(client, /canonicalInputCaptureChanged = function/);
    assert.match(client, /cvarInt\('etjs_uiopen'\)/);
    assert.match(client, /cvarInt\('cl_aimbotmenu'\)/);
    assert.match(client, /if \(uiOpen\(\)\) \{\s*move = \{ forward: 0, right: 0, up: 0 \};/);
    assert.match(client, /if \(openUi && !wasUiOpen\) \{\s*releaseInputHolds\(\);/);
    assert.match(client, /function engineWantsKeys\(\)/);
    assert.match(client, /if \(!engineWantsKeys\(\)\)/);
    assert.match(client, /cvarInt\('etjs_console'\)/);
    const consoleGate = client.split('if (isConsoleEvent(ev, initialCode))')[1] || '';
    assert.match(consoleGate, /sendKey\(K_CONSOLE, 1\)[\s\S]*sendKey\(K_CONSOLE, 0\)/);
    assert.ok(client.indexOf('if (isConsoleEvent(ev, initialCode))') <
      client.indexOf('if (!engineWantsKeys())'),
      'console key must be handled before the capture gate');
  });

  it('raises JOIN capture intent synchronously inside the trusted native button dispatch', () => {
    const client = fs.readFileSync(path.join(ROOT, 'web', 'js', 'client.js'), 'utf8');
    const nativeInput = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'client', 'cl_input.c'), 'utf8');
    const nativeMain = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'client', 'cl_main.c'), 'utf8');
    const menu = fs.readFileSync(path.join(ROOT, 'runtime', 'legacy', 'ui', 'etjs_main.menu'), 'utf8');
    const pointerButton = client.split('canonicalPointerButton = function')[1]
      .split('canonicalInputCaptureChanged = function')[0];
    const wakeAndJoin = client.split('etjsWakeAndJoin: function')[1]
      .split('etjsAdminCommand: function')[0];
    assert.match(pointerButton, /sendKey\(mkey, 1\)/);
    assert.match(pointerButton, /sendKey\(mkey, 0\)/);
    assert.match(client, /function sendKey[\s\S]*M\._ETJS_KeyEvent/);
    assert.match(nativeInput, /void ETJS_KeyEvent[\s\S]*CL_KeyEvent\(key, down \? qtrue : qfalse/);
    assert.match(menu, /exec "etjs_joingame"/);
    assert.match(nativeMain, /CL_EtjsJoin_f[\s\S]*Module\['etjsWakeAndJoin'\]\(UTF8ToString\(\$0\)\)/);
    assert.match(wakeAndJoin, /frameworkCaptureIntent = true;[\s\S]*setFrameworkEngineState\('loading'\)/);
    assert.match(wakeAndJoin, /wasmShell\.showRuntime\(\)/,
      'JOIN must remain on the native game surface while connecting');
    assert.doesNotMatch(wakeAndJoin, /showLoading\(\)|loadPanel\.hidden = false/,
      'JOIN must never return to the launcher loading card');
    assert.match(wakeAndJoin, /engineCmd\('connect ' \+ connectAddress\);[\s\S]*return Promise\.resolve\(\)/);
  });

  it('starts at maximum graphics and adapts toward the chosen FPS target', () => {
    const client = fs.readFileSync(path.join(ROOT, 'web', 'js', 'client.js'), 'utf8');
    assert.match(client, /set r_picmip 0/);
    assert.match(client, /set r_textureMode GL_LINEAR_MIPMAP_LINEAR/);
    assert.match(client, /set r_ext_texture_filter_anisotropic 16/);
    assert.match(client, /name: 'maximum'/);
    assert.match(client, /selectedFpsTarget \* 0\.92/);
    assert.match(client, /selectedFpsTarget \* 0\.985/);
    assert.match(client, /lowFpsWindows >= 2/);
    assert.match(client, /highFpsWindows >= 5/);
    assert.match(client, /qualityLevel < qualityCeiling/);
    assert.match(client, /etjs_autoQuality/);
  });
});
