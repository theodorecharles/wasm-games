#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = process.env.IDTECH4_WORK_ROOT || path.join(root, '.work');
const source = fs.readFileSync(process.env.D3_COMMON_SOURCE || path.join(work, 'd3wasm/neo/framework/Common.cpp'), 'utf8');
function callback(name) {
  const start = source.indexOf(`void idCommonLocal::${name}(`);
  const end = source.indexOf('\n/*', start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start, end);
  const em = body.indexOf('EM_ASM('), stop = body.indexOf('\n#endif', em);
  assert.ok(em >= 0 && stop > em);
  return body.slice(em, stop).trim();
}
const production = ['Quit', 'WriteConfiguration'].map(name =>
  `extern "C" EMSCRIPTEN_KEEPALIVE void fixture${name}() { ${callback(name)} }`).join('\n');
const framework = require(path.join(work, 'wasm-game-framework/dist/wasm-game-framework.js'));
assert.equal(framework.version, '0.9.6');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'd3-persistence-'));
let manager;
try {
  const cpp = path.join(temporary, 'callbacks.cpp');
  const binary = path.join(temporary, 'callbacks.cjs');
  fs.writeFileSync(cpp, '#include <emscripten.h>\n' + production);
  const compiled = spawnSync(process.env.EMXX || 'em++', ['-std=c++17', '-O1', '--no-entry',
    '-sMODULARIZE=1', '-sENVIRONMENT=node', '-sFORCE_FILESYSTEM=1', '-sEXPORTED_RUNTIME_METHODS=["FS"]',
    '-lidbfs.js', cpp, '-o', binary], {encoding: 'utf8'});
  assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
  const runtime = await require(binary)();
  let active = 0, maximum = 0, flushes = 0, restores = 0;
  // Real Wasm/EM_ASM and framework queue, deterministic asynchronous disk I/O.
  runtime.FS.syncfs = (populate, done) => {
    active++; maximum = Math.max(maximum, active);
    if (populate) restores++; else flushes++;
    setTimeout(() => { active--; done(null); }, 2);
  };
  manager = framework.createPersistenceManager({namespace: 'd3-persistence-fixture', root: '/fixture-save', autoSave: false, requestDurability: false});
  await manager.attach(runtime.FS);
  const pending = [];
  globalThis.idtech4PersistenceSave = () => { manager.markDirty(); pending.push(manager.save()); };
  for (let i = 0; i < 4; i++) {
    runtime._fixtureWriteConfiguration();
    pending.push(manager.save()); // concurrent normal page/save hook
    runtime._fixtureQuit();
  }
  await Promise.all(pending);
  while (active) await new Promise(resolve => setTimeout(resolve, 2));
  assert.equal(restores, 1);
  assert.equal(flushes, 12);
  const proof = {scope: 'Actual native Quit/config EM_ASM callbacks compiled to Wasm with framework 0.9.6 persistence serialization; asynchronous FS.syncfs I/O is a deterministic fixture, not IndexedDB durability or native process-exit acceptance.',
    sourceSHA256: crypto.createHash('sha256').update(production).digest('hex'), restores, flushes, maximumConcurrentSyncs: maximum};
  if (process.env.D3_PERSISTENCE_PROOF) fs.writeFileSync(process.env.D3_PERSISTENCE_PROOF, JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify(proof));
  if (process.env.D3_PERSISTENCE_EXPECT_FAILURE === '1') assert.ok(maximum > 1);
  else assert.equal(maximum, 1);
} finally {
  delete globalThis.idtech4PersistenceSave;
  await manager?.destroy();
  fs.rmSync(temporary, {recursive: true, force: true});
}
