#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const checkout=path.join(root,'.work/openq4');
const proofPath=path.join(root,'proofs/quake4-border-size-package-2026-09-06.json');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const command=(name,args,options={})=>execFileSync(name,args,{encoding:'utf8',maxBuffer:32*1024*1024,...options}).trim();
const beforeContainer='q4-readback-proof-20260905',candidateContainer='q4-border-size-proof-20260906';
const inspect=name=>JSON.parse(command('docker',['inspect',name]))[0];
const before=inspect(beforeContainer),candidate=inspect(candidateContainer);
assert.equal(before.Image,'sha256:df094f94983cd04aee5125f0fc5e1ffe8fab4f044d85bd3ec03379d05354366f');
assert.equal(candidate.Image,'sha256:b274ab80ab6370c3f9b3ead029d88db47c58a57259dcfa90b443221056cd00ef');
assert.equal(candidate.State.Running,true);
assert.equal(candidate.HostConfig.ReadonlyRootfs,true);
const owner=candidate.Mounts.find(m=>m.Destination==='/data/q4base');
assert.equal(owner.Source,'/home/ted/wasm-game-data/quake4/q4base');
assert.equal(owner.RW,false);
assert.deepEqual(candidate.HostConfig.PortBindings,{'8088/tcp':[{HostIp:'127.0.0.1',HostPort:'32957'}]});
const inventoryScript=`const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const result={};function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())walk(p);else if(entry.isFile())result[p]=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}}for(const dir of ['/opt/game-site','/opt/shared-shell','/opt/wasm-game-framework'])walk(dir);process.stdout.write(JSON.stringify(result));`;
const inventory=name=>JSON.parse(command('docker',['exec',name,'node','-e',inventoryScript]));
const oldFiles=inventory(beforeContainer),newFiles=inventory(candidateContainer);
assert.deepEqual(Object.keys(newFiles).sort(),Object.keys(oldFiles).sort());
const changed=Object.keys(newFiles).filter(file=>newFiles[file]!==oldFiles[file]);
assert.deepEqual(changed,['/opt/game-site/openQ4-client_wasm32.js']);
const helper=fs.readFileSync(path.join(checkout,'tools/build/emscripten_border_sampler.glsl'),'utf8');
const legacyHelper=helper.replace(/ivec2 Q4BorderSize[\s\S]*?\n}\n\n/,'').replaceAll('Q4BorderSize(map, level)','textureSize(map, level)');
assert.equal(hash(legacyHelper),'00c5f19726f24e602d4a51845f442c998d0c336f0cb50f66fb619056bc5fcad3');
const oldJs=execFileSync('docker',['exec',beforeContainer,'node','-e',"process.stdout.write(require('node:fs').readFileSync('/opt/game-site/openQ4-client_wasm32.js'))"],{encoding:'utf8',maxBuffer:8*1024*1024});
const js=fs.readFileSync(path.join(checkout,'build/web-meson-6.0.6/openQ4-client_wasm32.js'),'utf8');
assert.equal(oldJs.split(JSON.stringify(legacyHelper)).length,2);
assert.equal(oldJs.replace(JSON.stringify(legacyHelper),JSON.stringify(helper)),js);
assert.equal(hash(js),newFiles[changed[0]]);
const response=await fetch('http://127.0.0.1:32957/openQ4-client_wasm32.js');
assert.equal(response.status,200);
assert.equal(hash(Buffer.from(await response.arrayBuffer())),hash(js));
const status=await (await fetch('http://127.0.0.1:32957/game-data/status?game=quake4')).json();
assert.equal(status.ready,true);assert.equal(status.variant,'quake4');assert.equal(status.files.length,32);
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'q4-border-size-patch-'));
let expectedTree,actualTree;
try {
  const patch=path.join(root,'patches/openq4-browser.patch');
  for(const [label,apply] of [['expected',true],['actual',false]]) {
    const options={cwd:checkout,env:{...process.env,GIT_INDEX_FILE:path.join(temporary,label)}};
    command('git',['read-tree','HEAD'],options);
    if(apply)command('git',['apply','--cached','--whitespace=nowarn',patch],options);
    else command('git',['add','-A'],options);
    const tree=command('git',['write-tree'],options);
    if(apply)expectedTree=tree;else actualTree=tree;
  }
  assert.equal(actualTree,expectedTree,'prepared source must equal the exact canonical patch tree');
} finally {fs.rmSync(temporary,{recursive:true,force:true});}
const result={scope:'Isolated Quake 4 mip-size renderer repair; fresh-linked JS changes only the serialized helper. No live promotion or campaign acceptance.',
  patchSHA256:hash(fs.readFileSync(path.join(root,'patches/openq4-browser.patch'))),helperSHA256:hash(helper),exactSourceTree:actualTree,
  before:{container:beforeContainer,id:before.Id,image:before.Image},candidate:{container:candidateContainer,id:candidate.Id,image:candidate.Image,port:32957,ownerDataReadOnly:true},
  files:newFiles,changedFiles:changed,unchangedFiles:Object.keys(newFiles).length-1,readyOwnerFiles:status.files.length};
if(process.argv.includes('--record')) {
  assert.equal(fs.existsSync(proofPath),false,'do not overwrite a retained package identity');
  fs.writeFileSync(proofPath,JSON.stringify(result,null,2)+'\n');
} else assert.deepEqual(result,JSON.parse(fs.readFileSync(proofPath,'utf8')));
console.log(`Exact source patch, serialized-helper-only JS change, ${result.unchangedFiles} unchanged installed files, HTTP bytes and 32 read-only owner files verified.`);
