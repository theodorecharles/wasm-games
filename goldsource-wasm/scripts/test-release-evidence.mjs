// Read-only audit of retained actual Chrome observations, not simulated play.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const evidence = [];
async function load(stem, extension = 'json') {
  const file = `${stem}-2026-09-06.${extension}`;
  const bytes = await readFile(new URL(`../proofs/${file}`, import.meta.url));
  evidence.push({ file, sha256: createHash('sha256').update(bytes).digest('hex') });
  return extension === 'json' ? JSON.parse(bytes) : bytes;
}
const prefix = 'goldsource-release-';
const installed = await load(prefix + 'installed');
const live = installed.containers.find(c => c.name === '/wasm-goldsource-suite');
assert.equal(live.image, 'sha256:967561eca15081284748f7a46178a1f5d8f8024a3aa182e4a95e2a406ca9c2ce');
assert.equal(installed.unchangedContainers, 94);
async function observation(name, variant, state) {
  const result = await load(prefix + name);
  assert(Number.isFinite(Date.parse(result.observedAt)));
  const { dataset, log } = result.observed;
  assert.equal(dataset.wasmGameVariant, variant);
  assert.equal(dataset.goldsourceState, state);
  assert.equal(dataset.shellEngineState, state);
  assert.equal(dataset.shellDataReady, 'true');
  assert.equal(dataset.shellInputCaptured, 'false', 'retain the open capture boundary');
  assert.doesNotMatch(log, /RuntimeError:|Host_Error:|Host_SysError|unreachable|can't open .* for write/);
  return result;
}
function before(a, b) { assert(Date.parse(a.observedAt) < Date.parse(b.observedAt)); }
function seconds(log, expression, last = false) {
  const matches = [...log.matchAll(expression)];
  assert(matches.length, String(expression));
  return (last ? matches.at(-1) : matches[0])[1].split(':')
    .reduce((total, value) => total * 60 + Number(value), 0);
}
function timing(log) {
  const start = seconds(log, /\[(\d\d:\d\d:\d\d)\] Host_EndGame: The End/g, true);
  const game = seconds(log, /\[(\d\d:\d\d:\d\d)\] Game started/g);
  const resources = seconds(log, /\[(\d\d:\d\d:\d\d)\] Custom resource propagation complete/g);
  assert(start <= game && game <= resources);
  return { nativeStartSeconds: game - start, throughResourcesSeconds: resources - start };
}

const oldWorld = await observation('old-blue-shift-world', 'blue-shift', 'gameplay');
const oldSaved = await observation('old-blue-shift-saved', 'blue-shift', 'gameplay');
assert.match(oldSaved.observed.log, /Saving game to save\/save000\.sav/);
const oldDeparture = await observation('old-blue-shift-departure', 'blue-shift', 'menu');
assert.match(oldDeparture.observed.log, /map: ba_tram1[^]*Host_EndGame: disconnected from server/);
const menu = await observation('installed-blue-shift-save-list', 'blue-shift', 'menu');
const restored = await observation('installed-blue-shift-restored', 'blue-shift', 'gameplay');
before(oldWorld, oldSaved); before(oldSaved, oldDeparture); before(oldDeparture, menu); before(menu, restored);
assert(Date.parse(oldDeparture.observedAt) < Date.parse(live.startedAt));
assert(Date.parse(live.startedAt) < Date.parse(menu.observedAt));
assert.match(restored.observed.log, /Console initialized\.[^]*Loading game from save\/save000\.sav[^]*Loading game from save\/ba_tram1\.HL1[^]*Game started[^]*Custom resource propagation complete/);
assert.doesNotMatch(restored.observed.log, /Saving game to|Host_EndGame: The End/);
assert.notEqual(restored.observed.log.split('\n')[0], oldSaved.observed.log.split('\n')[0]);
const hints = await observation('installed-blue-shift-hints', 'blue-shift', 'paused');
const restoreDeparture = await observation('installed-blue-shift-restore-departure', 'blue-shift', 'menu');
before(restored, hints); before(hints, restoreDeparture);
assert.match(restoreDeparture.observed.log, /map: ba_tram1[^]*Host_EndGame: disconnected from server/);
assert.doesNotMatch(restoreDeparture.observed.log, /Saving game to/);
const fresh = await observation('installed-blue-shift-fresh-world', 'blue-shift', 'gameplay');
const freshDeparture = await observation('installed-blue-shift-fresh-departure', 'blue-shift', 'menu');
before(restoreDeparture, fresh); before(fresh, freshDeparture);
assert.match(freshDeparture.observed.log, /map: ba_tram1[^]*Host_EndGame: disconnected from server/);
assert.doesNotMatch(freshDeparture.observed.log, /Loading game from|Saving game to/);
const oldTiming = timing(oldWorld.observed.log), newTiming = timing(fresh.observed.log);
assert.deepEqual(oldTiming, { nativeStartSeconds: 20, throughResourcesSeconds: 22 });
assert.deepEqual(newTiming, { nativeStartSeconds: 1, throughResourcesSeconds: 1 });

const opposingForce = await observation('installed-opposing-force-helicopter', 'opposing-force', 'gameplay');
const opposingPause = await observation('installed-opposing-force-paused', 'opposing-force', 'paused');
const opposingDeparture = await observation('installed-opposing-force-departure', 'opposing-force', 'menu');
before(freshDeparture, opposingForce); before(opposingForce, opposingPause); before(opposingPause, opposingDeparture);
assert.match(opposingDeparture.observed.log, /map: of0a0[^]*Host_EndGame: disconnected from server/);
assert.doesNotMatch(opposingDeparture.observed.log, /Loading game from|Saving game to/);
const opposingTiming = timing(opposingForce.observed.log);
assert.deepEqual(opposingTiming, { nativeStartSeconds: 0, throughResourcesSeconds: 2 });

const halfPause = await observation('installed-half-life-paused', 'half-life', 'paused');
const halfLife = await observation('installed-half-life-tram', 'half-life', 'gameplay');
const halfDeparture = await observation('installed-half-life-departure', 'half-life', 'menu');
before(opposingDeparture, halfPause); before(halfPause, halfLife); before(halfLife, halfDeparture);
assert.match(halfDeparture.observed.log, /map: c0a0[^]*Host_EndGame: disconnected from server/);
assert.doesNotMatch(halfDeparture.observed.log, /Loading game from|Saving game to/);

const csWorld = await observation('installed-counter-strike-world', 'counter-strike', 'gameplay');
const csPause = await observation('installed-counter-strike-paused', 'counter-strike', 'paused');
const csResumeAttempt = await observation('installed-counter-strike-resumed', 'counter-strike', 'paused');
const csEscape = await observation('installed-counter-strike-escape-resume', 'counter-strike', 'gameplay');
const csRoster = await observation('installed-counter-strike-roster', 'counter-strike', 'menu');
const csDeparture = await observation('installed-counter-strike-departure', 'counter-strike', 'menu');
const csFinalMenu = await observation('installed-counter-strike-disconnected-menu', 'counter-strike', 'menu');
before(halfDeparture, csWorld); before(csWorld, csPause); before(csPause, csResumeAttempt);
before(csResumeAttempt, csEscape); before(csEscape, csRoster); before(csRoster, csDeparture);
before(csDeparture, csFinalMenu);
assert.equal(csWorld.observed.dataset.goldsourceIdentity, 'server');
assert.match(csWorld.observed.log, /BUILD 3946 SERVER[^]*Setting up renderer/);
assert.match(csRoster.observed.log, /map:\s+de_dust at/);
assert.match(csRoster.observed.log, /players: 1 active \(16 max\)/);
assert.match(csRoster.observed.log, /\sChromeCSReconnect\n/);
const botRows = csRoster.observed.log.split('\n').filter(line => /^\[\d\d:\d\d:\d\d\]\s+\d+\s+\d+ Bot\s/.test(line));
assert.equal(botRows.length, 9);
assert.equal(csDeparture.observed.dataset.goldsourceIdentity, 'pending');
assert.match(csDeparture.observed.log, />disconnect\n$/);
assert.equal(csFinalMenu.observed.dataset.goldsourceIdentity, 'pending');
assert.equal(csFinalMenu.observed.log, csDeparture.observed.log, 'no further server messages after departure');

for (const name of ['old-blue-shift-save-list', 'old-blue-shift-save-actions', 'old-blue-shift-saved',
  'installed-blue-shift-save-list', 'installed-blue-shift-restored', 'installed-blue-shift-hints',
  'installed-blue-shift-fresh-world', 'installed-opposing-force-helicopter',
  'installed-opposing-force-paused', 'installed-half-life-paused', 'installed-half-life-tram',
  'installed-counter-strike-world', 'installed-counter-strike-paused',
  'installed-counter-strike-resumed', 'installed-counter-strike-escape-resume',
  'installed-counter-strike-roster', 'installed-counter-strike-disconnected-menu']) await load(prefix + name, 'jpg');

const report = { observedAt: new Date().toISOString(),
  method: 'retained actual Chrome UI/native logs; screenshots manually reviewed, not OCR-tested',
  liveImage: live.image, liveContainer: live.id,
  compatibilitySaveRestored: true, nativeHintsVisuallyVerified: true,
  blueShiftTiming: { old: oldTiming, installed: newTiming, resolution: 'whole-second native logs' },
  opposingForceIntro: { ...opposingTiming, timingOrigin: 'last of two native reset markers, one second apart' },
  halfLifeStartupPauseResume: true,
  counterStrike: { map: 'de_dust', bots: botRows.length, firstPersonSpawn: true,
    escapeResume: true, resumeButtonAccepted: false, nativeDisconnect: true },
  sustainedCaptureAccepted: false, heldControlsAccepted: false, audiblePlaybackAccepted: false,
  fullCampaignAccepted: false, evidence, passed: true };
if (process.env.RELEASE_EVIDENCE_PROOF) await writeFile(process.env.RELEASE_EVIDENCE_PROOF, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
