import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const proofs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../proofs');
const read = async stem => JSON.parse(await fs.readFile(path.join(proofs, `${stem}-2026-09-06.json`)));
const records = [];
async function record(stem, state, phase = 'warm') {
  const value = await read(stem);
  const { dataset: data, log } = value.observed;
  assert.equal(data.openrct2State, state, stem);
  assert.equal(data.shellEngineState, state, stem);
  assert.equal(data.shellDataReady, 'true', stem);
  assert.ok(Number(data.openrct2DrawCount) > 0, stem);
  assert.ok(Number(data.openrct2FramebufferVariation) > 0, stem);
  assert.equal(data.openrct2CanvasWidth, data.openrct2ContextWidth, stem);
  assert.equal(data.openrct2CanvasHeight, data.openrct2ContextHeight, stem);
  assert.equal(data.openrct2IndexBytes, '522908', stem);
  assert.match(log, /22 private installation park objects mounted/, stem);
  assert.doesNotMatch(log, /WARNING\[|ERROR\[|RuntimeError|Aborted\(|memory access out of bounds/, stem);
  assert.doesNotMatch(log, /require RCT1 linked|Fallback images|Cannot find object|Unable to load csg graphics|Cannot load CSG1|zenity --version|kdialog --version/, stem);
  if (phase !== 'old') assert.match(log, /Stable content timestamps applied to 2484 bundled index files \(47647079 bytes\)/, stem);
  if (phase === 'warm') assert.doesNotMatch(log, /out of date|Building .*index|Finished building .*index/, stem);
  const persistence = JSON.parse(data.openrct2Persistence);
  assert.equal(persistence.initialized, true, stem);
  assert.equal(persistence.supported, true, stem);
  assert.equal(persistence.dirty, false, stem);
  assert.equal(persistence.lastError, null, stem);
  const result = { stem, at: Date.parse(value.observedAt), data, persistence, log };
  assert.ok(Number.isFinite(result.at)); records.push(result); return result;
}
const baseline = await record('rct2-index-baseline-reload', 'menu', 'old');
assert.match(baseline.log, /object index out of date/);
assert.match(baseline.log, /Building object index \(2506 items\)/);
assert.doesNotMatch(baseline.log, /Stable content timestamps/);
const cold = await record('rct2-index-cold-title', 'menu', 'cold');
assert.match(cold.log, /Building object index \(2506 items\)/);
assert.match(cold.log, /Building track design index \(506 items\)/);
assert.match(cold.log, /Building scenario index \(143 items\)/);
assert.match(cold.log, /Finished building scenario index/);
const warm = await record('rct2-index-warm-title', 'menu');
assert.equal(warm.data.openrct2KeyEvents, '0');
assert.ok(Number(warm.data.openrct2HotCacheFiles) < Number(cold.data.openrct2HotCacheFiles));
await record('rct1-index-cache-start', 'gameplay');
const saved = await record('rct1-index-cache-saved', 'paused');
assert.equal(Number(saved.data.openrct2KeyEvents), 2 * ('Diamond Heights'.length + 'RCT1Cache906'.length));
const again = await record('rct2-index-warm-again-title', 'menu');
assert.equal(again.data.openrct2KeyEvents, '0');
const loaded = await record('rct1-index-cache-reloaded', 'paused');
assert.equal(loaded.data.openrct2KeyEvents, '0');
assert.ok(Number(loaded.data.openrct2DrawCount) < Number(saved.data.openrct2DrawCount));
const resumed = await record('rct1-index-cache-resumed', 'gameplay');
assert.ok(Number(resumed.data.openrct2PointerEvents) > Number(loaded.data.openrct2PointerEvents));
for (let i = 1; i < records.length; i++) assert.ok(records[i - 1].at < records[i].at, 'chronology');
const images = [];
for (const stem of [...records.map(record => record.stem), 'rct1-index-cache-save-name-final', 'rct1-index-cache-load-menu']) {
  const name = `${stem}-2026-09-06.jpg`, bytes = await fs.readFile(path.join(proofs, name));
  assert.ok(bytes.length > 10000, name);
  images.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const report = { checkedAt: new Date().toISOString(), records, images,
  scope: 'Recorded Chrome old rebuild, cold build, two fresh-engine warm launches, cached-index park/save/reload/resume and clean diagnostics. Images are provenance, not an automated visual oracle. Manual review is in INDEX-CACHE-2026-09-06.md; no end-to-end timing, audible playback or full-game acceptance is implied.' };
if (process.argv[2]) await fs.writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
console.log('OpenRCT2 index-cache Chrome evidence: baseline rebuild, cold build, two warm launches without rebuild and native park save/reload/resume pass; visuals require manual review.');
