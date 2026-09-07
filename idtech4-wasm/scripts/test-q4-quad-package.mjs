#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {repairImmediateBuffer} from '../.work/openq4/tools/build/emscripten_immediate_buffer.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),checkout=path.join(root,'.work/openq4');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const cmd=(name,args,options={})=>execFileSync(name,args,{encoding:'utf8',maxBuffer:32*1024*1024,...options}).trim();
const inspect=name=>JSON.parse(cmd('docker',['inspect',name]))[0];
const inventoryCode=`const fs=require('fs'),path=require('path'),crypto=require('crypto'),result={};function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile())result[p]=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}}for(const d of ['/opt/game-site','/opt/shared-shell','/opt/wasm-game-framework'])walk(d);process.stdout.write(JSON.stringify(result));`;
const inventory=n=>JSON.parse(cmd('docker',['exec',n,'node','-e',inventoryCode]));
const base='q4-border-size-proof-20260906',name='q4-quad-proof-20260906';
const before=inventory(base),actual=inventory(name),c=inspect(name);
assert.equal(c.Image,'sha256:fc651e2b5697e8605f53566d1e1d67b600e09d3c7166a51d3292cabc519d932a');
assert.equal(c.State.Running,true);assert.equal(c.HostConfig.ReadonlyRootfs,true);
assert.deepEqual(c.HostConfig.PortBindings,{'8088/tcp':[{HostIp:'127.0.0.1',HostPort:'32961'}]});
const owner=c.Mounts.find(m=>m.Destination==='/data/q4base');
assert.equal(owner.Source,'/home/ted/wasm-game-data/quake4/q4base');assert.equal(owner.RW,false);
const changed=Object.keys(before).filter(p=>before[p]!==actual[p]).sort();
assert.deepEqual(Object.keys(actual).sort(),Object.keys(before).sort());
assert.deepEqual(changed,['/opt/game-site/openQ4-client_wasm32.js','/opt/game-site/openQ4-client_wasm32.wasm']);
const js=fs.readFileSync(path.join(checkout,'build/web/openQ4-client_wasm32.js'),'utf8');
for(const p of changed){
 const local=path.basename(p);
 for(const directory of ['web','web-meson-6.0.6'])assert.equal(hash(fs.readFileSync(path.join(checkout,'build',directory,local))),actual[p]);
 const response=await fetch('http://127.0.0.1:32961/'+local);assert.equal(response.status,200);assert.equal(hash(Buffer.from(await response.arrayBuffer())),actual[p]);
}
const prior=execFileSync('docker',['exec',base,'node','-e',"process.stdout.write(require('fs').readFileSync('/opt/game-site/openQ4-client_wasm32.js'))"],{encoding:'utf8',maxBuffer:8*1024*1024});
const seam=s=>s.match(/var _emscripten_glEnd = \(\) => \{[\s\S]*?\n    \};\n  _emscripten_glEnd\.sig/)?.[0];
assert.equal(seam(js),seam(repairImmediateBuffer(prior)),'fresh linked implementation must equal the regression-tested repair');
const productionModule=fs.readFileSync(path.join(checkout,'tools/build/emscripten_immediate_buffer.mjs'),'utf8');
assert.equal(productionModule,fs.readFileSync(path.join(root,'tests/q4-immediate-buffer-transform.mjs'),'utf8').replace('// Candidate-only SDK repair.','// SDK repair.'));
assert.match(fs.readFileSync(path.join(checkout,'meson.build'),'utf8'),/engine_link_depends \+= files\(\s+'tools\/build\/emscripten_immediate_buffer.mjs'/);
assert.match(fs.readFileSync(path.join(checkout,'build/web-meson-6.0.6/build.ninja'),'utf8'),/^build openQ4-client_wasm32\.js:.*\|.*\/tools\/build\/emscripten_immediate_buffer\.mjs(?: |$)/m,'SDK repair must be an actual client link dependency (absolute or relative Meson path)');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'q4-quad-package-'));
const priorFile=path.join(temporary,'prior.js');fs.writeFileSync(priorFile,prior);
cmd(process.execPath,[path.join(root,'scripts/test-q4-immediate-buffer.mjs'),priorFile]);
cmd(process.execPath,[path.join(root,'scripts/test-q4-ambient-rescue.mjs')]);
let expectedTree,actualTree;
for(const [label,apply] of [['expected',true],['actual',false]]){
 const options={cwd:checkout,env:{...process.env,GIT_INDEX_FILE:path.join(temporary,label)}};
 cmd('git',['read-tree','HEAD'],options);
 cmd('git',apply?['apply','--cached','--whitespace=nowarn',path.join(root,'patches/openq4-browser.patch')]:['add','-A'],options);
 const tree=cmd('git',['write-tree'],options);if(apply)expectedTree=tree;else actualTree=tree;
}
assert.equal(actualTree,expectedTree,'prepared source must exactly match canonical patch');
// Former package scripts intentionally pin the earlier source/build. Verify
// their retained runtime identities here without pretending the old tree is current.
for(const proof of ['quake4-intro-package-2026-09-06.json','quake4-intro-sequence-package-2026-09-06.json']){
 const p=JSON.parse(fs.readFileSync(path.join(root,'proofs',proof),'utf8'));
 for(const row of p.containers){const old=inspect(row.name);assert.equal(old.Id,row.id);assert.equal(old.Image,row.image);assert.deepEqual(inventory(row.name),row.files);}
}
assert.deepEqual(before,JSON.parse(fs.readFileSync(path.join(root,'proofs/quake4-border-size-package-2026-09-06.json'),'utf8')).files);
const status=await(await fetch('http://127.0.0.1:32961/game-data/status?game=quake4')).json();
assert.equal(status.ready,true);assert.equal(status.files.length,32);
const result={scope:'Canonical immediate-buffer and WebGL rescue-floor repair; isolated candidate, not live promotion or full campaign acceptance.',name,id:c.Id,image:c.Image,port:32961,sourceTree:actualTree,patchSHA256:hash(fs.readFileSync(path.join(root,'patches/openq4-browser.patch'))),changed,unchanged:45,files:actual,ownerFiles:32,retainedObserverPackagesUnchanged:true};
const proof=path.join(root,'proofs/quake4-quad-package-2026-09-06.json');
if(process.argv.includes('--record'))fs.writeFileSync(proof,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else assert.deepEqual(result,JSON.parse(fs.readFileSync(proof,'utf8')));
console.log('Exact canonical source, fresh/staged/HTTP bytes, tested SDK repair, 45 unchanged installed files and all prior observer packages verified.');
