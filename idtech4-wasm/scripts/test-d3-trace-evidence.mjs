#!/usr/bin/env node
// Validate retained Chrome observations of old/new saves and normal cleanup.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.join(root,'proofs');
const files={};
function bytes(file) {
  const value=fs.readFileSync(path.join(directory,file));
  files[file]={bytes:value.length,sha256:crypto.createHash('sha256').update(value).digest('hex')};
  return value;
}
const read=file=>JSON.parse(bytes(file));
const warning=/idClipModel::FreeTraceModel: tried to free uncached trace model/g;
const warnings=record=>(record.observed.log.match(warning)||[]).length;
function clean(record) {
  assert.equal(warnings(record),0,'no uncached trace-model warning');
  assert.doesNotMatch(record.observed.log,/Savegame Version mismatch|aborting loadgame|invalid savegame|Couldn't open savegame|Save\/config persistence warning|RuntimeError|memory access out of bounds|Aborted\(/i);
}
function observation(variant,stage) {
  const actual=variant==='roe' && stage==='ready-menu'?'ready-visible':stage;
  const stem=`d3-v8-${variant}-${actual}-2026-09-06`;
  const record=read(stem+'.json'),image=bytes(stem+'.jpg');
  assert.ok(Number.isFinite(Date.parse(record.observedAt)));
  assert.ok(image.length>2000);assert.equal(image.readUInt16BE(0),0xffd8);
  assert.equal(record.observed.dataset.wasmGameVariant,variant==='sp'?'doom3':'roe');
  assert.equal(record.observed.dataset.wasmGameMode,'single');
  clean(record);
  return record;
}
function restored(record,map,count) {
  assert.equal(record.observed.dataset.shellEngineState,'gameplay');
  assert.equal((record.observed.log.match(/----- Game Map Init SaveGame -----/g)||[]).length,count);
  assert.ok(record.observed.log.includes('msec to load '+map));
  const tail=record.observed.log.slice(record.observed.log.lastIndexOf('----- Game Map Init SaveGame -----'));
  assert.doesNotMatch(tail,/----- Game Map Init -----|entities spawned|SpawnPlayer: 0/,'no fallback new-map spawn');
}
const position=record=>[...record.observed.log.matchAll(/^\((-?[\d.]+) (-?[\d.]+) (-?[\d.]+)\) (-?[\d.]+)$/gm)].at(-1)?.slice(1).map(Number);
const stages=['launcher','ready-menu','old-slot','old-restored','old-position',
  'repeat-slot','repeat-restored','repeat-position','save-name','saved',
  'reload-launcher','reload-menu','new-slot','new-restored','new-position',
  'final-pause','final-resume','quit-menu'];
const results=[];
for(const [variant,map,expected] of [['sp','game/mars_city1',[1267,-1501,68.25,180]],['roe','game/erebus1',[4456,6888,481.16,180]]]) {
  const records=Object.fromEntries(stages.map(stage=>[stage,observation(variant,stage)]));
  for(let i=1;i<stages.length;i++) assert.ok(Date.parse(records[stages[i]].observedAt)>Date.parse(records[stages[i-1]].observedAt),'ordered observations');
  for(const stage of ['launcher','reload-launcher']) {
    assert.equal(records[stage].observed.dataset.shellEngineState,'launcher');
    assert.equal(records[stage].observed.log,'');
    assert.equal(records[stage].observed.dataset.d3wasmAudioStarts,undefined);
  }
  for(const stage of ['ready-menu','reload-menu']) {
    assert.equal(records[stage].observed.dataset.shellEngineState,'menu');
    assert.ok(records[stage].observed.log.includes('Save/config persistence restored at /save/'+(variant==='sp'?'doom3':'roe')+'.'));
  }
  assert.ok(Number(records['reload-menu'].observed.dataset.d3wasmAudioStarts)<Number(records.saved.observed.dataset.d3wasmAudioStarts),'fresh worker resets the audio counter');
  restored(records['old-restored'],map,1);
  restored(records['repeat-restored'],map,2);
  restored(records['new-restored'],map,1);
  // Native LoadGame also clears the initial empty session before its first map.
  assert.equal((records['old-restored'].observed.log.match(/----- Game Map Shutdown -----/g)||[]).length,1);
  assert.equal((records['repeat-restored'].observed.log.match(/----- Game Map Shutdown -----/g)||[]).length,2);
  const original=read(`d3-v7-${variant}-second-position-2026-09-06.json`);
  assert.deepEqual(position(original),expected);
  for(const stage of ['old-position','repeat-position','new-position']) assert.deepEqual(position(records[stage]),expected,'saved coordinate/yaw: '+stage);
  assert.equal(records.saved.observed.dataset.shellEngineState,'paused');
  assert.equal(records['final-pause'].observed.dataset.shellEngineState,'paused');
  assert.equal(records['final-resume'].observed.dataset.shellEngineState,'gameplay');
  assert.equal(records['final-resume'].observed.dataset.d3wasmAudioState,'running');
  assert.ok(Number(records['final-resume'].observed.dataset.d3wasmAudioStarts)>Number(records['new-restored'].observed.dataset.d3wasmAudioStarts));
  assert.equal(records['quit-menu'].observed.dataset.shellEngineState,'menu');
  assert.equal((records['new-restored'].observed.log.match(/----- Game Map Shutdown -----/g)||[]).length,1);
  assert.equal((records['quit-menu'].observed.log.match(/----- Game Map Shutdown -----/g)||[]).length,2);
  const baseline=read(`d3-v7-${variant}-quit-menu-2026-09-06.json`);
  assert.equal(warnings(baseline),2,'v7 warned on both comparison-load shutdown and final quit');
  assert.throws(()=>clean(baseline),/no uncached trace-model warning/);
  const fallback=structuredClone(records['repeat-restored']);
  fallback.observed.log=fallback.observed.log.replaceAll('----- Game Map Init SaveGame -----','----- Game Map Init -----');
  assert.throws(()=>restored(fallback,map,2));
  results.push({variant,map,position:expected,oldRestoredAt:records['old-restored'].observedAt,
    repeatedAt:records['repeat-restored'].observedAt,newSavedAt:records.saved.observedAt,
    pageReloadAt:records['reload-launcher'].observedAt,newRestoredAt:records['new-restored'].observedAt,
    quitAt:records['quit-menu'].observedAt,baselineWarnings:2,repairedWarnings:0});
}
const packaged=read('d3-trace-cache-package-2026-09-06.json');
const before=read('d3-trace-cache-campaign-package-2026-09-06.json');
const after=read('d3-trace-cache-final-package-2026-09-06.json');
for(let i=0;i<2;i++) {
  assert.equal(before.results[i].image,packaged.image);
  assert.ok(Date.parse(after.results[i].observedAt)>Date.parse(results[i].quitAt));
  for(const field of ['variant','container','port','image','startedAt','restartCount','readOnlyRoot','mounts','imageFiles','httpFiles','status','resources']) assert.deepEqual(after.results[i][field],before.results[i][field],field);
  assert.equal(after.results[i].status.state,'sleeping');
  assert.deepEqual(after.results[i].status.relay,{peers:0,clientPackets:0,serverPackets:0});
  assert.deepEqual(after.results[i].resources,{sessions:[],nativeProcesses:[]});
}
for(const file of ['d3-trace-cache-fixture-2026-09-06.json','d3-trace-cache-fresh-source-2026-09-06.json','d3-trace-cache-http-2026-09-06.json','d3-trace-cache-image-delta-2026-09-06.json']) assert.equal(read(file).passed,true);
const proof={scope:'Actual Chrome on exact isolated v8: native v7 save slots load twice; newly named v8 saves survive full page reload and restore the same coordinates; pause/resume and normal quit complete without the reproduced trace-cache warning. Names, dates, previews, health/ammo and rendered world are visually inspected, not OCR-validated here. Typed-record fixture, exact source/package and no-MP-wake lifecycle evidence are linked. Not arbitrary older saves, full campaigns, held controls/capture, listening or live deployment acceptance.',results,checkedStagesPerVariant:stages.length,files,deployed:false,passed:true};
if(process.env.D3_TRACE_EVIDENCE_PROOF) fs.writeFileSync(process.env.D3_TRACE_EVIDENCE_PROOF,JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({results,checkedFiles:Object.keys(files).length,passed:true},null,2));
