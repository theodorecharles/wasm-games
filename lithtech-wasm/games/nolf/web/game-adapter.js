/* global WasmGameAdapter, WasmGameFramework */
'use strict';

const STATES = Object.freeze([
  'launcher', 'menu', 'loading', 'gameplay', 'paused', 'debrief', 'crashed'
]);

let module = null;
let captureIntent = false;

function createOwnerData() {
  return WasmGameFramework.createOwnerDataSet({
    namespace: 'nolf-wasm',
    version: 'goty-1003-rez-v1',
    validator: {
      module: '/data-validator.mjs',
      export: 'validateLithRez',
      version: 'rezmgr-v1',
      maxReadBytes: 256,
      maxTotalReadBytes: 2048
    },
    files: [
      { key: 'nolf', name: 'NOLF.REZ', path: 'NOLF.REZ', size: 618254258 },
      { key: 'nolf2', name: 'NOLF2.REZ', path: 'NOLF2.REZ', size: 300703727 },
      { key: 'nolfgoty', name: 'NOLFGOTY.REZ', path: 'NOLFGOTY.REZ', size: 170190784 },
      { key: 'nolfu003', name: 'nolfu003.rez', path: 'nolfu003.rez', size: 18194503 },
      { key: 'nolfcres003', name: 'NOLFCRES003.REZ', path: 'NOLFCRES003.REZ', size: 745674 }
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
    context.log('NOLF 1 host init');
  },

  async start(context) {
    context.showLoading();
    context.setLoading('Validating NOLF GOTY archives…', '', 8);
    const prepared = await context.dataClient.load(createOwnerData(), {
      onProgress(detail) {
        const pct = 8 + Math.min(50, Number(detail && detail.percent) || 0) * 0.5;
        context.setLoading('Validating NOLF GOTY archives…', detail && detail.file || '', pct);
      }
    });

    const factoryMod = await import('/nolf-game.mjs');
    const factory = factoryMod.default || factoryMod.createNolfGame;
    module = await factory({ noInitialRun: true });
    if (context.persistence) {
      await context.persistence.attach(module.FS, {
        root: context.persistence.root,
        allowUnsupported: !module.FS?.filesystems?.IDBFS
      });
    }
    try { module.FS.mkdir('/game'); } catch (_e) {}
    for (const entry of prepared.entries || []) {
      const name = entry.mountName || entry.name || entry.file && entry.file.name;
      const data = entry.bytes || entry.data;
      if (!name) continue;
      if (data) module.FS.writeFile('/game/' + name.replace(/^.*\//, ''), data);
    }
    if (typeof context.framework?.mountOwnerFiles === 'function') {
      await context.framework.mountOwnerFiles(module, prepared, { root: '/game' });
    }

    const dirPtr = module.stringToNewUTF8 ? module.stringToNewUTF8('/game') : 0;
    const ok = module._lith_host_init(dirPtr || module._lith_start('/game'));
    if (dirPtr) module._free(dirPtr);
    if (!ok && !module._lith_start('/game')) {
      throw new Error('NOLF host failed to initialize official archives');
    }
    const held = new Set();
    const syncKeys = () => {
      if (!module || typeof module._lith_host_set_controls !== 'function') return;
      let flags = 0;
      if (held.has('KeyW') || held.has('ArrowUp')) flags |= 1;
      if (held.has('KeyS') || held.has('ArrowDown')) flags |= 2;
      if (held.has('KeyD') || held.has('ArrowRight')) flags |= 4;
      if (held.has('KeyA') || held.has('ArrowLeft')) flags |= 8;
      if (held.has('ShiftLeft') || held.has('ShiftRight')) flags |= 512;
      module._lith_host_set_controls(flags);
    };
    window.addEventListener('keydown', (event) => {
      if (!module) return;
      held.add(event.code);
      const playing = nativeState() === 'gameplay';
      if (!playing) {
        if (event.code === 'ArrowUp' || event.code === 'KeyW') {
          if (module._lith_host_menu_move) module._lith_host_menu_move(-1);
        }
        if (event.code === 'ArrowDown' || event.code === 'KeyS') {
          if (module._lith_host_menu_move) module._lith_host_menu_move(1);
        }
        if (event.code === 'Space' || event.code === 'Enter') {
          if (module._lith_host_confirm) module._lith_host_confirm();
          else module._lith_host_new_game();
        }
      }
      if (event.code === 'Escape' || event.code === 'Backspace') {
        if (module._lith_host_back) module._lith_host_back();
        if (playing) captureIntent = false;
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
    if (!module || !detail || !detail.down) return;
    if (nativeState() === 'menu') {
      if (module._lith_host_confirm) module._lith_host_confirm();
      else module._lith_host_new_game();
      if (nativeState() === 'gameplay') captureIntent = true;
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
    if (module && nativeState() === 'gameplay') module._lith_host_set_controls(0);
  }
});
