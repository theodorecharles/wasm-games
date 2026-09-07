#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const stem=s=>`proofs/quake4-quad-${s}-2026-09-06`;
const bytes=f=>fs.readFileSync(path.join(root,f));
const read=f=>JSON.parse(bytes(f));
const observation=s=>read(stem(s)+'.json').observation;
const shot=s=>hash(bytes(stem(s)+'.jpg'));
const files={};
const stages=['menu','continue','frozen-default','frozen-bright','frozen-restored','resumed-intro','gameplay','pause','resumed-gameplay','quit'];
for(const s of stages){
 const o=observation(s);
 assert.equal(o.url,'http://127.0.0.1:32961/?game=quake4');
 assert.equal(o.root.wasmGameVariant,'quake4');assert.equal(o.fullscreen,null);
 for(const ext of ['json','jpg'])files[stem(s)+'.'+ext]=hash(bytes(stem(s)+'.'+ext));
 const jpeg=bytes(stem(s)+'.jpg');assert.equal(jpeg.subarray(0,2).toString('hex'),'ffd8');assert.ok(jpeg.length>10000);
}
assert.equal(shot('frozen-default'),'7dd263a2c793906942d0af53fd5aa2cadb47080b7138c81df5ef99f5379746b9');
assert.equal(shot('frozen-restored'),shot('frozen-default'));
assert.equal(shot('frozen-bright'),'118adc8eb339d005a5de0ba59161e53fc8787e9e15164622fa2ac414c2d15b06');
function cvar(stage,name,value){
 const rows=observation(stage).log.split('\n').filter(l=>l.startsWith(`"${name}" is:`));
 assert.ok(rows.length,`${stage}: native ${name} query required`);
 assert.ok(rows.at(-1).startsWith(`"${name}" is:"${value}"`),`${stage}: ${name} must be ${value}`);
}
for(const n of ['r_forceAmbient','r_skipDecals','r_skipOverlays'])cvar('frozen-default',n,0);
cvar('frozen-bright','g_stopTime',1);cvar('frozen-bright','r_forceAmbient',0.2);
cvar('frozen-restored','r_forceAmbient',0);cvar('resumed-intro','g_stopTime',0);
for(const s of ['gameplay','resumed-gameplay'])assert.equal(observation(s).root.shellEngineState,'gameplay');
assert.equal(observation('pause').root.shellEngineState,'paused');
assert.equal(observation('quit').root.shellEngineState,'menu');
assert.ok(Number(observation('gameplay').root.d3wasmAudioStarts)>Number(observation('resumed-intro').root.d3wasmAudioStarts),'playback scheduling advanced; not audible-quality proof');
const policy=read(stem('ambient-policy')+'.json');assert.equal(policy.oldWebPolicyRejected,true);
assert.deepEqual(policy.rows.map(r=>r.output),['640 ambient policy cases passed','640 ambient policy cases passed']);
for(const f of [stem('ambient-policy')+'.json',stem('package')+'.json','tests/q4-ambient-rescue.cpp','scripts/test-q4-ambient-rescue.mjs','scripts/test-q4-immediate-linked.mjs','scripts/test-q4-quad-package.mjs','scripts/test-q4-quad-evidence.mjs'])files[f]=hash(bytes(f));
const result={scope:'Retained Chrome screenshot/DOM integrity, exact frozen brightness restoration, native setting restoration and menu/gameplay lifecycle. Visual judgment is documented in the runbook; not full game acceptance.',pairs:stages.length,files};
const index=path.join(root,stem('evidence')+'.json');
if(process.argv.includes('--record'))fs.writeFileSync(index,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else assert.deepEqual(result,JSON.parse(fs.readFileSync(index,'utf8')));
console.log(`${stages.length} Chrome pairs, exact brightness restoration, native defaults and ${Object.keys(files).length} retained hashes verified.`);
