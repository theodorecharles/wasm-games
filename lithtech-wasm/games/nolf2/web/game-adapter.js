/* global WasmGameAdapter, WasmGameFramework */
'use strict';

const STATES = Object.freeze([
  'launcher', 'menu', 'loading', 'gameplay', 'paused', 'debrief', 'crashed'
]);

let module = null;
let captureIntent = false;

function createOwnerData() {
  return WasmGameFramework.createOwnerDataSet({
    namespace: 'nolf2-wasm',
    version: 'retail-rez-v1',
    validator: {
      module: '/data-validator.mjs',
      export: 'validateLithRez',
      version: 'rezmgr-v1',
      maxReadBytes: 256,
      maxTotalReadBytes: 2048
    },
    files: [
      { key: 'game', name: 'GAME.REZ', path: 'GAME.REZ', size: 224475015 },
      { key: 'game2', name: 'GAME2.REZ', path: 'GAME2.REZ', size: 1138259607 },
      { key: 'sound', name: 'SOUND.REZ', path: 'SOUND.REZ', size: 360255681 },
      { key: 'gamedll', name: 'GAMEDLL.REZ', path: 'GAMEDLL.REZ', size: 6304090 },
      { key: 'engine', name: 'Engine.REZ', path: 'Engine.REZ', size: 102162 }
    ]
  });
}

function nativeState() {
  if (!module || typeof module._lith_host_state !== 'function') return 'launcher';
  return STATES[module._lith_host_state()] || 'crashed';
}

function paint() {
  if (!module || typeof module._lith_present !== 'function') return;
  module._lith_present();
  const ptr = module._lith_frame();
  const srcW = module._lith_host_frame_width();
  const srcH = module._lith_host_frame_height();
  const canvas = document.querySelector('canvas');
  if (!canvas || !ptr) return;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const src = new ImageData(new Uint8ClampedArray(module.HEAPU8.subarray(ptr, ptr + srcW * srcH * 4)), srcW, srcH);
  if (canvas.width === srcW && canvas.height === srcH) {
    ctx.putImageData(src, 0, 0);
    return;
  }
  const off = document.createElement('canvas');
  off.width = srcW;
  off.height = srcH;
  off.getContext('2d').putImageData(src, 0, 0);
  ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
}

function loop() {
  if (!module) return;
  if (typeof module._lith_host_tick === 'function') module._lith_host_tick(1 / 60);
  paint();
  requestAnimationFrame(loop);
}

globalThis.WasmGameAdapter = Object.freeze({
  async init(context) {
    context.log('NOLF 2 host init');
  },

  async start(context) {
    context.showLoading();
    context.setLoading('Validating NOLF 2 archives…', '', 8);
    const prepared = await context.dataClient.load(createOwnerData(), {
      onProgress(detail) {
        const pct = 8 + Math.min(50, Number(detail && detail.percent) || 0) * 0.5;
        context.setLoading('Validating NOLF 2 archives…', detail && detail.file || '', pct);
      }
    });

    const factoryMod = await import('/nolf2-game.mjs');
    const factory = factoryMod.default || factoryMod.createNolf2Game;
    module = await factory({ noInitialRun: true });
    if (context.persistence) {
      await context.persistence.attach(module.FS, {
        root: context.persistence.root,
        allowUnsupported: !module.FS?.filesystems?.IDBFS
      });
    }
    try { module.FS.mkdir('/game'); } catch (_e) {}
    if (typeof context.framework?.mountOwnerFiles === 'function') {
      await context.framework.mountOwnerFiles(module, prepared, { root: '/game' });
    }

    const dirPtr = module.stringToNewUTF8 ? module.stringToNewUTF8('/game') : 0;
    if (dirPtr) {
      module._lith_host_init(dirPtr);
      module._free(dirPtr);
    }

    const held = new Set();
    const syncKeys = () => {
      if (!module) return;
      let flags = 0;
      if (held.has('KeyW') || held.has('ArrowUp')) flags |= 1;
      if (held.has('KeyS') || held.has('ArrowDown')) flags |= 2;
      if (held.has('KeyD') || held.has('ArrowRight')) flags |= 4;
      if (held.has('KeyA') || held.has('ArrowLeft')) flags |= 8;
      if (held.has('ControlLeft') || held.has('ControlRight')) flags |= 32;
      if (held.has('ShiftLeft') || held.has('ShiftRight')) flags |= 512;
      module._lith_host_set_controls(flags);
    };
    window.addEventListener('keydown', (event) => {
      held.add(event.code);
      if (event.code === 'KeyE' || event.code === 'KeyF') module && module._lith_host_gadget();
      if (event.code === 'Space' || event.code === 'KeyG') {
        if (nativeState() === 'menu') {
          captureIntent = true;
          module && module._lith_host_new_game();
        }
      }
      syncKeys();
    });
    window.addEventListener('keyup', (event) => {
      held.delete(event.code);
      syncKeys();
    });
    context.showRuntime(nativeState());
    requestAnimationFrame(loop);
  },

  readEngineState() {
    return nativeState();
  },

  readCaptureIntent() {
    return captureIntent;
  },

  pointerButton(detail) {
    if (nativeState() === 'menu' && detail && detail.down) {
      captureIntent = true;
      if (module) module._lith_host_new_game();
    }
    if (nativeState() === 'gameplay' && detail && detail.down && module) {
      module._lith_host_fire();
    }
  },

  pointerMove(detail) {
    if (!module || !detail) return;
    if (detail.captured && nativeState() === 'gameplay') {
      module._lith_host_look(detail.movementX * 0.004, -detail.movementY * 0.004);
    }
  },

  captureLost() {
    captureIntent = false;
    if (module && nativeState() === 'gameplay') {
      module._lith_host_set_controls(0);
    }
  }
});
