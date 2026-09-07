#!/usr/bin/env node
// Check record integrity/state coverage; visual conclusions remain human/Chrome
// observations, never inferred from a filename or the configured-controls mask.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'proofs');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hashes = {}, records = {};
const names = fs.readdirSync(dir).filter(file => /^(wolf|spear)-palette-.*-2026-09-06\.json$/.test(file)).sort();
for (const file of names) {
  const bytes = fs.readFileSync(path.join(dir, file));
  const r = JSON.parse(bytes), o = r.observation;
  const game = file.startsWith('wolf-') ? 'wolf3d' : 'spear';
  const live = file.includes('-live-');
  const port = game === 'wolf3d' ? (live ? 8011 : 32990) : (live ? 8012 : 32991);
  assert.equal(o.url, `http://127.0.0.1:${port}/`);
  assert.equal(o.root.wasmGameVariant, game);
  assert.equal(o.root.wolf3dControlsValid, 'true');
  assert.equal(o.pointerLock, null);
  assert.equal(o.root.shellInputCaptured, 'false');
  assert(o.canvas.some(c => c.width === 960 && c.height === 720));
  const jpg = file.replace(/json$/, 'jpg'), image = fs.readFileSync(path.join(dir, jpg));
  assert.equal(image.readUInt16BE(0), 0xffd8); assert(image.length > 10000);
  hashes[file] = hash(bytes); hashes[jpg] = hash(image); records[file] = r;
}
for (const game of ['wolf', 'spear']) {
  for (const [suffix, state] of [['menu', 'menu'], ['view', 'menu'], ['view-return', 'menu'],
    ['difficulty', 'menu'], ['world', 'gameplay'], ['pause', 'paused'], ['resumed', 'gameplay']]) {
    const name = `${game}-palette-live-${suffix}-2026-09-06.json`;
    assert.equal(records[name]?.observation.root.shellEngineState, state, name);
  }
}
const release = JSON.parse(fs.readFileSync(path.join(dir, 'palette-release-after-2026-09-06.json')));
assert.equal(release.deployed, true); assert.equal(release.otherContainersUnchanged, 147);
assert.equal(release.ownerFilesUnchanged, 18);
for (const file of ['palette-release-before-2026-09-06.json', 'palette-release-after-2026-09-06.json',
  'palette-native-2026-09-06.json']) hashes[file] = hash(fs.readFileSync(path.join(dir, file)));
const result = { observedAt: new Date().toISOString(), chromePairs: names.length,
  livePairs: names.filter(x => x.includes('-live-')).length, hashes,
  visuallyObserved: { candidates: 'Both dialogs, clean return, first level, W movement, mouse fire 8→7, pause/resume in both games.',
    live: 'Both view dialogs, clean return, native first level and pause/resume. Wolf W movement; Spear mouse fire 8→7.',
    unresolved: 'Two live Wolf mouse-fire attempts stayed at 8 rounds; live Spear W tap did not visibly move. Candidate controls success does not establish live reliability. Several candidate Wolf custom-binding labels looked blank.' },
  captureProven: false, heldControlsProven: false, listeningProven: false, fullGameAccepted: false };
if (process.env.WOLF_EVIDENCE_PROOF) fs.writeFileSync(process.env.WOLF_EVIDENCE_PROOF,
  JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ chromePairs: result.chromePairs, livePairs: result.livePairs,
  hashes: Object.keys(hashes).length, checked: true }, null, 2));
