#!/usr/bin/env node
// Audit retained Chrome observations, not a browser replay or screenshot OCR.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = {}, records = {};
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function bytes(file) {
  const data = fs.readFileSync(path.join(root, file));
  files[file] = hash(data);
  return data;
}
const stages = {
  lifecycle:['launch', 'initial-list', 'original-world', 'bindings', 'first-quicksave',
    'second-position', 'second-quicksave', 'comparison-position', 'quickload-prompt',
    'quickload-expired', 'quickload-confirm', 'quickload-world', 'quickload-position',
    'next-map-intro', 'next-map-scene', 'crossmap-prompt', 'crossmap-world',
    'crossmap-position', 'final-list', 'quick-preview', 'quit'],
  quickload:['launch', 'old-preview', 'old-world', 'old-position', 'prompt', 'expired',
    'confirm', 'world', 'position', 'autosave-preview', 'autosave-world',
    'autosave-loaded', 'crossmap-prompt', 'crossmap-world', 'crossmap-position',
    'final-pause', 'final-resume', 'final-quit']
};
function clean(o) {
  assert.deepEqual(o.proof.errors, []);
  assert.doesNotMatch(o.log, /uncached trace model|Savegame Version mismatch|aborting loadgame|invalid savegame|Couldn't open savegame|Save\/config persistence warning|RuntimeError|memory access out of bounds|Aborted\(/i);
}
let lastTime = -Infinity;
for (const [run, sequence] of Object.entries(stages)) {
  records[run] = {};
  for (const stage of sequence) {
    const stem = `proofs/prey-${run}-${stage}-2026-09-06`;
    const record = JSON.parse(bytes(stem + '.json'));
    const time = Date.parse(record.observedAt);
    assert.ok(Number.isFinite(time) && time > lastTime, `${run}/${stage}: observation order`);
    lastTime = time;
    const o = record.observation;
    assert.equal(o.url, `http://127.0.0.1:32877/?game=prey&proof=prey-${run}-current`);
    assert.equal(o.proof.proofId, `prey-${run}-current`);
    assert.equal(o.root.wasmGameVariant, 'prey');
    assert.equal(o.root.wasmGameMode, 'single');
    assert.equal(o.root.shellInputCaptured, 'false');
    assert.equal(o.fullscreen, null);
    assert.equal(o.pointerLock, null);
    clean(o);
    const jpeg = bytes(stem + '.jpg');
    assert.equal(jpeg.readUInt16BE(0), 0xffd8);
    assert.ok(jpeg.length > 10000);
    if (stage === 'launch') {
      assert.equal(o.root.shellEngineState, 'launcher');
      assert.equal(o.log, '');
      assert.deepEqual(o.proof.input.events, []);
    } else {
      assert.equal(o.proof.persistence.ready, true);
      assert.equal(o.proof.persistence.root, '/save/prey');
      assert.match(o.log, /Save\/config persistence restored at \/save\/prey\./);
      assert.deepEqual(o.canvas, [{cssHeight:1057, cssWidth:1424, height:1057, width:1424}]);
    }
    records[run][stage] = record;
  }
}
const obs = (run, stage) => records[run][stage].observation;
const baseline = stage => obs('lifecycle', stage);
const repaired = stage => obs('quickload', stage);
const loads = o => [...o.log.matchAll(/(\d+) msec to load (game\/[^\s]+)/g)]
  .map(m => ({milliseconds:Number(m[1]), map:m[2]}));
const saveLoads = o => (o.log.match(/Game Map Init SaveGame/g) || []).length;
const position = o => [...o.log.matchAll(/^\((-?[\d.]+) (-?[\d.]+) (-?[\d.]+)\) (-?[\d.]+)$/gm)]
  .map(m => m.slice(1).map(Number)).at(-1);
function world(o, count, saves) {
  assert.equal(o.root.shellEngineState, 'gameplay');
  assert.equal(loads(o).length, count, 'completed loads, not in-flight shell state');
  assert.equal(saveLoads(o), saves);
}
function finalRestore(o, count, saves) {
  world(o, count, saves);
  assert.doesNotMatch(o.log.slice(o.log.lastIndexOf('Game Map Init SaveGame')),
    /Game Map Init -----|entities spawned|SpawnPlayer: 0/, 'no fresh-map fallback');
}
const original = [-282, -340, 68.25, 180], newest = [-282, -356, 68.5, 180];
assert.match(baseline('bindings').log, /"f5" = "savegame quick"/);
assert.match(baseline('bindings').log, /"f9" = "loadgame quick"/);
assert.match(baseline('bindings').log, /"com_numQuicksaves" is:"4" default:"4"/);
assert.deepEqual(position(baseline('bindings')), original);
assert.deepEqual(position(baseline('second-position')), newest);
assert.deepEqual(position(baseline('comparison-position')), [-282, -340, 68.5, 180]);
assert.match(baseline('comparison-position').log, /\]setviewpos -282 -356 68\.25 180/);
assert.match(baseline('comparison-position').log, /\]setviewpos -282 -340 68\.25 180/);
function tapPairs(o, scan, count) {
  const events = o.proof.input.events.filter(e => e.type === 'key' && e.scan === scan);
  assert.equal(events.length, count * 2);
  for (let i = 0; i < events.length; i += 2) {
    assert.equal(events[i].down, true);
    assert.equal(events[i + 1].down, false);
    assert.ok(events[i + 1].at > events[i].at);
  }
  return events;
}
tapPairs(baseline('first-quicksave'), 62, 1);
const f5 = tapPairs(baseline('second-quicksave'), 62, 2);
function timeout(run, prompt, expired, confirm) {
  const data = records[run];
  assert.ok(Date.parse(data[expired].observedAt) - Date.parse(data[prompt].observedAt) > 4000);
  for (const stage of [prompt, expired, confirm]) finalRestore(data[stage].observation, 1, 1);
  assert.deepEqual(loads(data[prompt].observation), loads(data[expired].observation));
  assert.deepEqual(position(data[prompt].observation), position(data[expired].observation));
  tapPairs(data[expired].observation, 66, 1);
}
timeout('lifecycle', 'quickload-prompt', 'quickload-expired', 'quickload-confirm');
timeout('quickload', 'prompt', 'expired', 'confirm');
function confirmation(o, count) {
  const events = tapPairs(o, 66, count);
  const interval = events.at(-2).at - events.at(-4).at;
  assert.ok(interval > 0 && interval < 4000, 'two presses inside native confirmation window');
  return interval;
}
const confirmationMilliseconds = {
  baseline:confirmation(baseline('quickload-world'), 3),
  baselineCrossMap:confirmation(baseline('crossmap-world'), 5),
  repaired:confirmation(repaired('world'), 3),
  repairedCrossMap:confirmation(repaired('crossmap-world'), 5)
};
finalRestore(baseline('quickload-world'), 2, 2);
assert.deepEqual(position(baseline('quickload-position')), newest);
world(baseline('next-map-intro'), 3, 2);
world(baseline('next-map-scene'), 3, 2);
assert.match(baseline('next-map-intro').log, /\]trigger rhEndLevel\nTriggered 1 entities/);
assert.match(baseline('next-map-intro').log, /\.\.\.2747 entities spawned, 79 inhibited/);
assert.equal((baseline('next-map-intro').log.match(/Game Map Init -----/g) || []).length, 1);
assert.equal(loads(baseline('next-map-intro')).at(-1).map, 'game/feedingtowera.map');
finalRestore(baseline('crossmap-world'), 4, 3);
assert.deepEqual(position(baseline('crossmap-position')), newest);

