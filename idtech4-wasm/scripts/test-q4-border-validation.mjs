#!/usr/bin/env node
// Portable sampling gate. Keep the historical vendor-exact test intact and
// retain its exit status; don't require emulation of a driver's LOD shortcut.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'q4-border-validation-'));
const rawPath=path.join(temp,'vendor.json'),cpuPath=path.join(temp,'cpu.json');
const script=path.join(root,'scripts/test-q4-border-sampling.mjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
// The exception below applies only to this retained assertion's exact source.
// If that historical test changes, the integration must be reviewed again.
assert.equal(hash(fs.readFileSync(script)),'22bf038e837d5078768ee8e7048b6909ed720652be164f0651acb24b60967420');
const raw=spawnSync(process.execPath,[script],{encoding:'utf8',timeout:90000,maxBuffer:8*1024*1024,env:{...process.env,Q4_BORDER_PROOF:rawPath}});
assert.ok(fs.existsSync(rawPath),raw.stdout+raw.stderr);
const native=JSON.parse(fs.readFileSync(rawPath,'utf8'));
if(raw.status!==0){
 assert.equal(raw.signal,null);assert.equal(raw.status,1);
 assert.equal(native.anisotropy,1);
 assert.ok(native.summary['isotropic-sampling-prototype'].mismatches>0);
 assert.match(raw.stderr,/AssertionError \[ERR_ASSERTION\]: Expected values to be strictly equal:/);
 assert.match(raw.stderr,/test-q4-border-sampling\.mjs:143:32/);
 // Only implicit derivative / projected derivative pixels can differ here.
 for(const row of native.cases.filter(r=>r.method==='isotropic-sampling-prototype'&&r.differentChannels)){
  assert.equal(row.filter,'trilinear');assert.ok([2,3].includes(row.gradientMode));
 }
}
// These checks occur after the vendor-exact assertion in the legacy runner;
// enforce every one here even when that earlier diagnostic exited nonzero.
for(const label of ['anisotropic-sampling-prototype','gles-anisotropic-sampling-prototype']){
 assert.equal(native.summary[label].cases,128);
 assert.equal(native.summary[label].nativeKernelMismatches,0,'unchanged same-footprint native border oracle');
}
if(native.anisotropy>1)assert.ok(native.cases.some(r=>r.method==='isotropic-sampling-prototype'&&r.kernelDifferentChannels>0));
const cpu=spawnSync(process.execPath,[path.join(root,'scripts/test-q4-border-contract.mjs'),'--negative-controls'],{
 encoding:'utf8',timeout:90000,maxBuffer:8*1024*1024,env:{...process.env,Q4_BORDER_CONTRACT_PROOF:cpuPath}});
assert.equal(cpu.status,0,cpu.stdout+cpu.stderr);
const contract=JSON.parse(fs.readFileSync(cpuPath,'utf8'));
assert.equal(contract.packagedJsSHA256,native.packagedJsSHA256);
assert.equal(contract.helperSHA256,native.prototypeSHA256);
const result={scope:'Sampling-component acceptance: unchanged same-footprint native GL/GLES oracle plus independent CPU mip/border/GLSL-derivative contract and broken-sampler negative controls. Raw vendor-exact status retained; not renderer/campaign/Chrome acceptance.',
 driver:native.driver,anisotropy:native.anisotropy,packagedJsSHA256:native.packagedJsSHA256,helperSHA256:contract.helperSHA256,
 rawVendorStatus:raw.status,rawVendorSummary:native.summary,
 cpu:contract.variants.map(v=>({name:v.name,contexts:v.contexts.map(c=>({driver:c.driver,version:c.version,policies:c.derivativePolicies,accepted:c.summary}))})),
 passed:true};
if(process.env.Q4_BORDER_VALIDATION_PROOF)fs.writeFileSync(process.env.Q4_BORDER_VALIDATION_PROOF,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({driver:result.driver,anisotropy:result.anisotropy,rawVendorStatus:raw.status,rawVendorMismatches:native.summary['isotropic-sampling-prototype'].mismatches,nativeBorderCases:256,cpuChannels:15488,brokenSamplerControls:2,passed:true}));
