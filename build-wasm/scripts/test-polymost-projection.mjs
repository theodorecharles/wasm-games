#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, '.work/source/source/build/src/polymost.cpp'), 'utf8');
const start = source.indexOf('    float m[4][4];\n    Bmemset(m,0,sizeof(m));\n    float const nearclip');
const end = source.indexOf('    glLoadMatrixf(&m[0][0]);', start);
assert(start > 0 && end > start);
const matrix = source.slice(start, end);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'polymost-projection-'));
try {
  const records = [];
  for (const negative of [false, true]) {
    fs.writeFileSync(path.join(temporary, 'projection.inc'), negative ? matrix.replace('#ifdef __EMSCRIPTEN__', '#if 0') : matrix);
    const executable = path.join(temporary, 'readback');
    const build = spawnSync('c++', ['-std=c++17', '-O2', '-I', temporary,
      path.join(root, 'tests/polymost-projection.cpp'), '-lEGL', '-lGLESv2', '-o', executable], {encoding:'utf8',timeout:60000});
    assert.equal(build.status, 0, build.stdout + build.stderr);
    const run = spawnSync(executable, [], {encoding:'utf8',timeout:60000});
    assert.equal(run.status, negative ? 1 : 0, run.stdout + run.stderr);
    assert.match(run.stdout, negative ? /projection mismatch at depth 8\.1/ : /"checks":27/);
    records.push({negative, output:run.stdout.trim(), log:run.stderr.trim()});
  }
  const proof = {scope:'Exact production projection, GLES clipping/readback; not Chrome gameplay acceptance',
    sourceSha256:createHash('sha256').update(source).digest('hex'),
    extractedSha256:createHash('sha256').update(matrix).digest('hex'),records};
  if (process.env.POLYMOST_PROJECTION_PROOF) fs.writeFileSync(process.env.POLYMOST_PROJECTION_PROOF,
    JSON.stringify(proof,null,2)+'\n', {flag:'wx'});
  console.log(JSON.stringify(proof,null,2));
} finally { fs.rmSync(temporary,{recursive:true,force:true}); }
