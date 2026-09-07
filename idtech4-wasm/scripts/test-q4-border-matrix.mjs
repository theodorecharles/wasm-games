#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'q4-border-matrix-'));
try {
  const cases=[],failures=[];
  let identities;
  for(let anisotropy=1;anisotropy<=16;++anisotropy) {
    const proof=path.join(temporary,`${anisotropy}.json`);
    const run=spawnSync(process.execPath,[path.join(root,'scripts/test-q4-border-sampling.mjs')],{
      encoding:'utf8',timeout:60000,env:{...process.env,Q4_BORDER_ANISOTROPY:String(anisotropy),Q4_BORDER_PROOF:proof}});
    const result=fs.existsSync(proof)?JSON.parse(fs.readFileSync(proof,'utf8')):null;
    // Retain all settings even if a completed comparison fails its unchanged
    // pixel gate. A missing/incomplete fixture result is still immediately fatal.
    assert.ok(result?.summary,`anisotropy ${anisotropy}: ${run.stdout}${run.stderr}`);
    if(run.status!==0)failures.push({anisotropy,status:run.status,signal:run.signal,error:run.stderr});
    const current={fixtureSHA256:result.fixtureSHA256,prototypeSHA256:result.prototypeSHA256,
      packagedShaderRouting:result.packagedShaderRouting,packagedJsSHA256:result.packagedJsSHA256,
      transformSHA256:result.transformSHA256,convertedFragmentSHA256:result.convertedFragmentSHA256,glesPath:result.glesPath,
      imageSourceSHA256:result.imageSourceSHA256,driver:result.driver,esDriver:result.esDriver};
    if(identities) assert.deepEqual(current,identities); else identities=current;
    cases.push({anisotropy,desktop:result.summary['anisotropic-sampling-prototype'],
      gles:result.summary['gles-anisotropic-sampling-prototype'],isotropicControl:result.summary['isotropic-sampling-prototype']});
  }
  const result={scope:'All 16 engine anisotropy settings: same-footprint native border oracle on desktop GL and GLES. Vendor-kernel pixel differences retained; not production or campaign acceptance.',
    ...identities,cases,failures};
  if(process.env.Q4_BORDER_MATRIX_PROOF) fs.writeFileSync(process.env.Q4_BORDER_MATRIX_PROOF,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({settings:cases.length,desktopCases:cases.reduce((sum,row)=>sum+row.desktop.cases,0),
    glesCases:cases.reduce((sum,row)=>sum+row.gles.cases,0),nativeKernelMismatches:cases.reduce((sum,row)=>sum+row.desktop.nativeKernelMismatches+row.gles.nativeKernelMismatches,0),failedSettings:failures.map(row=>row.anisotropy)},null,2));
  assert.equal(failures.length,0,'all sampling gates must pass; failures are retained in the matrix proof');
} finally {
  fs.rmSync(temporary,{recursive:true,force:true});
}
