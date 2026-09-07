import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../proofs');
const read = async name => JSON.parse(await fs.readFile(path.join(root, name + '-2026-09-05.json')));
const old = await read('rct1-private-objects-old');
const fixed = await read('rct1-private-objects-fixed');
const park = await read('rct1-forest-frontiers-start');
const paused = await read('rct1-forest-frontiers-paused');
const pkg = await read('rct2-private-objects-package');
const missing = [...old.observed.log.matchAll(/Cannot find object ([^\n]+)/g)].map(match => match[1]);
assert.ok(missing.length > 0, 'negative Chrome control must reproduce missing objects');
assert.deepEqual([...new Set(missing)].sort(), pkg.owner.missingBefore);
assert.equal(fixed.observed.dataset.openrct2State, 'menu');
assert.match(fixed.observed.log, /22 private installation park objects mounted/);
assert.match(fixed.observed.log, /Building object index \(2506 items\)/);
assert.match(fixed.observed.log, /Building scenario index \(143 items\)/);
assert.match(fixed.observed.log, /Finished building scenario index/);
assert.doesNotMatch(fixed.observed.log, /Cannot find object|ERROR\[/);
assert.equal(park.observed.dataset.openrct2State, 'gameplay');
assert.equal(paused.observed.dataset.openrct2State, 'paused');
assert.ok(Number(paused.observed.dataset.openrct2PointerEvents) > Number(park.observed.dataset.openrct2PointerEvents));
assert.ok(Number(park.observed.dataset.openrct2DrawCount) > Number(fixed.observed.dataset.openrct2DrawCount));
assert.doesNotMatch(park.observed.log, /Cannot find object/);
// Preserve the newly discovered limitation; don't turn startup into full RCT1 graphics acceptance.
assert.match(park.observed.log, /require RCT1 linked\. Fallback images will be used/);
const report = { observedAt: new Date().toISOString(), recordedOldMissingMessages: missing.length,
  uniqueOldMissingObjects: [...new Set(missing)].sort(), fixedMissingMessages: 0,
  scenarioIndexCompleted: true, objectCount: 2506, scenarioCount: 143,
  rct1ParkStartsAndPauses: true, rct1SpritePathWarningStillOpen: true,
  visualReview: 'manual review of rct1-private-objects-menu and rct1-forest-frontiers-start JPGs' };
if (process.argv[2]) await fs.writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
console.log(`Paired Chrome evidence: ${missing.length} recorded missing-object messages / ${new Set(missing).size} IDs in old path, zero in repaired completed index; Forest Frontiers starts/pauses with the separate RCT1 link warning still open.`);