finalRestore(repaired('old-world'), 1, 1);
assert.deepEqual(position(repaired('old-position')), original);
finalRestore(repaired('world'), 2, 2);
assert.deepEqual(position(repaired('position')), newest);
// This early observation deliberately stays an in-flight load, not a world pass.
assert.equal(saveLoads(repaired('autosave-world')), 3);
assert.equal(loads(repaired('autosave-world')).length, 2);
assert.throws(() => finalRestore(repaired('autosave-world'), 3, 3));
finalRestore(repaired('autosave-loaded'), 3, 3);
assert.equal(loads(repaired('autosave-loaded')).at(-1).map, 'game/feedingtowera.map');
finalRestore(repaired('crossmap-world'), 4, 4);
assert.deepEqual(position(repaired('crossmap-position')), newest);
assert.equal(repaired('final-pause').root.shellEngineState, 'paused');
assert.equal(repaired('final-resume').root.shellEngineState, 'gameplay');
assert.doesNotMatch(repaired('final-quit').log, /\]setviewpos|\]trigger|Game Map Init -----/,
  'new candidate uses retained saves, no diagnostic teleport or new-map fallback');
for (const o of [baseline('quit'), repaired('final-quit')]) {
  assert.equal(o.root.shellEngineState, 'menu');
  assert.equal(loads(o).length, 4);
  assert.equal((o.log.match(/Game Map Shutdown/g) || []).length, 5);
  assert.match(o.log.slice(o.log.lastIndexOf('msec to load game/')), /Game Map Shutdown/);
}
const broken = structuredClone(repaired('world'));
broken.log = broken.log.replaceAll('Game Map Init SaveGame', 'Game Map Init');
assert.throws(() => finalRestore(broken, 2, 2));
const warning = structuredClone(repaired('final-quit'));
warning.log += '\nuncached trace model';
assert.throws(() => clean(warning));
const missingPress = structuredClone(repaired('world'));
missingPress.proof.input.events = missingPress.proof.input.events.filter(e => !e.down);
assert.throws(() => confirmation(missingPress, 3));

