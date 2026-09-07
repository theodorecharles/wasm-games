#!/usr/bin/env node
// Compile the exact production upload functions against a real GLES 3 context.
// No game data or browser emulation; Chrome evidence is a separate gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, '.work/source/source/build/src/polymost.cpp'), 'utf8');
function section(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert(from >= 0 && to > from, `missing production section ${start}`);
  return source.slice(from, to);
}
const pixels = section('static void Polymost_SendTexToDriver(', '\nvoid uploadtexture(');
const indexed = section('// WebGL 2 requires a sized internal format', '\nvoid uploadbasepalette(');
const palette = section('void uploadpalswap(int32_t palookupnum)', '\n\n#if 0');
const size = source.match(/^#define PALSWAP_TEXTURE_SIZE \d+$/m)?.[0];
assert(size);
const production = `${size}\n${pixels}\n${indexed}\n${palette}`;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'polymost-textures-'));
const cases = [
  ['production', production, 0, /"checks":40/],
  ['old-packed-pixels', production.replace('#ifdef __EMSCRIPTEN__', '#if 0'), 1, /pixel upload: GL error/],
  ['missing-bgra-swizzle', production.replace('pic[i].b, pic[i].g, pic[i].r, pic[i].a', 'pic[i].r, pic[i].g, pic[i].b, pic[i].a'), 1, /pixel mismatch/],
  ['lost-alpha', production.replace('pic[i].r, pic[i].a', 'pic[i].r, 255'), 1, /pixel mismatch/],
  ['unsized-indexed', production.replace('indexedTextureInternalFormat = GL_R8', 'indexedTextureInternalFormat = GL_RED'), 1, /sized R8/],
];
try {
  const records = [];
  const env = {...process.env, ASAN_OPTIONS:'detect_leaks=0'};
  if (env.LD_PRELOAD) {
    const runtime = spawnSync('c++', ['-print-file-name=libasan.so'], {encoding:'utf8'});
    assert.equal(runtime.status, 0, runtime.stderr);
    env.LD_PRELOAD = `${runtime.stdout.trim()}:${env.LD_PRELOAD}`;
  }
  for (const [name, code, expected, message] of cases) {
    fs.writeFileSync(path.join(temporary, 'production.inc'), code);
    const executable = path.join(temporary, name);
    const build = spawnSync('c++', ['-std=c++17', '-O1', '-g', '-fsanitize=address,undefined',
      '-fno-omit-frame-pointer', '-I', temporary,
      path.join(root, 'tests/polymost-textures.cpp'), '-lEGL', '-lGLESv2', '-o', executable],
      {encoding:'utf8', timeout:60000});
    assert.equal(build.status, 0, build.stdout + build.stderr);
    const result = spawnSync(executable, [], {encoding:'utf8', timeout:60000, env});
    assert.equal(result.status, expected, `${name}: ${result.stdout}${result.stderr}`);
    assert.match(result.stdout + result.stderr, message);
    assert.doesNotMatch(result.stderr, /AddressSanitizer|runtime error:/);
    records.push({name, expectedFailure:expected !== 0, output:result.stdout.trim(), error:result.stderr.trim()});
  }
  const proof = {scope:'Native GLES pixel readback, not Chrome gameplay acceptance',
    sourceSha256:createHash('sha256').update(source).digest('hex'),
    extractedSha256:createHash('sha256').update(production).digest('hex'), records};
  if (process.env.POLYMOST_TEXTURE_PROOF) fs.writeFileSync(process.env.POLYMOST_TEXTURE_PROOF,
    JSON.stringify(proof, null, 2) + '\n', {flag:'wx'});
  console.log(JSON.stringify(proof, null, 2));
} finally { fs.rmSync(temporary, {recursive:true, force:true}); }
