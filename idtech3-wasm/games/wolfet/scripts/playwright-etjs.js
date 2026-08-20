'use strict';
/**
 * Walk the real site startup: load bar → main menu → click Join Game → limbo → close limbo.
 * Does not inject connect / etjs_joingame.
 */
const fs = require('fs');
const path = require('path');
const input = require('../web/js/etjs-input.js');

const OUT = process.env.ETJS_SHOT_DIR || path.join(__dirname, '..', 'tmp-etjs-shots');
const URL = process.env.ETJS_URL || ('http://127.0.0.1:8088/?v=' + Date.now());
const SKY = { r: 118, g: 158, b: 208 };

function findPlaywright() {
  try {
    return require('playwright');
  } catch (err) {
    throw new Error('playwright is not installed; run npm install and npm run playwright:install');
  }
}

function from640(x640, y640, width, height, widescreenGame) {
  return input.from640(x640, y640, width, height, widescreenGame);
}

async function canvasStats(page) {
  return page.evaluate((sky) => {
    const canvas = document.getElementById('et-canvas');
    const load = document.getElementById('load-panel');
    let painted = 0, skyish = 0, total = 0, dataUrl = null, err = null;
    try {
      if (canvas && canvas.width) {
        const c2 = document.createElement('canvas');
        c2.width = Math.min(canvas.width, 640);
        c2.height = Math.min(canvas.height, 400);
        const ctx = c2.getContext('2d');
        ctx.drawImage(canvas, 0, 0, c2.width, c2.height);
        const img = ctx.getImageData(0, 0, c2.width, c2.height).data;
        for (let i = 0; i < img.length; i += 4) {
          total++;
          if (Math.abs(img[i] - sky.r) < 18 && Math.abs(img[i + 1] - sky.g) < 18 && Math.abs(img[i + 2] - sky.b) < 18) {
            skyish++;
          }
          if (img[i] > 8 || img[i + 1] > 8 || img[i + 2] > 8) painted++;
        }
        dataUrl = c2.toDataURL('image/png');
      }
    } catch (e) {
      err = String(e && e.message ? e.message : e);
    }
    let limbo = null;
    let ingame = null;
    let glState = null;
    try {
      const gl = canvas && canvas.getContext('webgl2');
      if (gl) {
        glState = {
          blend: gl.isEnabled(gl.BLEND),
          depth: gl.isEnabled(gl.DEPTH_TEST),
          depthMask: gl.getParameter(gl.DEPTH_WRITEMASK),
          srcRgb: gl.getParameter(gl.BLEND_SRC_RGB),
          dstRgb: gl.getParameter(gl.BLEND_DST_RGB),
          activeTexture: gl.getParameter(gl.ACTIVE_TEXTURE) - gl.TEXTURE0,
          boundTexture: (typeof GL !== 'undefined' && GL.textures)
            ? GL.textures.indexOf(gl.getParameter(gl.TEXTURE_BINDING_2D)) : null
        };
      }
    } catch (e) {
      glState = { error: String(e && e.message ? e.message : e) };
    }
    try {
      if (window.Module && typeof window.Module.ccall === 'function') {
        limbo = window.Module.ccall('ETJS_CvarInt', 'number', ['string'], ['etjs_limbo']);
        ingame = window.Module.ccall('ETJS_CvarInt', 'number', ['string'], ['etjs_ingame']);
      }
    } catch (e) {
      limbo = 'err';
    }
    return {
      loadHidden: !!(load && load.classList.contains('hidden')),
      painted, skyish, total, dataUrl, err, limbo, ingame,
      glState,
      nameGate: !!(document.getElementById('name-gate') &&
        !document.getElementById('name-gate').classList.contains('hidden'))
    };
  }, SKY);
}

