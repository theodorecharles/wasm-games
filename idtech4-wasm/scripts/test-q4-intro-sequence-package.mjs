#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const cmd=(name,args)=>execFileSync(name,args,{encoding:'utf8',maxBuffer:32*1024*1024}).trim();
const inspect=name=>JSON.parse(cmd('docker',['inspect',name]))[0];
const inventoryCode=`const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),result={};function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile())result[p]=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}}for(const dir of ['/opt/game-site','/opt/shared-shell','/opt/wasm-game-framework'])walk(dir);process.stdout.write(JSON.stringify(result));`;
const inventory=name=>JSON.parse(cmd('docker',['exec',name,'node','-e',inventoryCode]));
const base='q4-border-size-proof-20260906',files=inventory(base);
assert.equal(inspect(base).Image,'sha256:b274ab80ab6370c3f9b3ead029d88db47c58a57259dcfa90b443221056cd00ef');
const image='sha256:2fd8241946869719aaae4f65c2ae72a274bcc379ca4e78f8cb557d7d32a8dc90';
const jsHash='87d340130f6c3ec1fe62c7440785e867a411d9d4852b7c55f8983cd9e40dbe4c';
const wasmHash='af5f59e3352b6f21ce7c21701cc8b385301b1d0087e8b652c2251964b0d9fda9';
const worker='/opt/game-site/q4-worker.js',alias='/opt/game-site/q4-worker-native.js';
const result={scope:'Test-only native decal and GPU draw observers; no visual fix or deployment.',base,containers:[],sources:{}};
for(const [name,port,draw] of [['q4-intro-sequence-proof-20260906',32960,true]]) {
  const c=inspect(name),actual=inventory(name);
  assert.equal(c.Image,image);assert.equal(c.State.Running,true);assert.equal(c.HostConfig.ReadonlyRootfs,true);
  assert.deepEqual(c.HostConfig.PortBindings,{'8088/tcp':[{HostIp:'127.0.0.1',HostPort:String(port)}]});
  const owner=c.Mounts.find(x=>x.Destination==='/data/q4base');
  assert.equal(owner.Source,'/home/ted/wasm-game-data/quake4/q4base');assert.equal(owner.RW,false);
  const changed=Object.keys(files).filter(p=>actual[p]!==files[p]).sort();
  const expected=['/opt/game-site/openQ4-client_wasm32.js','/opt/game-site/openQ4-client_wasm32.wasm',...(draw?[worker]:[])].sort();
  assert.deepEqual(changed,expected);
  assert.deepEqual(Object.keys(actual).filter(p=>!(p in files)),draw?[alias]:[]);
  assert.equal(actual[expected.find(p=>p.endsWith('wasm32.js'))],jsHash);
  assert.equal(actual[expected.find(p=>p.endsWith('.wasm'))],wasmHash);
  if(draw) {
    assert.equal(actual[worker],hash(fs.readFileSync(path.join(root,'tests/q4-intro-sequence-worker.js'))));
    assert.equal(actual[alias],files[worker]);
    assert.ok(c.Mounts.filter(x=>[worker,alias].includes(x.Destination)).every(x=>!x.RW));
  }
  for(const p of [...changed,...(draw?[alias]:[])]) {
    const response=await fetch(`http://127.0.0.1:${port}/${path.basename(p)}`);
    assert.equal(response.status,200);assert.equal(hash(Buffer.from(await response.arrayBuffer())),actual[p]);
  }
  const status=await(await fetch(`http://127.0.0.1:${port}/game-data/status?game=quake4`)).json();
  assert.equal(status.ready,true);assert.equal(status.files.length,32);
  result.containers.push({name,id:c.Id,image:c.Image,port,changed,unchanged:Object.keys(files).length-changed.length,files:actual});
}
for(const p of ['tests/q4-intro-decal-diagnostic.patch','tests/q4-intro-sequence-worker.js','patches/openq4-browser.patch']) result.sources[p]=hash(fs.readFileSync(path.join(root,p)));
// The ordinary candidate's complete source/build audit must continue to pass.
cmd(process.execPath,[path.join(root,'scripts/test-q4-border-size-package.mjs')]);
cmd('git',['-C',path.join(root,'.work/openq4'),'apply','--check',path.join(root,'tests/q4-intro-decal-diagnostic.patch')]);
const proof=path.join(root,'proofs/quake4-intro-sequence-package-2026-09-06.json');
if(process.argv.includes('--record')) fs.writeFileSync(proof,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else assert.deepEqual(result,JSON.parse(fs.readFileSync(proof,'utf8')));
console.log('Sequence observer verified; 44 unchanged installed files, exact HTTP bytes, read-only owner files, and restored canonical source/build.');
