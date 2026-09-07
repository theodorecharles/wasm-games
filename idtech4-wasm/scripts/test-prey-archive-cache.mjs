#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=process.env.IDTECH4_WORK_ROOT || path.join(root,'.work');
const worker=fs.readFileSync(process.env.PREY_CACHE_SOURCE || path.join(root,'site/prey-worker.js'),'utf8');
const sdk=fs.readFileSync(process.env.PREY_CACHE_ARTIFACT || path.join(work,'prey-d3wasm/output/emscripten/prey06.js'),'utf8');
const sdkStart=sdk.indexOf('var WORKERFS=');
const readStart=sdk.indexOf('read(stream,buffer,offset,length,position)',sdkStart);
const readEnd=sdk.indexOf(',write(',readStart);
assert.ok(sdkStart>=0 && readStart>sdkStart && readEnd>readStart);
const sdkRead=sdk.slice(readStart,readEnd);
const cases=[];
const check=(label,passed,details={})=>cases.push({label,passed,...details});
let backingReads=0,backingBytes=0,failRead=false;
const valueAt=(position,seed)=>(position*13+Math.floor(position/251)+seed)%256;
class Region {
  constructor(size,seed=0,start=0){Object.assign(this,{size,seed,start});}
  slice(begin,end) {
    const clamp=n=>Math.min(this.size,Math.max(0,n<0?this.size+n:n));
    const start=clamp(begin),stop=clamp(end);
    return new Region(Math.max(0,stop-start),this.seed,this.start+start);
  }
}
const sandbox={self:{},Uint8Array};
sandbox.WORKERFS={reader:{readAsArrayBuffer(region) {
  backingReads++;backingBytes+=region.size;
  if(failRead){failRead=false;throw new Error('fixture I/O error');}
  return Uint8Array.from({length:region.size},(_,i)=>valueAt(region.start+i,region.seed)).buffer;
}},stream_ops:{}};
vm.createContext(sandbox);
sandbox.WORKERFS.stream_ops.read=vm.runInContext(`({${sdkRead}}).read`,sandbox);
vm.runInContext(worker,sandbox,{filename:'prey-worker.js'});
const cached=typeof sandbox.installPreyArchiveReadCache==='function';
const stats=cached?sandbox.installPreyArchiveReadCache(sandbox.WORKERFS):()=>({residentBytes:0});
const makeStream=(size,seed=0)=>({node:{size,contents:new Region(size,seed)}});
function read(stream,position,length,offset=7) {
  const target=new Uint8Array(length+offset+11).fill(0xe7);
  const returned=sandbox.WORKERFS.stream_ops.read(stream,target,offset,length,position);
  const expected=Math.max(0,Math.min(length,stream.node.size-position));
  let exact=returned===expected;
  for(let i=0;i<target.length;i++) {
    const value=i>=offset && i<offset+expected?valueAt(position+i-offset,stream.node.contents.seed):0xe7;
    if(target[i]!==value)exact=false;
  }
  return {exact,returned,target};
}
const stream=makeStream(3*65536+37,19);
for(const [label,position,length] of [
  ['first header',0,46],['same-block seek',12,2],['backward seek',3,8],
  ['cross-block',65530,17],['middle block',65590,90],['previous block',300,3],
  ['tail block',196608,37],['short EOF',196637,80],['at EOF',196645,3],
  ['past EOF',196900,8],['zero read',5,0],['bulk direct read',45,90000],
  ['exact block read',15,65536]
])check(label,read(stream,position,length).exact);
const huge=makeStream(2**32+65536,52);
check('64-bit file offset preserved',read(huge,2**32+123,73).exact);
const small=makeStream(17,4);
check('tiny file and EOF',read(small,7,40).exact);
const empty=makeStream(0,5);
check('empty file',read(empty,0,4).exact);
const retained=read(stream,100,12);
retained.target.fill(0);
check('caller cannot mutate cached bytes',read(stream,100,12).exact);
stream.node.contents=new Region(stream.node.size,113);
check('replaced blob invalidates cache',read(stream,100,12).exact);
stream.node.size=120;
stream.node.contents=new Region(120,113);
check('changed file size preserves short-read boundary',read(stream,110,50).exact);
const recover=makeStream(70000,24);
failRead=true;
let threw=false;
try{read(recover,17,19);}catch(error){threw=/fixture I\/O error/.test(error.message);}
check('backing I/O errors propagate',threw);
check('failed fill retries without stale data',read(recover,17,19).exact);
for(let i=0;i<40;i++)check(`file-isolation-${i}`,read(makeStream(100000,i+200),17,9).exact);
check('retained cache is bounded to 1 MiB',stats().residentBytes<=1048576,stats());
check('evicted original file reloads correctly',read(huge,2**32+123,73).exact);
const index=makeStream(65536,39);
const before=backingReads;
let indexExact=true;
for(let i=0;i<10000;i++)indexExact=read(index,(i*3)%64000,4).exact && indexExact;
const indexBackingReads=backingReads-before;
check('ten thousand tiny header reads remain exact',indexExact);
check('tiny header reads use one backing block',indexBackingReads===1,{requests:10000,backingReads:indexBackingReads});
const finalStats=stats();
const failures=cases.filter(c=>!c.passed);
const proof={scope:'Production Prey worker cache wrapping the exact WORKERFS read method extracted from the generated SDK artifact. Fixture provides deterministic immutable Blob regions and synchronous reader, including virtual >4 GiB offsets; byte boundaries, cache isolation, eviction, error retry and backing-read count are exact. Not wall-clock Chrome/ZIP/gameplay evidence.',
  cached,workerSHA256:crypto.createHash('sha256').update(worker).digest('hex'),sdkReadSHA256:crypto.createHash('sha256').update(sdkRead).digest('hex'),backingReads,backingBytes,finalStats,cases};
if(process.env.PREY_CACHE_PROOF)fs.writeFileSync(process.env.PREY_CACHE_PROOF,JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({cases:cases.length,failures,indexBackingReads,finalStats},null,2));
if(process.env.PREY_CACHE_EXPECT_FAILURE==='1')assert.ok(failures.length>0);
else {
  assert.equal(failures.length,0);
  const native=fs.readFileSync(path.join(work,'prey-d3wasm/neo/framework/FileSystem.cpp'),'utf8');
  const initialPolicy=native.slice(native.indexOf('const bool deferredGameplayPak'),native.indexOf('if ( ownerBaseDirectory && deferredGameplayPak )'));
  assert.match(initialPolicy,/pak001\.pk4/);assert.match(initialPolicy,/pak002\.pk4/);
  assert.doesNotMatch(initialPolicy,/pak003\.pk4|pak004\.pk4/,'sound/font paks must be indexed before menu initialization');
  const mount=native.slice(native.indexOf('const char *deferredNames[]'),native.indexOf('common->Printf( "Mounting deferred'));
  assert.doesNotMatch(mount,/pak003\.pk4|pak004\.pk4/,'startup paks must not be mounted twice');
}
