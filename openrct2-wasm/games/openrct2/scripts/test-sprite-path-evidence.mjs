import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const proofs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../proofs');
const read = async name => JSON.parse(await fs.readFile(path.join(proofs, `${name}-2026-09-05.json`)));
const fallback = /require RCT1 linked|Fallback images|Unable to load csg graphics|Cannot load CSG1/;
const old = await read('rct1-forest-frontiers-start');
assert.match(old.observed.log, fallback, 'old native build must reproduce the sprite-path warning');
const records = [];
async function record(name, state) {
  const value = await read(name);
  const { dataset: data, log } = value.observed;
  assert.equal(data.openrct2State, state, name);
  assert.equal(data.shellEngineState, state, name);
  assert.equal(data.shellDataReady, 'true', name);
  assert.equal(data.wasmGameVariant, 'openrct2', name);
  assert.ok(Number(data.openrct2DrawCount) > 0, name);
  assert.ok(Number(data.openrct2FramebufferVariation) > 0, name);
  assert.equal(data.openrct2CanvasWidth, data.openrct2ContextWidth, name);
  assert.equal(data.openrct2CanvasHeight, data.openrct2ContextHeight, name);
  assert.match(log, /22 private installation park objects mounted/, name);
  assert.doesNotMatch(log, fallback, name);
  assert.doesNotMatch(log, /Cannot find object|Aborted\(|RuntimeError|memory access out of bounds/, name);
  const persistence = JSON.parse(data.openrct2Persistence);
  assert.equal(persistence.initialized, true, name);
  assert.equal(persistence.supported, true, name);
  assert.equal(persistence.dirty, false, name);
  assert.equal(persistence.lastError, null, name);
  const result = { name, at: Date.parse(value.observedAt), data, persistence,
    // Preserve unrelated native warnings; a sprite repair is not an error-free game claim.
    nativeDiagnostics: log.split('\n').filter(line => /WARNING\[|ERROR\[/.test(line)) };
  records.push(result);
  return result;
}
const start = await record('rct1-sprite-path-start', 'gameplay');
const startup = (await read(start.name)).observed.log;
assert.match(startup, /Building object index \(2506 items\)/);
assert.match(startup, /Building scenario index \(143 items\)/);
assert.match(startup, /Finished building scenario index/);
assert.doesNotMatch(startup, /WARNING\[|ERROR\[/);
await record('rct2-sprite-path-start', 'gameplay');
await record('rct2-sprite-path-operated', 'gameplay');
for (const game of ['rct1', 'rct2']) {
  const saved = await record(`${game}-sprite-path-saved`, 'paused');
  const loaded = await record(`${game}-sprite-path-reloaded`, 'paused');
  const resumed = await record(`${game}-sprite-path-resumed`, 'gameplay');
  assert.ok(saved.at < loaded.at && loaded.at < resumed.at, `${game}: record order`);
  // One down/up pair per removed/default-name character and typed proof-name character.
  const defaultName = game === 'rct1' ? 'Forest Frontiers' : 'Electric Fields';
  const proofName = game === 'rct1' ? 'RCT1Path905' : 'RCT2Path905';
  assert.equal(Number(saved.data.openrct2KeyEvents), 2 * (defaultName.length + proofName.length), `${game}: native filename input`);
  assert.equal(loaded.data.openrct2KeyEvents, '0', `${game}: fresh native engine`);
  assert.ok(Number(loaded.data.openrct2DrawCount) < Number(saved.data.openrct2DrawCount), `${game}: engine counters reset`);
  assert.ok(Number(resumed.data.openrct2PointerEvents) > Number(loaded.data.openrct2PointerEvents), `${game}: native resume input`);
}
const imageNames = [
  'rct1-sprite-path-start', 'rct1-sprite-path-save-name-final', 'rct1-sprite-path-load-menu', 'rct1-sprite-path-reloaded',
  'rct2-sprite-path-start', 'rct2-sprite-path-operated', 'rct2-sprite-path-save-name-final',
  'rct2-sprite-path-saved', 'rct2-sprite-path-load-menu', 'rct2-sprite-path-reloaded',
  'rct2-sprite-path-boarded', 'rct2-sprite-path-restored-ride'
];
const images = [];
for (const stem of imageNames) {
  const name = `${stem}-2026-09-05.jpg`;
  const bytes = await fs.readFile(path.join(proofs, name));
  assert.ok(bytes.length > 10000, name);
  images.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const report = { observedAt: new Date().toISOString(), oldNativeFallbackWarning: true,
  repairedNativeFallbackWarning: false, scenarioIndexCompleted: true,
  records, images,
  visualReview: 'Manual screenshot review in RCT1-SPRITE-PATH-2026-09-05.md. Hashes and DOM telemetry do not independently prove park identity, ride use or audible playback.' };
if (process.argv[2]) await fs.writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
console.log('OpenRCT2 sprite-path evidence: old warning reproduced, new completed index/park has no fallback warning; RCT1/RCT2 flushed saves, fresh-engine reloads and native resumes pass. Unrelated diagnostics retained; visual claims require manual review.');