async function readCvars(page, names) {
  return page.evaluate((requested) => {
    const ccall = window.Module && window.Module.ccall;
    const result = {};
    requested.forEach((name) => {
      result[name] = ccall
        ? ccall('ETJS_CvarInt', 'number', ['string'], [name])
        : 0;
    });
    return result;
  }, names);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const logs = [];
  const failures = [];
  const push = (s) => {
    logs.push(s);
    console.log(s);
    fs.writeFileSync(path.join(OUT, 'page-console.log'), logs.join('\n'));
  };
  const check = (condition, message) => {
    push((condition ? 'PASS ' : 'FAIL ') + message);
    if (!condition) {
      failures.push(message);
    }
  };

  let chromium;
  try {
    chromium = findPlaywright().chromium;
  } catch (e) {
    fs.writeFileSync(path.join(OUT, 'playwright-env.log'), String(e.stack || e));
    process.exit(2);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--disable-dev-shm-usage']
  });
  const page = await browser.newContext({ viewport: { width: 1280, height: 800 } }).then((c) => c.newPage());
  page.on('console', (msg) => push(msg.type() + ': ' + msg.text()));
  page.on('pageerror', (err) => push('PAGEERROR: ' + err.message));

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  await page.waitForSelector('#name-form', { timeout: 15000 });
  await page.fill('#player-name', 'ETPlayer');
  push('submit name form');
  await page.click('#name-submit');

  let st = null;
  for (let i = 0; i < 48; i++) {
    await page.waitForTimeout(1500);
    st = await canvasStats(page);
    push('boot' + i + ' load=' + st.loadHidden + ' painted=' + st.painted + ' limbo=' + st.limbo + ' ingame=' + st.ingame);
    if (logs.some((l) => /ETJS splash start/.test(l)) && !logs.some((l) => /ETJS splash skip|ETJS UIMENU_MAIN/.test(l))) {
      push('skip splash with Space');
      await page.keyboard.press('Space');
    }
    if (logs.some((l) => /ETJS UIMENU_MAIN/.test(l)) && st.loadHidden) {
      break;
    }
  }

  await page.screenshot({ path: path.join(OUT, 'menu-1.png') });
  if (st && st.dataUrl) {
    fs.writeFileSync(path.join(OUT, 'menu-1-canvas.png'), Buffer.from(st.dataUrl.split(',')[1], 'base64'));
  }
  push('menu painted=' + (st && st.painted) + ' nameGate=' + (st && st.nameGate));

  const join = input.JOIN_GAME_640;
  const click = from640(join.x + join.w * 0.5, join.y + join.h * 0.5, 1280, 800);
  push('click Join Game at ' + click.x.toFixed(0) + ',' + click.y.toFixed(0));
  await page.mouse.click(click.x, click.y);

  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(1000);
    if (logs.some((l) => /ETJS join name=|Connecting to|resolved to/.test(l))) {
      await page.screenshot({ path: path.join(OUT, 'after-join.png') });
      push('wrote after-join.png');
      break;
    }
  }

  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(2000);
    st = await canvasStats(page);
    push('join' + i + ' load=' + st.loadHidden + ' painted=' + st.painted + ' limbo=' + st.limbo + ' ingame=' + st.ingame);
    if (st.limbo === 1 || st.ingame === 1) {
      break;
    }
  }

  if (st && st.dataUrl) {
    fs.writeFileSync(path.join(OUT, 'browser-limbo.png'), Buffer.from(st.dataUrl.split(',')[1], 'base64'));
  }

  if (st && st.limbo === 1) {
    const allies = input.LIMBO_ALLIES_640;
    const alliesClick = from640(allies.x + allies.w * 0.5, allies.y + allies.h * 0.5, 1280, 800, true);
    push('click Allies at ' + alliesClick.x.toFixed(0) + ',' + alliesClick.y.toFixed(0));
    await page.mouse.move(alliesClick.x, alliesClick.y);
    await page.waitForTimeout(80);
    await page.mouse.click(alliesClick.x, alliesClick.y);
    await page.waitForTimeout(400);

    const ok = input.LIMBO_OK_640;
    const okClick = from640(ok.x + ok.w * 0.5, ok.y + ok.h * 0.5, 1280, 800, true);
    push('click OK at ' + okClick.x.toFixed(0) + ',' + okClick.y.toFixed(0));
    await page.mouse.move(okClick.x, okClick.y);
    await page.waitForTimeout(80);
    await page.mouse.click(okClick.x, okClick.y);
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(400);
      st = await canvasStats(page);
      push('ok' + i + ' limbo=' + st.limbo + ' ingame=' + st.ingame);
      if (st.limbo === 0) {
        break;
      }
    }

    if (st.limbo === 1) {
      const box = input.LIMBO_CANCEL_640;
      const cancel = from640(box.x + box.w * 0.5, box.y + box.h * 0.5, 1280, 800, true);
      push('click Cancel at ' + cancel.x.toFixed(0) + ',' + cancel.y.toFixed(0));
      await page.mouse.click(cancel.x, cancel.y);
      await page.waitForTimeout(500);
      st = await canvasStats(page);
    }
  }

  st = await canvasStats(page);
  if (st.dataUrl) {
    fs.writeFileSync(path.join(OUT, 'after-limbo-1.png'), Buffer.from(st.dataUrl.split(',')[1], 'base64'));
  }
  await page.screenshot({ path: path.join(OUT, 'after-limbo-1-page.png') });
  const frac = st.total ? st.skyish / st.total : 1;
  push('after-limbo painted=' + st.painted + ' skyFrac=' + frac.toFixed(3) + ' limbo=' + st.limbo + ' ingame=' + st.ingame
    + ' gl=' + JSON.stringify(st.glState));
  check(st.limbo === 0 && st.ingame === 1, 'joined match and closed limbo');
  check(frac < 0.4, 'world is rendered without sky-blue holes');

  if (st.limbo === 0 && st.ingame === 1) {
    await page.evaluate(() => {
      const c = document.getElementById('et-canvas');
      if (c) { c.focus(); }
      if (document.getElementById('viewport-frame')) {
        document.getElementById('viewport-frame').focus();
      }
    });
    await page.waitForTimeout(700);
    const before = await readCvars(page, ['etjs_ox', 'etjs_oy', 'etjs_fwd', 'etjs_viewyaw']);
    push('before-W ' + JSON.stringify(before));
    await page.keyboard.down('w');
    await page.waitForTimeout(900);
    const mid = await readCvars(page, ['etjs_ox', 'etjs_oy', 'etjs_fwd']);
    const moved = Math.hypot(mid.etjs_ox - before.etjs_ox, mid.etjs_oy - before.etjs_oy);
    const yawRadians = before.etjs_viewyaw * Math.PI / 180;
    const forwardDot = moved > 0 ? (
      (mid.etjs_ox - before.etjs_ox) * Math.cos(yawRadians) +
      (mid.etjs_oy - before.etjs_oy) * Math.sin(yawRadians)
    ) / moved : 0;
    push('hold-W ' + JSON.stringify(mid) + ' dOrg=' + moved.toFixed(0));
    check(mid.etjs_fwd === 127, 'W produces full forward input');
    check(moved > 20, 'W changes authoritative player origin');
    check(forwardDot > 0.75, 'W movement follows the rendered camera heading');
    await page.keyboard.up('w');
    await page.waitForTimeout(120);
    check((await readCvars(page, ['etjs_fwd'])).etjs_fwd === 0, 'W release clears forward input');

    const keyCases = [
      { key: 's', cvar: 'etjs_fwd', expected: -127, label: 'S produces backward input' },
      { key: 'a', cvar: 'etjs_right', expected: -127, label: 'A produces left strafe input' },
      { key: 'd', cvar: 'etjs_right', expected: 127, label: 'D produces right strafe input' },
      { key: 'Space', cvar: 'etjs_up', expected: 127, label: 'Space produces jump input' },
      { key: 'c', cvar: 'etjs_up', expected: -127, label: 'C produces crouch input' }
    ];
    for (const test of keyCases) {
      await page.keyboard.down(test.key);
      await page.waitForTimeout(120);
      const state = await readCvars(page, [test.cvar]);
      check(state[test.cvar] === test.expected, test.label);
      await page.keyboard.up(test.key);
      await page.waitForTimeout(60);
      check((await readCvars(page, [test.cvar]))[test.cvar] === 0, test.label.split(' produces')[0] + ' release clears input');
    }

    await page.keyboard.down('Tab');
    await page.waitForTimeout(250);
    check((await readCvars(page, ['etjs_scores'])).etjs_scores === 1, 'Tab opens the player scoreboard');
    await page.screenshot({ path: path.join(OUT, 'scoreboard-tab.png') });
    await page.keyboard.up('Tab');
    await page.waitForTimeout(100);
    check((await readCvars(page, ['etjs_scores'])).etjs_scores === 0, 'Tab release closes the player scoreboard');

    await page.evaluate(() => document.exitPointerLock && document.exitPointerLock());
    await page.waitForTimeout(150);
    const beforeLock = await readCvars(page, ['etjs_yaw', 'etjs_pitch']);
    await page.mouse.click(640, 400);
    await page.waitForTimeout(500);
    const afterLock = await readCvars(page, ['etjs_yaw', 'etjs_pitch']);
    check(Math.abs(afterLock.etjs_yaw - beforeLock.etjs_yaw) <= 2 &&
      Math.abs(afterLock.etjs_pitch - beforeLock.etjs_pitch) <= 2,
    'acquiring pointer lock does not jerk the view');

    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(120);
    check((await readCvars(page, ['etjs_atk'])).etjs_atk === 1, 'mouse1 produces attack input');
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    check((await readCvars(page, ['etjs_atk'])).etjs_atk === 0, 'mouse1 release clears attack input');

    const beforeLook = await readCvars(page, ['etjs_yaw']);
    await page.evaluate(() => {
      const ev = new MouseEvent('mousemove', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'movementX', { value: 24 });
      Object.defineProperty(ev, 'movementY', { value: 0 });
      window.dispatchEvent(ev);
    });
    await page.waitForTimeout(100);
    const afterLook = await readCvars(page, ['etjs_yaw']);
    check(afterLook.etjs_yaw !== beforeLook.etjs_yaw, 'pointer-locked mouse movement changes view yaw');

    st = await canvasStats(page);
    if (st.dataUrl) {
      fs.writeFileSync(path.join(OUT, 'browser-fire.png'), Buffer.from(st.dataUrl.split(',')[1], 'base64'));
    }
    push('input acceptance painted=' + st.painted + ' failures=' + failures.length);

    if (process.env.ETJS_FOLLOW_SCAN === '1') {
      const hookScan = process.env.ETJS_RSHOOK_SCAN === '1';
      const engineCommand = async (command) => page.evaluate((text) => {
        window.Module.ccall('Cbuf_AddText', null, ['string'], [text + '\n']);
      }, command);

      push('begin ' + (hookScan ? 'aimbot' : 'normal-render') + ' follow scan');
      await engineCommand('set cl_aimbot ' + (hookScan ? '1' : '0'));
      await engineCommand('team s');
      await page.waitForTimeout(1200);
      for (const clientNum of [1, 2, 3, 4, 5, 6, 8, 9, 12]) {
        await engineCommand('follow ' + clientNum);
        await page.waitForTimeout(700);
        await page.screenshot({
          path: path.join(OUT, 'follow-' + clientNum + '-' + (hookScan ? 'aimbot' : 'normal') + '.png')
        });
        if (hookScan) {
          /* The shell uses tcMod scroll; retain a nearby second frame so visual
           * acceptance can distinguish animation from a static color wash. */
          await page.waitForTimeout(350);
          await page.screenshot({
            path: path.join(OUT, 'follow-' + clientNum + '-aimbot-b.png')
          });
        }
      }
      push('finished ' + (hookScan ? 'aimbot' : 'normal-render') + ' follow scan');
    }
  }

  await browser.close();
  if (failures.length) {
    throw new Error('acceptance failures:\n- ' + failures.join('\n- '));
  }
})().catch((err) => {
  console.error(err);
  fs.writeFileSync(path.join(OUT, 'playwright-env.log'), String(err && err.stack || err));
  process.exit(1);
});
