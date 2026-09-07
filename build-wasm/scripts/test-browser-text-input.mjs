#!/usr/bin/env node
// Compile actual queue/seam/editor bodies; console and non-keyboard triggers
// are explicit recording stubs. This does not claim browser/save acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, '.work/source/source', relative), 'utf8');
const base = read('build/src/baselayer.cpp'), header = read('build/include/baselayer.h');
const input = read('duke3d/src/input.cpp');
function body(source, start) {
  const begin = source.indexOf(start);
  assert.ok(begin >= 0, start);
  const end = source.indexOf('\n}', begin);
  assert.ok(end > begin);
  return source.slice(begin, end + 2) + '\n';
}
const extracted = [
  body(header, 'char CONSTEXPR const g_keyAsciiTable[128]') + ';\n',
  body(header, 'static FORCE_INLINE int keyBufferFull('),
  body(header, 'static FORCE_INLINE void keyBufferInsert('),
  body(base, 'char keyGetChar('), body(base, 'void keyFlushChars('),
  body(base, 'extern "C" EMSCRIPTEN_KEEPALIVE int Build_WasmTextEvent('),
  body(input, 'int32_t I_EnterText(')
].join('\n');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'duke-text-input-'));
const records = [];
try {
  for (const target of ['native', 'wasm']) for (const negative of [false, true]) {
    const fragment = negative ? extracted.replace('keyBufferInsert((char)code);', '(void)code;') : extracted;
    if (negative) assert.notEqual(fragment, extracted);
    fs.writeFileSync(path.join(temp, 'native-text.inc'), fragment);
    const output = path.join(temp, target === 'native' ? 'text-native' : 'text-wasm.cjs');
    const compiler = target === 'native' ? (process.env.CXX || 'g++') :
      (process.env.EMXX || path.resolve(root, '../idtech4-wasm/.work/host-tools/emxx-6'));
    const flags = ['-O1', '-g', '-std=c++17', '-fno-sanitize-recover=all', '-I', temp];
    if (target === 'native') flags.push('-fsanitize=address,undefined');
    else flags.push('-fsanitize=undefined', '-sSAFE_HEAP=1', '-sASSERTIONS=1', '-sENVIRONMENT=node', '-sEXIT_RUNTIME=1');
    const built = spawnSync(compiler, [...flags, path.join(root, 'tests/browser-text-input.cpp'), '-o', output],
      { encoding: 'utf8', timeout: 120000 });
    assert.equal(built.status, 0, String(built.error || '') + built.stdout + built.stderr);
    const env = { ...process.env };
    if (target === 'native' && env.LD_PRELOAD) {
      const asan = execFileSync(compiler, ['-print-file-name=libasan.so'], { encoding: 'utf8' }).trim();
      assert.ok(path.isAbsolute(asan) && fs.existsSync(asan));
      env.LD_PRELOAD = asan + ':' + env.LD_PRELOAD;
    }
    const result = spawnSync(target === 'native' ? output : process.execPath, target === 'native' ? [] : [output],
      { encoding: 'utf8', timeout: 30000, env });
    assert.equal(result.status, negative ? 1 : 0, result.stdout + result.stderr);
    if (negative) assert.match(result.stderr, /text input mismatch: editor content/);
    else assert.ok(JSON.parse(result.stdout).checks > 12000);
    records.push({ target, negative, output: result.stdout.trim(), log: result.stderr.trim() });
  }
  const result = { scope: 'Native ASCII FIFO, browser seam, Duke editor; recording console/trigger stubs, not browser or save acceptance',
    extractedHash: createHash('sha256').update(extracted).digest('hex'), records };
  if (process.env.BUILD_TEXT_INPUT_PROOF) fs.writeFileSync(process.env.BUILD_TEXT_INPUT_PROOF,
    JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(result, null, 2));
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
