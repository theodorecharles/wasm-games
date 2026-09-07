#!/usr/bin/env node
// Run the retained positive/negative SDK fixture against a fresh repaired link.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=process.env.IDTECH4_WORK_ROOT||path.join(root,'.work');
const modulePath=path.join(work,'openq4/tools/build/emscripten_immediate_buffer.mjs');
const {repairImmediateBuffer}=await import(pathToFileURL(modulePath));
const file=process.argv[2]||path.join(work,'openq4/build/web/openQ4-client_wasm32.js');
const linked=fs.readFileSync(file,'utf8');
const seam=/var _emscripten_glEnd = \(\) => \{([\s\S]*?)\n    \};\n  _emscripten_glEnd\.sig/;
assert.equal([...linked.matchAll(new RegExp(seam.source,'g'))].length,1);
// Recover only the preserved SDK body. Reapplying the production transform
// must reproduce every byte; a malformed or incomplete wrapper cannot pass.
const body=linked.match(seam)[1].match(/\n      try \{([\s\S]*)\n      \} finally \{/);
assert.ok(body,'fresh link must contain the immediate-buffer repair');
const legacy=linked.replace(seam,`var _emscripten_glEnd = () => {${body[1]}\n    };\n  _emscripten_glEnd.sig`);
assert.equal(repairImmediateBuffer(legacy),linked);
assert.equal(fs.readFileSync(modulePath,'utf8'),fs.readFileSync(path.join(root,'tests/q4-immediate-buffer-transform.mjs'),'utf8').replace('// Candidate-only SDK repair.','// SDK repair.'));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'q4-immediate-linked-'));
const priorFile=path.join(temp,'legacy-negative-control.js');
fs.writeFileSync(priorFile,legacy);
execFileSync(process.execPath,[path.join(root,'scripts/test-q4-immediate-buffer.mjs'),priorFile],{stdio:'inherit'});
console.log('Fresh linked production repair is byte-exact and passes the retained SDK regression.');