const prior = JSON.parse(bytes('proofs/prey-trace-cache-package-2026-09-06.json'));
const current = JSON.parse(bytes('proofs/prey-quickload-package-2026-09-06.json'));
assert.equal(prior.image, current.oldImage);
assert.equal(current.image, 'sha256:41d07774c9a0e43859437cc9278dc7bd035e6b0c0cc3219da34259a218e63685');
assert.ok(Date.parse(records.lifecycle.quit.observedAt) < Date.parse(current.startedAt));
assert.ok(Date.parse(records.quickload.launch.observedAt) > Date.parse(current.startedAt));
const regression = JSON.parse(bytes('proofs/prey-quickload-prompt-native-2026-09-06.json'));
assert.equal(regression.legacy, false);
assert.equal(regression.results.filter(r => !r.negative).flatMap(r => r.cases).filter(c => c.passed).length, 26);
assert.equal(regression.results.filter(r => r.negative).flatMap(r => r.cases).filter(c => !c.passed).length, 14);
for (const file of ['proofs/prey-quickload-prompt-legacy-2026-09-06.json',
  'proofs/prey-quickload-source-2026-09-06.json', 'proofs/prey-quickload-candidate-2026-09-06.Dockerfile',
  'scripts/test-prey-quickload-prompt.mjs', 'scripts/test-prey-quickload-package.mjs',
  'scripts/test-prey-quickload-evidence.mjs', 'tests/prey-quickload-prompt.cpp']) bytes(file);
const result = {
  scope:'Retained actual Chrome: baseline trace image creates two distinct quicksaves, expires/confirms quickload, restores newest position, diagnostically triggers the real endlevel path to the second map, and quickloads back. Repaired image visibly labels the prompt f9 (manual screenshot inspection), expires/confirms it, loads both older quicksaves and the prior-image second-map autosave, quickloads back, pauses/resumes/quits. Seven SaveGame loads and one diagnostic new-map load across two images, no cleanup warnings. Screenshots are hashed, not OCR/pixel-tested. No normal campaign, held movement, capture, listening, ring-wrap/oldest overwrite or deployment acceptance.',
  pairs:Object.values(stages).reduce((sum, list) => sum + list.length, 0),
  baselineImage:prior.image, repairedImage:current.image, original, newest,
  baselineLoads:loads(baseline('quit')), repairedLoads:loads(repaired('final-quit')),
  confirmationMilliseconds, f5TapMilliseconds:[f5[1].at-f5[0].at, f5[3].at-f5[2].at],
  retainedSaveSlots:6, cleanupWarnings:0, files
};
const proof = path.join(root, 'proofs/prey-quickload-evidence-2026-09-06.json');
if (process.argv.includes('--record')) fs.writeFileSync(proof, JSON.stringify(result, null, 2) + '\n', {flag:'wx'});
else assert.deepEqual(result, JSON.parse(fs.readFileSync(proof, 'utf8')));
console.log(`${result.pairs} Chrome pairs, seven native save loads, diagnostic map transition, two clean quits and ${Object.keys(files).length} hashes verified.`);
