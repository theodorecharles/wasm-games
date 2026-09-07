#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkout = path.join(process.env.IDTECH4_WORK_ROOT || path.join(root, '.work'), 'openq4');
const directory = path.resolve(process.argv[2] || path.join(root, 'build/site'));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'q4-images-'));
const baseline = process.env.Q4_IMAGE_BASELINE === '1';
const depthBaseline = process.env.Q4_DEPTH_BASELINE === '1';
const framebufferCases = process.env.Q4_FRAMEBUFFER_CASES === '1';
const framebufferBaseline = process.env.Q4_FRAMEBUFFER_BASELINE === '1';
const borderCases = process.env.Q4_BORDER_IMAGE_CASES === '1';
try {
  const output = path.join(temporary, 'probe.wasm');
  const compile = spawnSync(process.env.EMXX || 'em++', [
    '-std=c++20', '-O1', '-fPIC', '-fexceptions', '-fno-strict-aliasing', '-sSIDE_MODULE=1',
    '-D__DOOM_DLL__', '-DUSE_OPENAL', '-DGLEW_NO_GLU', '-DID_GL_HARDLINK', '-DUSE_SDL3=1',
    '-sUSE_SDL=3', '-sUSE_WEBGL2=1', '-I', path.join(checkout, 'src'),
    '-I', path.join(checkout, 'build/web-meson-6.0.6'),
    '-I', path.join(checkout, '.tmp/gamelibs_stage/src/game'),
    '-I', path.join(checkout, 'subprojects/glew/include'),
    '-I', path.join(checkout, 'subprojects/openal-soft-prebuilt/include'),
    path.join(root, 'tests/q4-image.cpp'), '-o', output
  ], { encoding: 'utf8' });
  assert.equal(compile.status, 0, compile.stdout + compile.stderr);
  const bytes = fs.readFileSync(path.join(directory, 'openQ4-client_wasm32.wasm'));
  let native, resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const module = {
    noInitialRun: true, onRuntimeInitialized: resolveReady, onAbort: rejectReady,
    instantiateWasm(imports, receive) {
      WebAssembly.instantiate(bytes, imports).then(({ instance, module }) => {
        native = instance; return receive(instance, module);
      }).catch(rejectReady);
      return {};
    }
  };
  const sandbox = {
    Module: module, WebAssembly, TypeError, Array, WorkerGlobalScope: function () {},
    location: { href: 'https://q4-image-native.test/engine.js' },
    URL, TextDecoder, TextEncoder, console, performance, crypto: globalThis.crypto,
    setTimeout, clearTimeout, setInterval, clearInterval, postMessage() {},
    navigator: { hardwareConcurrency: 1 }, addEventListener() {}, removeEventListener() {}
  };
  sandbox.self = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(directory, 'openQ4-client_wasm32.js'), 'utf8'), sandbox);
  await ready;
  const calls = [];
  const stores = new Map([[0x0cf5, 4], [0x0cf2, 0]]);
  const backbuffer = { name:0, read:0x0405, draw:[0x0405], samples:0, alpha:8 };
  let readFbo = backbuffer, drawFbo = backbuffer, texture = null;
  let scissorEnabled = false, scissorBox = [0,0,640,480];
  const samplerUniforms = new Map();
  const gl = {
    getParameter(name) {
      if (name === 0x8b4d) return 16;
      if (name === 0x8caa) return readFbo.name ? readFbo : null;
      if (name === 0x8ca6) return drawFbo.name ? drawFbo : null;
      if (name === 0x0c02) return readFbo.read;
      if (name === 0x0c01) throw Error('WebGL has no GL_DRAW_BUFFER query');
      if (name === 0x8825) return drawFbo.draw[0];
      if (name === 0x80a9) return drawFbo.samples;
      if (name === 0x0d55) return drawFbo.alpha;
      if (name === 0x0c10) return scissorBox;
      return stores.get(name) ?? 0;
    },
    getError: () => 0, createTexture: () => ({}),
    // Reflection and submission are a recording sink. Native image settings,
    // SDK texture binding and the packaged border runtime remain unmodified.
    useProgram() {},
    getProgramParameter: (_program, name) => name === 0x8b82 ? true : name === 0x8b86 ? 1 : 0,
    getActiveUniform: () => ({name:'image', type:0x8b5e, size:1}),
    getUniformLocation: (_program, name) => ({name}), getUniform: () => 0,
    uniform4fv(location, value) {
      samplerUniforms.set(location.name, Array.from(value));
      calls.push({name:'uniform', uniform:location.name, value:Array.from(value)});
    },
    drawArrays() { calls.push({name:'draw'}); },
    deleteTexture(object) { calls.push({name:'delete-texture',object:object?.name}); },
    bindTexture(_target, object) { texture = object; },
    createFramebuffer: () => ({read:0x8ce0,draw:[0x8ce0],samples:0,alpha:8}),
    deleteFramebuffer(object) { calls.push({name:'delete-framebuffer',object:object?.name}); },
    bindFramebuffer(target, object) {
      if (target === 0x8d40 || target === 0x8ca8) readFbo = object || backbuffer;
      if (target === 0x8d40 || target === 0x8ca9) drawFbo = object || backbuffer;
    },
    framebufferTexture2D(target, _attachment, _textureTarget, object) {
      (target === 0x8ca8 ? readFbo : drawFbo).texture = object;
    },
    readBuffer(value) { readFbo.read = value; },
    drawBuffers(values) { drawFbo.draw = Array.from(values); },
    isEnabled: capability => capability === 0x0c11 && scissorEnabled,
    enable(capability) { if (capability === 0x0c11) scissorEnabled = true; },
    disable(capability) { if (capability === 0x0c11) scissorEnabled = false; },
    scissor(...values) { scissorBox = values; },
    blitFramebuffer(...args) { calls.push({name:'blit',args,read:readFbo.name,draw:drawFbo.name,
      readBuffer:readFbo.read,drawBuffers:[...drawFbo.draw],scissorEnabled,
      format:drawFbo.texture?.format}); },
    copyTexImage2D(...args) { calls.push({name:'legacy-copy',args}); },
    copyTexSubImage2D(...args) { calls.push({name:'legacy-subcopy',args}); },
    pixelStorei(name, value) { stores.set(name, value); calls.push({ name: 'pixelStorei', args: [name, value] }); },
    texParameteri(...args) { calls.push({ name: 'parameter', args }); },
    texParameterf(...args) { calls.push({ name: 'parameter', args }); },
    texImage2D(...args) { if (texture) texture.format = args[2]; calls.push({ name: 'allocate', args: args.slice(0, 8) }); },
    texSubImage2D(...args) {
      const bytesPerPixel = args[6] === 0x1908 ? 4 : args[6] === 0x190a || args[7] === 0x8363 ? 2 : 1;
      const count = args[4] * args[5] * bytesPerPixel;
      // SDK WebGL2 submissions carry a typed heap plus element offset.
      const view = args[8], offset = (args[9] || 0) * view.BYTES_PER_ELEMENT;
      calls.push({ name: 'upload', args: args.slice(0, 8), pixels: Array.from(new Uint8Array(view.buffer, view.byteOffset + offset, count)) });
    },
    compressedTexImage2D(...args) { calls.push({ name: 'compressed-allocate', args: args.slice(0, 6) }); },
    compressedTexSubImage2D(...args) { calls.push({ name: 'compressed-upload', args: args.slice(0, 7), pixels: Array.from(args[7].subarray(args[8], args[8] + args[9])) }); }
  };
  sandbox.GLctx = gl;
  sandbox.GL.currentContext = { version: 2, GLctx: gl };
  // This no-main fixture skips context-creation callbacks. The SDK's real
  // enable/disable wrapper still visits its legacy texture-environment state.
  sandbox.GLImmediate.TexEnvJIT.init(null, 8);
  const probe = await sandbox.loadWebAssemblyModule(fs.readFileSync(output), { loadAsync: true, nodelete: true }, 'q4-images.wasm', {});
  probe.Q4ImageInit();
  const results = [];
  function check(label, run) {
    try { run(); results.push({ label, passed: true }); }
    catch (error) { results.push({ label, passed: false, error: error.message, stack:error.stack }); }
  }
  function begin(scenario, width, height, levels = 1, cube = 0) {
    calls.length = 0;
    probe.Q4ImageBegin(scenario, width, height, levels, cube);
    return calls.filter(call => call.name.endsWith('allocate'));
  }
  function upload(pixels, width, height, { level = 0, x = 0, y = 0, side = 0, pitch = 0 } = {}) {
    const pointer = native.exports.malloc(pixels.length) >>> 0;
    new Uint8Array(native.exports.memory.buffer).set(pixels, pointer);
    calls.length = 0;
    probe.Q4ImageUpload(level, x, y, side, width, height, pointer, pitch);
    assert.deepEqual(Array.from(new Uint8Array(native.exports.memory.buffer, pointer, pixels.length)), pixels, 'source data must not be mutated');
    native.exports.free(pointer);
    const submitted = calls.filter(call => call.name.endsWith('upload'));
    assert.equal(submitted.length, 1);
    return submitted[0];
  }
  function rgbaCase(label, scenario, source, expected, width = 2, height = 1) {
    check(label, () => {
      const allocations = begin(scenario, width, height);
      assert.equal(allocations.length, 1);
      assert.equal(allocations[0].name, 'allocate');
      assert.equal(probe.Q4ImageMetadata(0), 0x8058, 'GPU storage must be RGBA8');
      assert.equal(probe.Q4ImageMetadata(1), 0x1908);
      assert.equal(probe.Q4ImageMetadata(2), 0x1401);
      assert.ok(!calls.some(call => call.name === 'parameter' && call.args[1] >= 0x8e42 && call.args[1] <= 0x8e46), 'no unsupported texture swizzles');
      const data = upload(source, width, height);
      assert.deepEqual(data.pixels, expected);
      assert.deepEqual(data.args.slice(6), [0x1908, 0x1401]);
      assert.ok(!calls.some(call => call.name === 'pixelStorei' && call.args[0] === 0x0cf0), 'no unsupported byte-swap parameter');
    });
  }
  rgbaCase('alpha clip lookup: white RGB, original alpha', 0, [0, 255], [255,255,255,0, 255,255,255,255]);
  rgbaCase('luminance: RGB replication, opaque alpha', 1, [19, 203], [19,19,19,255, 203,203,203,255]);
  rgbaCase('intensity lighting lookup: RGBA replication', 2, [19, 203], [19,19,19,19, 203,203,203,203]);
  rgbaCase('luminance-alpha: both channels preserved', 3, [19,27,203,179], [19,19,19,27, 203,203,203,179]);
  rgbaCase('RGB565: big-endian source bytes', 4, [0xf8,0,0x07,0xe0,0,0x1f], [255,0,0,255, 0,255,0,255, 0,0,255,255], 3);
  rgbaCase('XRGB8: discard source alpha only', 5, [1,2,3,4,5,6,7,8], [1,2,3,255,5,6,7,255]);
  rgbaCase('RGB normal: X duplicated into alpha', 6, [21,37,199,255,64,96,211,0], [21,37,199,21,64,96,211,64]);
  rgbaCase('green-alpha atlas: white RGB and green coverage', 7, [0,37,0,0,0,199,0,0], [255,255,255,37,255,255,255,199]);
  const dxtRed = [0,0xf8,0,0,0,0,0,0];
  const dxtGreen = [0xe0,7,0,0,0,0,0,0];
  const dxtAlphaRed = [73,0,0,0,0,0,0,0,...dxtRed];
  const repeated = (pixel, count) => Array.from({ length: count }, () => pixel).flat();
  rgbaCase('thin DXT1: padded block cropped', 8, dxtRed, repeated([255,0,0,255], 6), 3, 2);
  rgbaCase('thin DXT5: encoded alpha preserved', 9, dxtAlphaRed, repeated([255,0,0,73], 6), 3, 2);
  rgbaCase('compressed atlas: decode then green-alpha swizzle', 10, [0xe0,3,0,0,0,0,0,0], repeated([255,255,255,125], 16), 4, 4);
  rgbaCase('compressed RGB normal: decode then alpha-X swizzle', 11, dxtGreen, repeated([0,255,0,0], 16), 4, 4);
  rgbaCase('thin DXT1: transparent selector preserved', 8, [0,0,0,0,255,255,255,255], repeated([0,0,0,0], 6), 3, 2);
  rgbaCase('thin DXT5 normal: raw encoded channels retained', 12, dxtAlphaRed, repeated([255,0,0,73], 6), 3, 2);
  rgbaCase('thin YCoCg: raw encoded channels retained', 13, dxtAlphaRed, repeated([255,0,0,73], 6), 3, 2);
  check('valid DXT5 normal stays compressed', () => {
    assert.equal(begin(12, 4, 4)[0].name, 'compressed-allocate');
    assert.equal(probe.Q4ImageMetadata(0), 0x83f3);
    assert.equal(probe.Q4ImageMetadata(4), 1);
    assert.deepEqual(upload(dxtAlphaRed, 4, 4).pixels, dxtAlphaRed);
  });
  check('floating-point storage unchanged', () => {
    begin(14, 4, 4);
    assert.equal(probe.Q4ImageMetadata(0), 0x881a);
    assert.equal(probe.Q4ImageMetadata(2), 0x140b);
  });
  check('depth placeholder uses a WebGL-valid sized format and unsigned-int type', () => {
    const allocated = begin(15, 16, 16);
    assert.deepEqual(allocated.map(call => call.args), [[0x0de1,0,0x81a6,16,16,0,0x1902,0x1405]]);
    assert.equal(probe.Q4ImageMetadata(0), 0x81a6);
    assert.equal(probe.Q4ImageMetadata(1), 0x1902);
    assert.equal(probe.Q4ImageMetadata(2), 0x1405);
    assert.equal(probe.Q4ImageMetadata(6), 1024);
    calls.length = 0;
    probe.Q4ImageResize(32, 8);
    assert.deepEqual(calls.filter(call => call.name === 'allocate').map(call => call.args),
      [[0x0de1,0,0x81a6,32,8,0,0x1902,0x1405]]);
  });
  check('depth cube and mip allocations retain depth storage', () => {
    const allocated = begin(15, 8, 8, 3, 1);
    const expected = [];
    for (let side = 0; side < 6; side++) {
      for (let level = 0; level < 3; level++) {
        expected.push([0x8515 + side,level,0x81a6,8 >> level,8 >> level,0,0x1902,0x1405]);
      }
    }
    assert.deepEqual(allocated.map(call => call.args), expected);
  });
  check('packed depth-stencil storage unchanged', () => {
    assert.deepEqual(begin(16, 16, 16).map(call => call.args),
      [[0x0de1,0,0x88f0,16,16,0,0x84f9,0x84fa]]);
  });
  check('mip, cube-face, pitched subrectangle and pixel-store restoration', () => {
    const allocated = begin(0, 8, 8, 3, 1);
    assert.equal(allocated.length, 18);
    assert.ok(allocated.every(call => call.name === 'allocate' && call.args[2] === 0x8058));
    assert.equal(probe.Q4ImageMetadata(6), 2016, 'actual RGBA8 cube/mip storage size');
    stores.set(0x0cf5, 8); stores.set(0x0cf2, 11);
    const source = [11,22,99,99,33,44];
    const data = upload(source, 2, 2, { level:1, x:1, y:1, side:5, pitch:4 });
    assert.deepEqual(data.args.slice(0, 6), [0x851a,1,1,1,2,2]);
    assert.deepEqual(data.pixels, [255,255,255,11,255,255,255,22,255,255,255,33,255,255,255,44]);
    assert.equal(stores.get(0x0cf5), 8); assert.equal(stores.get(0x0cf2), 11);
    stores.set(0x0cf5, 4); stores.set(0x0cf2, 0);
  });
  check('thin compressed chain uses RGBA at every mip', () => {
    const allocated = begin(9, 8, 2, 4);
    assert.deepEqual(allocated.map(call => call.args.slice(3,5)), [[8,2],[4,1],[2,1],[1,1]]);
    assert.ok(allocated.every(call => call.name === 'allocate' && call.args[2] === 0x8058));
    assert.equal(probe.Q4ImageMetadata(4), 1, 'source format remains compressed');
    assert.equal(probe.Q4ImageMetadata(6), 92, 'expanded GPU memory, not encoded DXT size');
    assert.deepEqual(upload(dxtAlphaRed, 1, 1, {level:3}).pixels, [255,0,0,73]);
  });
  check('compressed pitched subrectangle: crop block edges and skip source blocks', () => {
    begin(8, 6, 5);
    const source = [...dxtRed,...dxtRed,...dxtRed,...dxtGreen,...dxtGreen];
    const expected = [...repeated([255,0,0,255],24),...repeated([0,255,0,255],6)];
    const data = upload(source, 6, 5, {pitch:12});
    assert.deepEqual(data.pixels, expected);
  });
  if (framebufferCases) {
    for (const source of [-1,0,1]) for (const samples of [0,4]) for (const alpha of (source < 0 ? [0,8] : [8])) {
      check(`framebuffer copy: source ${source}, samples ${samples}, alpha ${alpha}`, () => {
        const sourceName = probe.Q4ImageCopySource(source);
        const sourceFbo = sourceName ? sandbox.GL.framebuffers[sourceName] : backbuffer;
        sourceFbo.samples = samples; sourceFbo.alpha = alpha;
        sourceFbo.read = sourceName ? 0x8ce1 : 0x0405;
        const previousRead = sandbox.GL.framebuffers[probe.Q4ImageTestFramebuffer()];
        const previousDraw = sandbox.GL.framebuffers[probe.Q4ImageTestFramebuffer()];
        previousRead.read = 0x8ce2;
        previousDraw.draw = [0x8ce0,0x8ce1,0x8ce2];
        readFbo = previousRead; drawFbo = previousDraw;
        begin(14,16,16); // HDR destination must remain HDR, including SDR sources.
        scissorEnabled = true; scissorBox = [17,29,31,43];
        calls.length = 0;
        probe.Q4ImageCopy(3,5,8,6);
        assert.equal(probe.Q4ImageError(), 0, 'SDK validation must not report errors');
        const blits = calls.filter(call => call.name === 'blit');
        assert.equal(blits.length, samples ? 2 : 1);
        assert.ok(!calls.some(call => call.name.startsWith('legacy-')));
        assert.equal(blits[0].read, sourceName);
        assert.equal(blits[0].readBuffer, sourceName ? 0x8ce0 : 0x0405);
        assert.ok(blits.every(call => !call.scissorEnabled));
        if (samples) {
          assert.deepEqual(blits[0].args, [3,5,11,11,3,5,11,11,0x4000,0x2600]);
          assert.equal(blits[0].format, source === 1 ? 0x881a : alpha ? 0x8058 : 0x8051);
          assert.equal(blits[1].read, blits[0].draw);
        }
        assert.deepEqual(blits.at(-1).args, [3,5,11,11,0,0,8,6,0x4000,0x2600]);
        assert.equal(blits.at(-1).format, 0x881a);
        assert.equal(probe.Q4ImageMetadata(0), 0x881a);
        assert.equal(probe.Q4ImageMetadata(2), 0x140b);
        assert.equal(readFbo, previousRead); assert.equal(drawFbo, previousDraw);
        assert.equal(previousRead.read, 0x8ce2);
        assert.deepEqual(previousDraw.draw, [0x8ce0,0x8ce1,0x8ce2]);
        assert.equal(sourceFbo.read, sourceName ? 0x8ce1 : 0x0405);
        assert.equal(scissorEnabled, true); assert.deepEqual(scissorBox, [17,29,31,43]);
        calls.length = 0;
        probe.Q4ImageCopy(3,5,8,6);
        assert.equal(calls.filter(call => call.name.endsWith('allocate')).length, 0, 'same-size copies reuse storage');
        assert.equal(calls.filter(call => call.name === 'blit').length, samples ? 2 : 1);
      });
    }
    check('framebuffer copy scratch resources purge and recreate', () => {
      const previousRead = readFbo, previousDraw = drawFbo;
      calls.length = 0;
      probe.Q4ImageCopyPurge();
      assert.equal(calls.filter(call => call.name === 'delete-framebuffer').length, 2);
      assert.equal(calls.filter(call => call.name === 'delete-texture').length, 1);
      const deleted = calls.filter(call => call.name === 'delete-framebuffer').map(call=>call.object);
      calls.length = 0; probe.Q4ImageCopyPurge();
      assert.equal(calls.length, 0, 'purge is idempotent');
      probe.Q4ImageCopy(3,5,8,6);
      assert.ok(calls.filter(call => call.name === 'blit').every(call => !deleted.includes(call.draw)));
      assert.equal(readFbo, previousRead); assert.equal(drawFbo, previousDraw);
    });
  }
  if (borderCases) {
    const runtime = sandbox.GLImmediate.q4Border.get(gl);
    runtime.useProgram({});
    function sampler(expectedInfo, expectedColor) {
      runtime.drawArrays(4,0,3);
      assert.deepEqual(samplerUniforms.get('q4bsInfo_image'), expectedInfo);
      assert.deepEqual(samplerUniforms.get('q4bsColor_image'), expectedColor);
      assert.ok(!calls.some(call => call.name === 'parameter' &&
        (call.args[1] === 0x1004 || call.args[2] === 0x812d)), 'no unsupported border enum reaches GL');
    }
    const formats = [
      [0,'alpha',[1,1,1,0]],[1,'luminance',[0,0,0,1]],[2,'intensity',[0,0,0,0]],
      [3,'luminance-alpha',null],[4,'rgb565',[0,0,0,1]],[5,'xrgb8',[0,0,0,1]],
      [6,'rgb-normal',[0,0,0,0]],[7,'green-alpha',[1,1,1,0]],
      [8,'dxt1',null],[9,'dxt5',null],[10,'dxt1-green-alpha',[1,1,1,0]],
      [11,'dxt1-normal',[0,0,0,0]],[12,'dxt5-normal',null],[13,'ycocg',null],
      [14,'rgba16f',null],[15,'depth',[0,0,0,1]],[16,'depth-stencil',[0,0,0,1]],[17,'rgba8',null]
    ];
    for (const [scenario, format, color] of formats) for (const alpha of [0,1]) {
      check(`border format ${format}, alpha ${alpha}`, () => {
        begin(scenario,8,8);
        probe.Q4ImageSampler(alpha ? 1 : 2,1,16,16);
        sampler([1,1,0,1],color || [0,0,0,alpha]);
        const wraps = calls.filter(call=>call.name === 'parameter' && [0x2802,0x2803].includes(call.args[1]));
        assert.ok(wraps.length >= 2 && wraps.every(call=>call.args[2] === 0x812f));
      });
    }
    for (const levels of [1,4]) for (const filter of [0,1,2]) for (const maximum of [1,8,16]) {
      check(`border filtering: levels ${levels}, filter ${filter}, maximum ${maximum}`, () => {
        begin(17,8,8,levels);
        probe.Q4ImageSampler(1,filter,16,maximum);
        const mipmapped = levels > 1 && filter === 0;
        sampler([1,filter === 2 ? 0 : mipmapped ? 2 : 1,levels-1,mipmapped ? maximum : 1],[0,0,0,1]);
        const min = filter === 2 ? 0x2600 : mipmapped ? 0x2703 : 0x2601;
        assert.equal(calls.findLast(call=>call.name === 'parameter' && call.args[1] === 0x2801).args[2], min);
        assert.equal(calls.findLast(call=>call.name === 'parameter' && call.args[1] === 0x84fe).args[2], mipmapped ? maximum : 1);
      });
    }
    for (const repeat of [0,3,4]) check(`border disabled after repeat change ${repeat}`, () => {
      begin(17,8,8,4); probe.Q4ImageSampler(1,0,16,16);
      sampler([1,2,3,16],[0,0,0,1]);
      probe.Q4ImageSampler(repeat,0,16,16);
      sampler([0,0,0,1],[0,0,0,0]);
    });
    check('border sampler refresh and unchanged draw caching', () => {
      begin(17,8,8,4); probe.Q4ImageSampler(1,0,16,16);
      sampler([1,2,3,16],[0,0,0,1]);
      probe.Q4ImageSampler(1,0,8,16); probe.Q4ImageRefreshSampler();
      sampler([1,2,3,8],[0,0,0,1]);
      calls.length = 0; sampler([1,2,3,8],[0,0,0,1]);
      assert.deepEqual(calls,[{name:'draw'}]);
    });
    check('border texture purge and recreation clear metadata', () => {
      begin(17,8,8); probe.Q4ImageSampler(1,1,16,16);
      sampler([1,1,0,1],[0,0,0,1]);
      begin(17,8,8); sampler([0,0,0,1],[0,0,0,0]);
    });
  }
  probe.Q4ImageFinish();
  const proof = { scope:'Actual linked engine allocation/upload/DXT decoder/sampler settings; recording GL sink, not browser/GPU acceptance',
    wasmSha256:crypto.createHash('sha256').update(bytes).digest('hex'),
    jsSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(directory,'openQ4-client_wasm32.js'))).digest('hex'),
    baseline, depthBaseline, framebufferBaseline, borderCases, results };
  if (process.env.Q4_IMAGE_PROOF) fs.writeFileSync(process.env.Q4_IMAGE_PROOF,JSON.stringify(proof,null,2)+'\n');
  console.log(JSON.stringify(proof, null, 2));
  const failures = results.filter(result => !result.passed);
  if (framebufferBaseline) {
    assert.equal(failures.length, 9, 'old engine must fail the eight copy cases and scratch lifecycle');
    assert.ok(failures.every(result => result.label.startsWith('framebuffer copy')));
    assert.ok(failures.every(result => result.stack.startsWith('AssertionError')), 'fixture errors do not count as reproduced copy defects');
  } else if (depthBaseline) {
    assert.equal(failures.length, 2, 'texture candidate must fail only the two new depth cases');
    assert.ok(failures.every(result => result.label.startsWith('depth ')));
  } else if (baseline) {
    assert.ok(failures.length >= 8, 'old artifact must reproduce the unsupported upload paths');
    assert.ok(results.find(result => result.label === 'valid DXT5 normal stays compressed').passed);
  } else {
    assert.equal(failures.length, 0, JSON.stringify(failures));
  }
} finally {
  fs.rmSync(temporary, { recursive:true, force:true });
}
