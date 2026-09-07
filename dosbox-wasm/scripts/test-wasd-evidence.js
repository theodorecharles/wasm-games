'use strict';
// Verify retained observations; screenshots still require human visual review.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const proof = path.join(root, 'proofs');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(path.join(proof, file), 'utf8'));
const adapterHash = hash(fs.readFileSync(path.join(root, 'web/game-adapter.js')));
const screenshots = [
  ['jill1-default', 'jill1', false], ['jill1-keyboard-focus', 'jill1', false],
  ['jill1-keyboard-on', 'jill1', true], ['jill1-s-down-attempt', 'jill1', true],
  ['jill1-play-attempt', 'jill1', false],
  ['jill2-fullscreen-attempt-off', 'jill2', false], ['jill2-fullscreen-attempt-on', 'jill2', true],
  ['jill2-space-off', 'jill2', false],
  ['jill3-default', 'jill3', false], ['jill3-on', 'jill3', true], ['jill3-reload-off', 'jill3', false],
  ['jazz-default', 'jazz', false], ['jazz-on', 'jazz', true], ['jazz-off', 'jazz', false],
  ['duke1-default', 'duke1', false], ['duke1-on', 'duke1', true],
  ['duke2-default', 'duke2', false], ['duke2-on', 'duke2', true],
  ['gta-no-control', 'gta', null], ['nfs-no-control', 'nfs', null], ['simcity2000-no-control', 'simcity2000', null]
];
const files = [];
for (const [stem, variant, pressed] of screenshots) {
  const base = `wasd-${stem}-2026-09-06`;
  const { observed } = read(base + '.json');
  assert.equal(observed.dataset.wasmGameVariant, variant, stem);
  assert.equal(observed.dataset.shellDataReady, 'true', stem);
  assert.equal(observed.fullscreen, null, 'fullscreen attempts are not acceptance');
  if (pressed == null) {
    assert.equal(observed.button, null, stem);
    assert.equal(observed.dataset.shellEngineState, 'launcher', 'non-platformer checks are init scope only');
  } else {
    assert.equal(observed.button.pressed, String(pressed), stem);
    assert.equal(observed.button.disabled, false, stem);
    assert.equal(observed.button.text, `WASD movement: ${pressed ? 'On' : 'Off'}`, stem);
    const b = observed.button.bounds;
    assert.ok(b.x >= 0 && b.y >= 0 && b.width > 40 && b.height >= 24 &&
      b.x + b.width <= observed.viewport.width && b.y + b.height <= observed.viewport.height, stem);
    assert.equal(observed.focus.tag, stem === 'jill1-keyboard-focus' ? 'BUTTON' : 'CANVAS', stem);
    assert.match(observed.log, /Browser loop diagnostics: [1-9]\d* machine slices, [1-9]\d* audio callbacks/, stem);
  }
  const jpg = fs.readFileSync(path.join(proof, base + '.jpg'));
  assert.equal(jpg.subarray(0, 3).toString('hex'), 'ffd8ff', stem);
  assert.ok(jpg.length > 10000, stem);
  files.push(base + '.json', base + '.jpg');
}
for (const [kind, wasmHash] of [
  ['current', '968e799bacb2a42c3e5260457e220c9a7421b55d095832db1bfe1b731aaf386f'],
  ['live', '70486266d6a794767154f2175f64f58b1f4dc8065d5f3a1fc21f269f38650dd3']
]) {
  const file = `wasd-bios-${kind}-engine-2026-09-06.json`, result = read(file);
  assert.equal(result.adapterKeyboard, true);
  assert.equal(result.artifacts.find(x => x.file === 'game-adapter.js').sha256, adapterHash);
  assert.equal(result.artifacts.find(x => x.file === 'dosbox.wasm').sha256, wasmHash);
  assert.equal(result.cases.length, 92);
  assert.equal(result.cases.filter(x => x.wasd).length, 12);
  for (const value of result.cases) assert.deepEqual(value.actual, value.expected, JSON.stringify(value));
  assert.deepEqual(result.cases.filter(x => x.wasd).slice(0, 4).map(x => [x.physical, x.actual]), [
    ['KeyW', [0, 0x48]], ['KeyA', [0, 0x4b]], ['KeyS', [0, 0x50]], ['KeyD', [0, 0x4d]]
  ]);
  files.push(file);
}
const pkg = read('wasd-package-2026-09-06.json');
assert.equal(pkg.changed.find(x => x.file.endsWith('/game-adapter.js')).after.sha256, adapterHash);
assert.equal(pkg.unchangedServices, 105);
assert.equal(pkg.unchangedOwnerFiles, 696);
assert.equal(pkg.http.length, 14);
assert.equal(pkg.ready.length, 9);
files.push('wasd-before-2026-09-06.json', 'wasd-package-2026-09-06.json', 'wasd-candidate-2026-09-06.Dockerfile');
const artifacts = files.map(file => {
  const bytes = fs.readFileSync(path.join(proof, file));
  return { file, bytes: bytes.length, sha256: hash(bytes) };
});
const reportFile = path.join(proof, 'wasd-evidence-2026-09-06.json');
if (process.argv.includes('--record')) {
  assert.ok(!fs.existsSync(reportFile), 'do not overwrite recorded evidence');
  fs.writeFileSync(reportFile, JSON.stringify({
    recordedAt: new Date().toISOString(),
    scope: 'Six Chrome controls and three launcher exclusions; native BIOS routing on two engines. Not held gameplay, browser saves, fullscreen or deployment acceptance.',
    adapterHash, artifacts
  }, null, 2) + '\n');
}
assert.deepEqual(JSON.parse(fs.readFileSync(reportFile, 'utf8')).artifacts, artifacts);
console.log(`${screenshots.length} Chrome image/DOM pairs, 184 BIOS results and ${artifacts.length} retained artifact hashes passed.`);
