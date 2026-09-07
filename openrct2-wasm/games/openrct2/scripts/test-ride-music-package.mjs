import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const game=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const engine=path.resolve(game,'../..');
const proofs=path.join(engine,'proofs');
const oldOrigin=process.env.OPENRCT2_OLD_ORIGIN || 'http://127.0.0.1:32938';
const candidateOrigin=process.env.OPENRCT2_CANDIDATE_ORIGIN || 'http://127.0.0.1:32939';
const baseline=JSON.parse(await fs.readFile(path.join(proofs,'rct2-construction-dialog-package-2026-09-05.json')));
const owner=JSON.parse(await fs.readFile(path.join(proofs,'rct2-private-objects-package-2026-09-05.json'))).owner;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function get(origin,name) {
  const response=await fetch(new URL(name,origin),{signal:AbortSignal.timeout(60000)});
  assert.equal(response.status,200,`${origin}/${name}`);
  return Buffer.from(await response.arrayBuffer());
}
const files=[];
for(const file of baseline.files) {
  const before=await get(oldOrigin,file.name);
  const after=await get(candidateOrigin,file.name);
  assert.equal(hash(before),file.sha256,`previous candidate drift: ${file.name}`);
  assert.deepEqual(after,await fs.readFile(path.join(engine,'.work/site',file.name)),`staging drift: ${file.name}`);
  assert.equal(!after.equals(before),file.name==='runtime/openrct2.wasm',`unexpected change: ${file.name}`);
  files.push({name:file.name,bytes:after.length,sha256:hash(after),changed:!after.equals(before)});
}
assert.equal(files.length,19);
assert.deepEqual(files.filter(file=>file.changed).map(file=>file.name),['runtime/openrct2.wasm']);
const data=JSON.parse(await get(candidateOrigin,'/game-data/status'));
assert.deepEqual(data,JSON.parse(await get(oldOrigin,'/game-data/status')));
assert.equal(data.ready,true);
assert.equal(data.mediaLibrary.entries[0].id,owner.entryId);
assert.equal(data.mediaLibrary.entries[0].fileCount,2975);
assert.equal(data.mediaLibrary.entries[0].totalSize,1228645759);
for(const name of ['/data/','/local-data/',...owner.added.map(item=>'/'+item.name),
  ...owner.added.map(item=>'/OpenRCT2/object/installed/'+path.basename(item.name))]) {
  assert.equal((await fetch(new URL(name,candidateOrigin))).status,404,`private file exposed: ${name}`);
}
for(const name of ['/ObjData/','/OpenRCT2/object/installed/']) {
  assert.deepEqual(await get(candidateOrigin,name),await get(candidateOrigin,'/index.html'));
}
const source=JSON.parse(await fs.readFile(path.join(game,'sources.json'))).repositories[0];
const head=execFileSync('git',['-C',path.join(engine,'.work/openrct2'),'rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.equal(head,source.commit);
assert.equal(head,baseline.sourceCommit);
const patches=[];
for(const name of source.patches) patches.push({name,sha256:hash(await fs.readFile(path.join(game,name)))});
assert.ok(patches.some(p=>p.name.endsWith('/ride-music-return-type.patch')));
const report={observedAt:new Date().toISOString(),oldOrigin,candidateOrigin,sourceCommit:head,patches,files,data,
  acceptance:'Exact public/staged/native artifacts and private boundaries only; compiler, strict full link, callback and Chrome behavior have separate evidence.'};
if(process.argv[2]) await fs.writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log('OpenRCT2 ride-music package: exact 19-file staging/prior baseline, only Wasm changed; same private installation and private-boundary checks pass.');
