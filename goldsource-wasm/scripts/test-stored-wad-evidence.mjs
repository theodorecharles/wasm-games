#!/usr/bin/env node
// Verify saved Chrome DOM/native-log evidence; this does not drive a browser.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../proofs/', import.meta.url);
async function load(file) {
  const bytes = await readFile(new URL(file, root));
  return { file, sha256: createHash('sha256').update(bytes).digest('hex'), record: JSON.parse(bytes) };
}
function timing(log) {
  const lines = log.split('\n').map(line => {
    const match = /^\[(\d\d):(\d\d):(\d\d)\] (.*)$/.exec(line);
    return match && { seconds: Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]), text: match[4] };
  }).filter(Boolean);
  const startIndex = lines.findIndex(line => line.text === 'Game started');
  assert.ok(startIndex >= 0, 'native Game started required');
  const begin = lines.slice(0, startIndex).findLast(line => line.text === 'Host_EndGame: The End');
  const end = lines.slice(startIndex).find(line => line.text === 'Custom resource propagation complete.');
  assert.ok(begin && end, 'native New Game and resource completion required');
  const elapsed = later => (later.seconds - begin.seconds + 86400) % 86400;
  return { nativeMapStartSeconds: elapsed(lines[startIndex]), resourceCompleteSeconds: elapsed(end), resolutionSeconds: 1 };
}
const comparisons = [];
for (const [variant, map] of [['blue-shift', 'ba_tram1'], ['opposing-force', 'of0a0']]) {
  const baseline = await load(`${variant}-normal-campaign-2026-09-05.json`);
  const candidate = await load(`${variant}-stored-wad-start-2026-09-05.json`);
  for (const { record } of [baseline, candidate]) {
    assert.equal(record.observed.dataset.goldsourceState, 'gameplay');
    assert.doesNotMatch(record.observed.log, /RuntimeError:|Host_Error:|Host_SysError|unreachable/);
  }
  const before = timing(baseline.record.observed.log);
  const after = timing(candidate.record.observed.log);
  assert.ok(after.nativeMapStartSeconds <= 3, `${variant} native map-start regression`);
  assert.ok(before.nativeMapStartSeconds - after.nativeMapStartSeconds >= 10, `${variant} measured improvement`);
  assert.ok(after.resourceCompleteSeconds <= 5, `${variant} resource completion regression`);
  const departure = await load(`${variant}-stored-wad-status-2026-09-05.json`);
  assert.match(departure.record.observed.log, new RegExp(`map: ${map}`));
  assert.match(departure.record.observed.log, /"host_framerate" is "0"/);
  assert.match(departure.record.observed.log, /"sys_timescale" is "1.0"/);
  assert.match(departure.record.observed.log, /Host_EndGame: disconnected from server/);
  assert.equal(departure.record.observed.dataset.goldsourceState, 'menu');
  const capture = JSON.parse(candidate.record.observed.dataset.goldsourceInputProof);
  assert.ok(capture.some(event => event.type === 'capture-rejected'), 'retain the unresolved capture evidence');
  comparisons.push({ variant, before, after,
    evidence: [baseline, candidate, departure].map(({ file, sha256 }) => ({ file, sha256 })),
    captureAccepted: false, fullCampaignAccepted: false });
}
const repeat = await load('blue-shift-original-wad-repeat-2026-09-05.json');
assert.equal(repeat.record.observed.dataset.goldsourceState, 'gameplay');
const repeatedTiming = timing(repeat.record.observed.log);
assert.ok(repeatedTiming.nativeMapStartSeconds >= 10, 'original compressed-WAD recheck must reproduce the slow stage');
assert.doesNotMatch(repeat.record.observed.log, /RuntimeError:|Host_Error:|Host_SysError|unreachable/);
const repeatDeparture = await load('blue-shift-original-wad-repeat-status-2026-09-05.json');
assert.match(repeatDeparture.record.observed.log, /map: ba_tram1/);
assert.match(repeatDeparture.record.observed.log, /"host_framerate" is "0"/);
assert.match(repeatDeparture.record.observed.log, /"sys_timescale" is "1.0"/);
assert.match(repeatDeparture.record.observed.log, /Host_EndGame: disconnected from server/);
assert.equal(repeatDeparture.record.observed.dataset.goldsourceState, 'menu');
comparisons[0].originalDataRecheck = { file: repeat.file, sha256: repeat.sha256, timing: repeatedTiming,
  departure: { file: repeatDeparture.file, sha256: repeatDeparture.sha256 } };
const report = { generatedAt: new Date().toISOString(), method: 'saved actual Chrome/native-log observations',
  timingPrecision: 'whole seconds; not FPS or full cold-start/network latency', comparisons, passed: true };
if (process.env.WAD_TIMING_PROOF) await writeFile(process.env.WAD_TIMING_PROOF, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
