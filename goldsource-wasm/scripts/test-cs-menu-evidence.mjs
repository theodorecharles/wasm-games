#!/usr/bin/env node
// Audit saved DOM/log observations and screenshot identities from actual Chrome
// control. Visual acceptance is the review recorded in the runbook, not OCR.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const directory = new URL('../proofs/', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const files = [], records = {};
async function record(stem, state, identity) {
  const name = stem + '-2026-09-06';
  const raw = await fs.readFile(new URL(name + '.json', directory));
  const shot = await fs.readFile(new URL(name + '.jpg', directory));
  const item = JSON.parse(raw), d = item.observed.dataset;
  assert.equal(d.wasmGameVariant, 'counter-strike');
  assert.equal(d.goldsourceState, state); assert.equal(d.shellEngineState, state);
  assert.equal(d.goldsourceIdentity, identity); assert.equal(d.shellInputCaptured, 'false');
  assert.equal(d.shellDataReady, 'true'); assert(Number.isFinite(Date.parse(item.observedAt)));
  assert(shot.length > 10000 && shot[0] === 0xff && shot[1] === 0xd8, 'retained JPEG');
  files.push({ file: name + '.json', sha256: hash(raw) }, { file: name + '.jpg', sha256: hash(shot) });
  records[stem] = item; return item;
}
for (const [suffix, state, identity] of [['paused', 'paused', 'server'], ['resumed', 'paused', 'server'],
  ['disconnected-menu', 'menu', 'pending']])
  await record('goldsource-release-installed-counter-strike-' + suffix, state, identity);
for (const kind of ['candidate', 'installed']) {
  const scenes = [['cold', 'menu', 'pending'], [kind === 'candidate' ? 'world' : 'team-select', 'gameplay', 'server'],
    ['paused', 'paused', 'server'], ['resumed', 'gameplay', 'server'], ['console', 'menu', 'server'],
    ['roster', 'menu', 'server'], ['departure', 'menu', 'pending']];
  if (kind === 'candidate') scenes.push(['rejoined', 'gameplay', 'server'], ['final-menu', 'menu', 'pending']);
  let previous = 0;
  for (const [suffix, state, identity] of scenes) {
    const item = await record(`cs-menu-globals-${kind}-${suffix}`, state, identity);
    assert(Date.parse(item.observedAt) > previous, 'native interaction observations are ordered');
    previous = Date.parse(item.observedAt);
  }
  const roster = records[`cs-menu-globals-${kind}-roster`].observed.log;
  const status = roster.slice(roster.lastIndexOf('>status'));
  assert.match(status, /map:\s+de_dust2 at /); assert.match(status, /players: 1 active \(16 max\)/);
  assert.equal((status.match(/\bBot\s+n\/a\b/g) || []).length, 9);
  assert(status.includes(kind === 'candidate' ? 'ChromeCSMenuGlobals' : 'ChromeCSReconnect'));
  assert.match(records[`cs-menu-globals-${kind}-resumed`].observed.log, /Setting up renderer/);
}
const release = JSON.parse(await fs.readFile(new URL('cs-menu-globals-installed-2026-09-06.json', directory)));
assert.equal(release.installed, true); assert.equal(release.passed, true); assert.equal(release.unchangedContainers, 95);
const started = Date.parse(release.containers.find(c => c.name === '/wasm-goldsource-suite').startedAt);
assert(Date.parse(records['cs-menu-globals-candidate-final-menu'].observedAt) < started);
assert(Date.parse(records['cs-menu-globals-installed-cold'].observedAt) > started);
const report = { testedAt: new Date().toISOString(), files, observations: Object.keys(records).length,
  review: 'Actual Chrome-control screenshots manually reviewed; no OCR or held-input simulation.',
  oldResumeButtonReproducedBroken: true, candidateResumeButtonAccepted: true, installedResumeButtonAccepted: true,
  candidateRejoinAccepted: true, installedConsoleAndDisconnectAccepted: true, installedReturnedMenuArtworkAccepted: true,
  nativeBotCount: 9, sustainedCaptureAccepted: false, heldInputAccepted: false, listeningAccepted: false,
  irrelevantMenuControlsFixed: false, fullCampaignAcceptance: false, passed: true };
if (process.env.CS_MENU_EVIDENCE_PROOF) await fs.writeFile(process.env.CS_MENU_EVIDENCE_PROOF, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
