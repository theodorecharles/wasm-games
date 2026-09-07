#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = path.join(root, 'tests/gl-border-size.c');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'q4-border-size-'));
try {
  const binary = path.join(temporary, 'size');
  const compile = spawnSync(process.env.CC || 'cc', ['-std=c11','-Wall','-Wextra','-Werror',fixture,'-o',binary,'-lEGL','-lGL','-lm'], {encoding:'utf8',timeout:60000});
  assert.equal(compile.status,0,compile.stdout + compile.stderr);
  const run = spawnSync(binary, [], {encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024,env:{...process.env,EGL_PLATFORM:'surfaceless'}});
  assert.equal(run.status,0,run.stdout + run.stderr);
  const result = JSON.parse(run.stdout);
  result.fixtureSHA256 = crypto.createHash('sha256').update(fs.readFileSync(fixture)).digest('hex');
  result.utilitiesSHA256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'tests/gl-border-sampling.c'))).digest('hex');
  assert.equal(result.contexts.length,2);
  for (const context of result.contexts) {
    assert.equal(context.cases.length,8);
    for (const row of context.cases) {
      assert.equal(row.samples.length,121);
      assert.ok(new Set(row.samples.map(sample=>sample.lod)).size >= 3);
      for (const sample of row.samples) assert.equal(sample.observedLod,sample.lod);
      row.mismatches = row.samples.filter(sample=>sample.actual.some((value,i)=>value!==sample.expected[i])).length;
    }
  }
  if (process.env.Q4_BORDER_SIZE_PROOF) fs.writeFileSync(process.env.Q4_BORDER_SIZE_PROOF,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result.contexts.map(context=>({driver:context.driver,version:context.version,cases:context.cases.map(({samples,...row})=>row)})),null,2));
  for (const context of result.contexts) for (const row of context.cases) {
    if (row.method==='base-size-shift') assert.equal(row.mismatches,0,'mip derivation must match independently allocated levels');
  }
  // Direct queries diagnose the driver; their failures are reported, never
  // silently treated as successful texture-size queries or game acceptance.
} finally {
  fs.rmSync(temporary,{recursive:true,force:true});
}
