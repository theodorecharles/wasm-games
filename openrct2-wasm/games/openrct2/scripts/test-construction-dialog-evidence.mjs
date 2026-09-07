import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const proofs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../proofs');
// This checkpoint began on September 5 local time; retain its artifact names
// across midnight. Each observation also contains an unambiguous UTC timestamp.
const suffix = '-2026-09-05';
const read = async name => JSON.parse(await fs.readFile(path.join(proofs, `${name}${suffix}.json`)));
const old = await read('rct2-sprite-path-saved');
assert.match(old.observed.log, /Entrance\/exit element not found/);
assert.match(old.observed.log, /zenity --version/);
assert.match(old.observed.log, /kdialog --version/);

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
  assert.doesNotMatch(log, /WARNING\[|ERROR\[|Aborted\(|RuntimeError|memory access out of bounds/, name);
  assert.doesNotMatch(log, /require RCT1 linked|Fallback images|Cannot find object|Unable to load csg graphics|Cannot load CSG1/, name);
  assert.doesNotMatch(log, /Entrance\/exit element not found|zenity --version|kdialog --version/, name);
  const persistence = JSON.parse(data.openrct2Persistence);
  assert.equal(persistence.initialized, true, name);
  assert.equal(persistence.supported, true, name);
  assert.equal(persistence.dirty, false, name);
  assert.equal(persistence.lastError, null, name);
  const result = { name, at: Date.parse(value.observedAt), data, persistence, log };
  assert.ok(Number.isFinite(result.at), name);
  records.push(result);
  return result;
}

const title = await record('rct2-construction-dialog-title', 'menu');
assert.match(title.log, /Building object index \(2506 items\)/);
assert.match(title.log, /Building scenario index \(143 items\)/);
assert.match(title.log, /Finished building scenario index/);
await record('rct1-construction-dialog-start', 'gameplay');
const start = await record('rct2-construction-dialog-start', 'gameplay');
const built = await record('rct2-construction-dialog-built', 'gameplay');
const operated = await record('rct2-construction-dialog-operated', 'gameplay');
const saved = await record('rct2-construction-dialog-saved', 'paused');
const loaded = await record('rct2-construction-dialog-reloaded', 'paused');
const resumed = await record('rct2-construction-dialog-resumed', 'gameplay');
for (let i = 1; i < records.length; i++) assert.ok(records[i - 1].at < records[i].at, 'observation order');
assert.ok(Number(built.data.openrct2PointerEvents) > Number(start.data.openrct2PointerEvents), 'native construction input');
assert.ok(Number(operated.data.openrct2DrawCount) > Number(built.data.openrct2DrawCount), 'simulation continues');
assert.equal(Number(saved.data.openrct2KeyEvents), 2 * ('Electric Fields'.length + 'RCT2Ghost905'.length), 'native filename input');
assert.equal(loaded.data.openrct2KeyEvents, '0', 'fresh native engine after full page reload');
assert.ok(Number(loaded.data.openrct2DrawCount) < Number(saved.data.openrct2DrawCount), 'draw counter reset');
assert.ok(Number(resumed.data.openrct2PointerEvents) > Number(loaded.data.openrct2PointerEvents), 'native resume input');

const images = [];
for (const stem of [
  'rct1-construction-dialog-start', 'rct2-construction-dialog-start',
  'rct2-construction-dialog-built', 'rct2-construction-dialog-operated',
  'rct2-construction-dialog-save-name-final', 'rct2-construction-dialog-saved',
  'rct2-construction-dialog-load-menu', 'rct2-construction-dialog-reloaded',
  'rct2-construction-dialog-restored-ride',
]) {
  const name = `${stem}${suffix}.jpg`;
  const bytes = await fs.readFile(path.join(proofs, name));
  assert.ok(bytes.length > 10000, name);
  images.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const report = {
  checkedAt: new Date().toISOString(), oldChromeGhostError: true, oldChromeDesktopDialogWarnings: true,
  candidateRecordedDiagnostics: [], records, images,
  scope: 'Recorded DOM/log regression and screenshot provenance, not a visual oracle. Manual park/ride/save review and exact test sequence are in CONSTRUCTION-DIALOG-2026-09-05.md. Historical Chrome is not timing-identical; compiled exact-method negative controls independently establish each cause. Audio and ride-music linker warning are not accepted by this check.',
};
if (process.argv[2]) await fs.writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
console.log('OpenRCT2 construction/dialog evidence: historical ghost/dialog diagnostics reproduced; candidate recorded construction, operation, flushed save, fresh-engine reload and resume pass without them. Visual claims require manual review.');
