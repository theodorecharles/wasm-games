'use strict';
// Optional recorded Chrome proof validation, not a substitute for UI inspection.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../proofs');
const records = [];
assert(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--installed'), 'only --installed is supported');
function read(stem, state, player, screenshot = true) {
  const file = path.join(root, `${stem}-2026-09-06.json`);
  const proof = JSON.parse(fs.readFileSync(file, 'utf8'));
  const data = proof.observed.dataset;
  assert.ok(Number.isFinite(Date.parse(proof.observedAt)), stem);
  assert.equal(data.wasmGameVariant, 'quake3', stem);
  assert.equal(data.shellEngineState, state, stem);
  assert.equal(data.q3NativeActive, ['gameplay', 'paused'].includes(state) ? '1' : '0', stem);
  assert.equal(data.q3NativeName, player, stem);
  assert.equal(data.q3Persistence, 'ready', stem);
  assert.doesNotMatch(proof.observed.log, /RuntimeError:|Aborted\(|memory access out of bounds/, stem);
  let imageSha256 = null;
  if (screenshot) {
    const image = fs.readFileSync(path.join(root, `${stem}-2026-09-06.jpg`));
    assert.deepEqual([...image.subarray(0, 3)], [0xff, 0xd8, 0xff], stem);
    imageSha256 = crypto.createHash('sha256').update(image).digest('hex');
  }
  records.push({ stem, observedAt: proof.observedAt, state, player,
    captured: data.shellInputCaptured === 'true', imageSha256 });
  return proof;
}
if (process.argv[2] === '--installed') {
  read('quake3-release-menu', 'menu', 'Q3Proof906');
  read('quake3-release-world', 'gameplay', 'Q3Proof906');
  read('quake3-release-pause', 'paused', 'Q3Proof906');
  read('quake3-release-disconnected', 'menu', 'Q3Proof906');
  const rejoined = read('quake3-release-rejoined-active', 'gameplay', 'Q3Proof906');
  read('quake3-release-rejoined-pause', 'paused', 'Q3Proof906');
  read('quake3-release-final-disconnected', 'menu', 'Q3Proof906');
  assert.equal((rejoined.observed.log.match(/Q3Proof906\^7 entered the game/g) || []).length, 2);
  for (let i = 1; i < records.length; i++) {
    assert.ok(Date.parse(records[i].observedAt) > Date.parse(records[i - 1].observedAt), 'Chrome chronology');
  }
  const observations = JSON.parse(fs.readFileSync(path.join(root, 'quake3-release-server-2026-09-06.json'), 'utf8'));
  const status = label => {
    const matches = observations.filter(row => row.label === label);
    assert.equal(matches.length, 1, label);
    assert.equal(matches[0].status.error, null, label);
    return matches[0].status;
  };
  assert.equal(status('before-first-join').state, 'sleeping');
  assert.equal(status('before-first-join').humans, 0);
  assert.equal(status('first-disconnect').humans, 0);
  assert.equal(status('rejoined-active').state, 'running');
  assert.equal(status('rejoined-active').map, 'q3dm11');
  assert.equal(status('rejoined-active').humans, 1);
  assert.equal(status('rejoined-active').bots, 7);
  assert.equal(status('final-disconnect').humans, 0);
  assert.equal(status('final-disconnect').bots, 8);
  assert.ok(status('final-disconnect').idleSince > 0);
  const report = { observedAt: new Date().toISOString(), records, serverObservations: observations.length,
    captureAccepted: false, heldControlsAccepted: false, audiblePlaybackAccepted: false,
    visualNote: 'Native menus, absence of stale JOINING text and gameplay screenshots manually inspected through Chrome control; file hashes are not a pixel oracle.' };
  fs.writeFileSync(path.join(root, 'quake3-release-chrome-2026-09-06.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ installed: true, chromeRecords: records.length, serverObservations: observations.length, captureAccepted: false }, null, 2));
  process.exit(0);
}
read('quake3-installed-first-join', 'gameplay', 'Q3Proof906');
read('quake3-installed-pause-settled', 'paused', 'Q3Proof906');
read('quake3-installed-escape-resume', 'gameplay', 'Q3Proof906');
read('quake3-installed-click-resume', 'gameplay', 'Q3Proof906');
read('quake3-installed-disconnected', 'menu', 'Q3Proof906');
read('quake3-status-candidate-menu', 'menu', 'Q3Status906');
read('quake3-status-candidate-world', 'gameplay', 'Q3Status906');
read('quake3-status-candidate-pause', 'paused', 'Q3Status906');
read('quake3-status-candidate-disconnected', 'menu', 'Q3Status906');
const rejoin = read('quake3-status-candidate-rejoined', 'gameplay', 'Q3Status906');
assert.equal((rejoin.observed.log.match(/Q3Status906\^7 entered the game/g) || []).length, 2);
read('quake3-status-candidate-final-disconnected', 'menu', 'Q3Status906');
const observations = JSON.parse(fs.readFileSync(path.join(root, 'quake3-status-server-2026-09-06.json'), 'utf8'));
function status(label) {
  const matches = observations.filter(item => item.label === label);
  assert.equal(matches.length, 1, label);
  assert.equal(matches[0].status.error, null, label);
  return matches[0].status;
}
assert.equal(status('candidate-before-first-join').state, 'sleeping');
for (const label of ['candidate-active-world', 'candidate-rejoined']) {
  const value = status(label);
  assert.equal(value.state, 'running');
  assert.equal(value.humans, 1);
  assert.equal(value.bots, 7);
  assert.equal(value.map, 'q3dm7');
}
for (const label of ['candidate-first-disconnect', 'candidate-final-disconnect']) {
  const value = status(label);
  assert.equal(value.humans, 0);
  assert.equal(value.bots, 8);
  assert.ok(value.idleSince > 0);
}
assert.equal(status('installed-idle').state, 'sleeping');
assert.equal(status('installed-final').state, 'sleeping');
assert.equal(status('installed-final').humans, 0);
const report = { observedAt: new Date().toISOString(), records, serverObservations: observations.length,
  captureAccepted: false, heldControlsAccepted: false, audiblePlaybackAccepted: false,
  visualNote: 'Screenshots manually inspected through Chrome control; JPEG checks here establish artifact integrity, not a pixel oracle.' };
fs.writeFileSync(path.join(root, 'quake3-chrome-evidence-2026-09-06.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ chromeRecords: records.length, serverObservations: observations.length, captureAccepted: false }, null, 2));
