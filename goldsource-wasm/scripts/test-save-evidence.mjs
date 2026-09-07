#!/usr/bin/env node
// Read-only verification of saved, actual Chrome DOM/native-log observations.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const evidence = [];
async function load(file) {
  const bytes = await readFile(new URL(`../proofs/${file}`, import.meta.url));
  evidence.push({ file, sha256: createHash('sha256').update(bytes).digest('hex') });
  return file.endsWith('.json') ? JSON.parse(bytes) : bytes;
}
function healthy(observed, state) {
  assert.equal(observed.dataset.wasmGameVariant, 'blue-shift');
  assert.equal(observed.dataset.goldsourceState, state);
  assert.doesNotMatch(observed.log, /RuntimeError:|Host_Error:|Host_SysError|unreachable|can't open .* for write/);
}
const original = await load('blue-shift-save-before-reload-2026-09-05.json');
healthy(original.start.observed, 'gameplay');
assert.match(original.saved.observed.log, /Saving game to save\/save000\.sav/);
assert.match(original.beforeReload.observed.log, /map: ba_tram1/);
assert.match(original.beforeReload.observed.log, /"host_framerate" is "0"/);
assert.match(original.beforeReload.observed.log, /"sys_timescale" is "1.0"/);
const departure = await load('blue-shift-save-departure-2026-09-05.json');
healthy(departure.observed, 'menu');
assert.match(departure.observed.log, /Host_EndGame: disconnected from server/);
const restored = await load('blue-shift-save-reloaded-2026-09-05.json');
healthy(restored.observed, 'gameplay');
assert.ok(Date.parse(restored.reloadAt) > Date.parse(departure.observedAt));
assert.ok(Date.parse(restored.loadAt) > Date.parse(restored.reloadAt));
const restoreLog = restored.observed.log;
assert.match(restoreLog, /Console initialized\.[^]*Loading game from save\/save000\.sav[^]*Loading game from save\/ba_tram1\.HL1[^]*Game started[^]*Custom resource propagation complete/);
assert.doesNotMatch(restoreLog, /Saving game to|Host_EndGame: The End/);
assert.notEqual(restoreLog.split('\n')[0], original.start.observed.log.split('\n')[0], 'fresh native initialization, not merely an in-memory load');
const quickSave = await load('blue-shift-quicksave-key-2026-09-05.json');
const quickLoad = await load('blue-shift-quickload-key-2026-09-05.json');
healthy(quickSave.observed, 'gameplay');
healthy(quickLoad.observed, 'gameplay');
assert.match(quickSave.observed.log, /Quick Saving[^]*Saving game to save\/quick\.sav/);
assert.match(quickLoad.observed.log, /Quick Loading[^]*Loading game from save\/quick\.sav[^]*Game started[^]*Custom resource propagation complete/);
const final = await load('blue-shift-save-final-status-2026-09-05.json');
healthy(final.observed, 'menu');
assert.match(final.observed.log, /map: ba_tram1/);
assert.match(final.observed.log, /"F7" = "loadquick"/);
assert.match(final.observed.log, /"host_framerate" is "0"/);
assert.match(final.observed.log, /"sys_timescale" is "1.0"/);
assert.match(final.observed.log, /Host_EndGame: disconnected from server/);
const hints = await load('blue-shift-save-hints-fixed-2026-09-05.json');
healthy(hints.observed, 'paused');
const captures = JSON.parse(hints.observed.dataset.goldsourceInputProof);
assert.ok(captures.some(event => event.type === 'capture-rejected'), 'do not silently close the remaining capture failure');
const hintFinal = await load('blue-shift-save-hints-final-status-2026-09-05.json');
healthy(hintFinal.observed, 'menu');
assert.match(hintFinal.observed.log, /map: ba_tram1/);
assert.match(hintFinal.observed.log, /"F6" = "savequick"/);
assert.match(hintFinal.observed.log, /"F7" = "loadquick"/);
assert.match(hintFinal.observed.log, /"host_framerate" is "0"/);
assert.match(hintFinal.observed.log, /"sys_timescale" is "1.0"/);
assert.match(hintFinal.observed.log, /Host_EndGame: disconnected from server/);
for (const file of ['blue-shift-save-new-menu-2026-09-05.jpg', 'blue-shift-save-reloaded-menu-2026-09-05.jpg',
  'blue-shift-save-reloaded-world-2026-09-05.jpg', 'blue-shift-save-hints-fixed-2026-09-05.jpg']) await load(file);
const report = { generatedAt: new Date().toISOString(),
  method: 'saved actual Chrome UI and native-log observations; images manually reviewed, not OCR-tested',
  blueShiftMenuSaveAcrossPageReload: true, blueShiftQuickSaveLoadKeys: true,
  captureAccepted: false, fullCampaignAccepted: false, evidence, passed: true };
if (process.env.SAVE_EVIDENCE_PROOF) await writeFile(process.env.SAVE_EVIDENCE_PROOF, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
