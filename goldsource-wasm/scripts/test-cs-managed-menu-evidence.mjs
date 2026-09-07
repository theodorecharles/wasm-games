#!/usr/bin/env node
// Audit retained actual Chrome-control observations. Native canvas visuals were
// manually reviewed during control; this is evidence integrity, not OCR.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const directory = new URL('../proofs/', import.meta.url);
const candidateOnly = process.argv[2] === '--candidate';
assert(process.argv.length === 2 || (candidateOnly && process.argv.length === 3));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const files = [], records = {}, maps = {};
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
const negative = await record('cs-managed-menu-candidate-join', 'menu', 'pending');
assert.doesNotMatch(negative.observed.log, /Connecting to|Setting up renderer/,
  'first cleanup candidate failed to activate Join with Enter');
for (const kind of candidateOnly ? ['candidate'] : ['candidate', 'installed']) {
  const scenes = [['cold', 'menu', 'pending'], ['world', 'gameplay', 'server'],
    ['paused', 'paused', 'server'], ['keyboard-resumed', 'gameplay', 'server']];
  if (kind === 'candidate') scenes.splice(1, 0, ['cold-escape', 'menu', 'pending']);
  if (kind === 'candidate') scenes.push(...['options', 'controls', 'audio', 'video', 'customize',
    'options-return', 'options-done'].map(name => [name, 'paused', 'server']));
  scenes.push(['pointer-resumed', 'gameplay', 'server'], ['console', 'menu', 'server'],
    ['roster', 'menu', 'server'], ['confirmation', 'paused', 'server'], ['departure', 'menu', 'pending']);
  if (kind === 'candidate') scenes.push(['rejoined', 'gameplay', 'server'], ['final-menu', 'menu', 'pending']);
  let previous = Date.parse(negative.observedAt);
  for (const [suffix, state, identity] of scenes) {
    const item = await record(`cs-managed-menu-final-${kind}-${suffix}`, state, identity);
    assert(Date.parse(item.observedAt) > previous, 'ordered actual native interactions');
    previous = Date.parse(item.observedAt);
  }
  const roster = records[`cs-managed-menu-final-${kind}-roster`].observed.log;
  const status = roster.slice(roster.lastIndexOf('>status'));
  maps[kind] = status.match(/map:\s+(\S+) at /)?.[1];
  assert(['de_dust', 'de_dust2'].includes(maps[kind]));
  assert.match(status, /players: 1 active \(16 max\)/);
  assert.equal((status.match(/\bBot\s+n\/a\b/g) || []).length, 9);
  assert(status.includes(kind === 'candidate' ? 'ChromeCSMenuFinal' : 'ChromeCSReconnect'));
  assert.match(records[`cs-managed-menu-final-${kind}-world`].observed.log, /Setting up renderer/);
}
const packageProof = JSON.parse(await fs.readFile(new URL('cs-managed-menu-final-package-2026-09-06.json', directory)));
assert(packageProof.passed && packageProof.menuGlobalsRemainPrivate && packageProof.priorExportSetPreserved);
assert.equal(packageProof.addedExport, '_ZN9CMenuMain4ShowEv');
const release = JSON.parse(await fs.readFile(new URL(`cs-managed-menu-final-${candidateOnly ? 'before' : 'installed'}-2026-09-06.json`, directory)));
assert.equal(release.installed, !candidateOnly); assert.equal(release.passed, true);
assert.equal(release.newImage, 'sha256:7f11b1237e3b7f18db616fbf757d609dc89877fd2d5ca695f968deb0f65aa142');
assert.equal(release.unchangedContainers, candidateOnly ? 96 : 97);
if (!candidateOnly) {
  const started = Date.parse(release.containers.find(c => c.name === '/wasm-goldsource-suite').startedAt);
  assert(Date.parse(records['cs-managed-menu-final-candidate-final-menu'].observedAt) < started);
  assert(Date.parse(records['cs-managed-menu-final-installed-cold'].observedAt) > started);
}
const report = { testedAt: new Date().toISOString(), candidateOnly, files, maps,
  observations: Object.keys(records).length,
  review: 'Actual Chrome-control screenshots manually reviewed; no OCR or held-input simulation.',
  rejectedCandidateEnterFailureRetained: true, keyboardJoinAndResumeAccepted: true,
  candidateOptionsNavigationAccepted: true, candidateRejoinAccepted: true,
  pointerResumeConsoleDisconnectAccepted: true, nativeBotCount: 9,
  installedAcceptance: !candidateOnly, sustainedCaptureAccepted: false, heldInputAccepted: false,
  listeningAccepted: false, fullCampaignAcceptance: false, passed: true };
if (process.env.CS_MANAGED_MENU_EVIDENCE_PROOF)
  await fs.writeFile(process.env.CS_MANAGED_MENU_EVIDENCE_PROOF, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
