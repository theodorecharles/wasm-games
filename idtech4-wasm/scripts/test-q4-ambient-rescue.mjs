#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=process.env.IDTECH4_WORK_ROOT||path.join(root,'.work');
const source=fs.readFileSync(path.join(work,'openq4/src/renderer/draw_common.cpp'),'utf8');
const arb=fs.readFileSync(path.join(work,'openq4/src/renderer/draw_arb2.cpp'),'utf8');
const readiness=arb.slice(arb.indexOf('void R_ReloadARBPrograms_f('));
assert.match(readiness,/#ifdef __EMSCRIPTEN__\s+if \( !RB_MaterialInteractionLoadProgram\(\) \) \{\s+common->Error\( "WebGL2 GLSL ES interaction program failed readiness validation" \);/);
const helper=source.match(/static bool RB_InteractionRescueActive\( void \) \{[\s\S]*?\n}/)?.[0];
const prefix=source.match(/static void RB_STD_ForceAmbient\( void \) \{([\s\S]*?)\n\tif \( ambient <=/)?.[1];
assert.ok(helper&&prefix,'production helper and explicit-floor formula must exist');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'q4-ambient-'));
const header=helper+'\nfloat Q4AmbientProbe(){'+prefix+'\nreturn ambient;\n}\n';
fs.writeFileSync(path.join(temp,'q4-ambient-production.h'),header);
const rows=[];
for(const [name,defines] of [['desktop',[]],['web-policy',['-D__EMSCRIPTEN__']]]){
 const binary=path.join(temp,name);
 execFileSync('g++',['-std=c++17','-O1',...defines,'-I',temp,path.join(root,'tests/q4-ambient-rescue.cpp'),'-o',binary]);
 const output=execFileSync(binary,[],{encoding:'utf8'}).trim();assert.equal(output,'640 ambient policy cases passed');rows.push({name,output});
}
// Negative control: restore the old ARB-availability policy for WebGL.
const oldHelper=helper.replace(/#ifdef __EMSCRIPTEN__[\s\S]*?#else\n/,'').replace('\n#endif','');
fs.writeFileSync(path.join(temp,'q4-ambient-production.h'),header.replace(helper,oldHelper));
const negative=path.join(temp,'old-web-policy');
execFileSync('g++',['-std=c++17','-O1','-D__EMSCRIPTEN__','-I',temp,path.join(root,'tests/q4-ambient-rescue.cpp'),'-o',negative]);
const failed=spawnSync(negative,[],{encoding:'utf8'});assert.notEqual(failed.status,0);assert.match(failed.stderr,/Assertion/);
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const proof={scope:'Actual production rescue helper and explicit ambient formula compiled for desktop/WebGL policy, with old-policy negative control. GLSL startup readiness gate inspected; full renderer not executed.',sourceSHA256:hash(source),helperSHA256:hash(helper),rows,oldWebPolicyRejected:true};
if(process.env.Q4_AMBIENT_PROOF)fs.writeFileSync(process.env.Q4_AMBIENT_PROOF,JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
console.log('1280 production ambient-policy cases pass; the old WebGL ARB policy fails as expected.');
