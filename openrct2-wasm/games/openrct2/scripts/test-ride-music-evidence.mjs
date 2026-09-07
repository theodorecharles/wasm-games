import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const proofs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../proofs');
const read = async stem => JSON.parse(await fs.readFile(path.join(proofs, `${stem}-2026-09-06.json`)));
const records = [];
async function record(stem, state) {
  const value = await read(stem);
  const { dataset: data, log } = value.observed;
  assert.equal(data.openrct2State, state, stem);
  assert.equal(data.shellEngineState, state, stem);
  assert.equal(data.shellDataReady, 'true', stem);
  assert.ok(Number(data.openrct2DrawCount) > 0, stem);
  assert.ok(Number(data.openrct2FramebufferVariation) > 0, stem);
  assert.equal(data.openrct2CanvasWidth, data.openrct2ContextWidth, stem);
  assert.equal(data.openrct2CanvasHeight, data.openrct2ContextHeight, stem);
  assert.match(log, /22 private installation park objects mounted/, stem);
  assert.doesNotMatch(log, /WARNING\[|ERROR\[|RuntimeError|Aborted\(|memory access out of bounds|signature mismatch/, stem);
  assert.doesNotMatch(log, /require RCT1 linked|Fallback images|Cannot find object|Unable to load csg graphics|Cannot load CSG1|zenity --version|kdialog --version/, stem);
  const persistence = JSON.parse(data.openrct2Persistence);
  assert.equal(persistence.initialized, true, stem);
  assert.equal(persistence.supported, true, stem);
  assert.equal(persistence.dirty, false, stem);
  assert.equal(persistence.lastError, null, stem);
  const result = { stem, at: Date.parse(value.observedAt), data, persistence, log };
  assert.ok(Number.isFinite(result.at));
  records.push(result);
  return result;
}
const title = await record('rct2-ride-music-title', 'menu');
assert.match(title.log, /Building object index \(2506 items\)/);
assert.match(title.log, /Building scenario index \(143 items\)/);
assert.match(title.log, /Finished building scenario index/);
const start = await record('rct1-diamond-heights-start', 'gameplay');
const enabled = await record('rct1-diamond-heights-music-enabled', 'gameplay');
const before = await record('rct1-diamond-heights-customers-before', 'gameplay');
const after = await record('rct1-diamond-heights-customers-after', 'gameplay');
const saved = await record('rct1-diamond-heights-saved', 'paused');
const loaded = await record('rct1-diamond-heights-reloaded', 'paused');
const restoredMusic = await record('rct1-diamond-heights-restored-music', 'paused');
const resumed = await record('rct1-diamond-heights-resumed', 'gameplay');
for (let i = 1; i < records.length; i++) assert.ok(records[i - 1].at < records[i].at, 'record chronology');
assert.ok(Number(enabled.data.openrct2PointerEvents) > Number(start.data.openrct2PointerEvents), 'native music input');
assert.ok(Number(after.data.openrct2DrawCount) > Number(before.data.openrct2DrawCount), 'park continues running');
assert.equal(Number(saved.data.openrct2KeyEvents), 2 * ('Diamond Heights'.length + 'RCT1Music906'.length), 'native save name input');
assert.equal(loaded.data.openrct2KeyEvents, '0', 'fresh engine after full reload');
assert.ok(Number(loaded.data.openrct2DrawCount) < Number(saved.data.openrct2DrawCount), 'draw counter reset');
assert.ok(Number(resumed.data.openrct2PointerEvents) > Number(restoredMusic.data.openrct2PointerEvents), 'native resume');
const images = [];
for (const stem of ['rct1-diamond-heights-start', 'rct1-diamond-heights-music-enabled',
  'rct1-diamond-heights-customers-before', 'rct1-diamond-heights-customers-after',
  'rct1-diamond-heights-save-name-final', 'rct1-diamond-heights-saved', 'rct1-diamond-heights-load-menu',
  'rct1-diamond-heights-reloaded', 'rct1-diamond-heights-restored-music', 'rct1-diamond-heights-resumed']) {
  const name = `${stem}-2026-09-06.jpg`;
  const bytes = await fs.readFile(path.join(proofs, name));
  assert.ok(bytes.length > 10000, name);
  images.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const report = { checkedAt: new Date().toISOString(), records, images,
  scope: 'Recorded Chrome state/log/input/persistence checks and image provenance. Manual Diamond Heights, music-checkbox, customer-counter and saved-park review is in RIDE-MUSIC-2026-09-06.md. No OCR, exact native callback trace, exhaustive gameplay or audible-playback acceptance is implied.' };
if (process.argv[2]) await fs.writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
console.log('OpenRCT2 ride-music Chrome evidence: park operation, native music input, flushed unique save, full reload, restored setting and resume pass; visual claims need manual review and listening is unaccepted.');
