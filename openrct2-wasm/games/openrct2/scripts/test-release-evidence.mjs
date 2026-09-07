// Verify recorded DOM/log evidence; screenshots still require human review.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const proofs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../proofs');
const checkpoints = [
  ['rct2-release-old-park', 'paused', 'old'],
  ['rct2-release-installed-cold-title', 'menu', 'cold'],
  ['rct2-release-installed-park', 'paused', 'cold'],
  ['rct2-release-installed-resumed', 'gameplay', 'cold'],
  ['rct2-release-installed-warm-title', 'menu', 'warm'],
  ['rct1-release-installed-running', 'gameplay', 'warm'],
  ['rct1-release-installed-paused', 'paused', 'warm'],
];
let previous = 0;
const records = [];
for (const [stem, state, phase] of checkpoints) {
  const record = JSON.parse(await fs.readFile(path.join(proofs, `${stem}-2026-09-06.json`)));
  const at = Date.parse(record.observedAt);
  assert.ok(Number.isFinite(at) && at > previous, `${stem}: chronology`);
  previous = at;
  const { dataset: data, log } = record.observed;
  assert.equal(data.openrct2State, state, stem);
  assert.equal(data.shellEngineState, state, stem);
  assert.equal(data.shellDataReady, 'true', stem);
  assert.ok(Number(data.openrct2DrawCount) > 0, stem);
  assert.ok(Number(data.openrct2FramebufferVariation) > 0, stem);
  assert.equal(data.openrct2CanvasWidth, data.openrct2ContextWidth, stem);
  assert.equal(data.openrct2CanvasHeight, data.openrct2ContextHeight, stem);
  const persistence = JSON.parse(data.openrct2Persistence);
  assert.equal(persistence.namespace, 'openrct2-openrct2', stem);
  assert.equal(persistence.root, '/save/openrct2', stem);
  assert.equal(persistence.initialized, true, stem);
  assert.equal(persistence.supported, true, stem);
  assert.equal(persistence.dirty, false, stem);
  assert.equal(persistence.lastError, null, stem);
  assert.doesNotMatch(log, /ERROR\[|RuntimeError|Aborted\(|memory access out of bounds/, stem);
  if (phase === 'old') {
    assert.equal(data.openrct2IndexBytes, '519199', stem);
    assert.match(log, /Building object index \(2484 items\)/, stem);
    assert.match(log, /zenity --version/, stem);
    assert.match(log, /kdialog --version/, stem);
    assert.doesNotMatch(log, /Stable content timestamps/, stem);
  } else {
    assert.equal(data.openrct2IndexBytes, '522908', stem);
    assert.match(log, /Stable content timestamps applied to 2484 bundled index files \(47647079 bytes\)/, stem);
    assert.match(log, /22 private installation park objects mounted/, stem);
    assert.match(log, /2975 files mounted through worker-backed WORKERFS/, stem);
    assert.doesNotMatch(log, /WARNING\[|require RCT1 linked|Fallback images|Cannot find object|Unable to load csg graphics|Cannot load CSG1|zenity --version|kdialog --version/, stem);
    if (phase === 'warm') {
      assert.doesNotMatch(log, /out of date|Building .*index|Finished building .*index/, stem);
    } else {
      assert.match(log, /Building object index \(2506 items\)/, stem);
      assert.match(log, /Building track design index \(506 items\)/, stem);
      assert.match(log, /Building scenario index \(143 items\)/, stem);
      assert.match(log, /Finished building scenario index/, stem);
    }
  }
  const screenshot = await fs.readFile(path.join(proofs, `${stem}-2026-09-06.jpg`));
  assert.ok(screenshot.length > 10000, stem);
  records.push(data);
}
assert.ok(Number(records[3].openrct2DrawCount) > Number(records[2].openrct2DrawCount));
assert.ok(Number(records[4].openrct2DrawCount) < Number(records[3].openrct2DrawCount), 'fresh engine after reload');
assert.equal(records[4].openrct2PointerEvents, '0', 'fresh title before native input');
assert.ok(Number(records[6].openrct2PointerEvents) > Number(records[5].openrct2PointerEvents));
console.log('OpenRCT2 release evidence: old/new save-load states, one-time index migration, warm-cache reuse, RCT1 gameplay/pause and clean persistence pass. Park identity/values and sprite quality are manually reviewed screenshots, not automated visual or audio acceptance.');
