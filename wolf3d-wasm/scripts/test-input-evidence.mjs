#!/usr/bin/env node
// Checks provenance/coverage and hashes. Visible movement/ammo interpretation
// is explicitly manual; this does not perform OCR or prove pointer lock.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'proofs'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const hashes={},records={};
for(const file of fs.readdirSync(dir).filter(f=>/^(wolf|spear)-input-.*-2026-09-06\.json$/.test(f)).sort()) {
  const record=JSON.parse(fs.readFileSync(path.join(dir,file)));
  const image=file.replace(/\.json$/,'.jpg'),bytes=fs.readFileSync(path.join(dir,image));
  assert.equal(bytes.readUInt16BE(0),0xffd8,image);
  assert.equal(record.observation.canvas[0].width,960);
  assert.equal(record.observation.canvas[0].height,720);
  records[file]=record;
  for(const name of [file,image])hashes[name]=hash(fs.readFileSync(path.join(dir,name)));
}
for(const [game,stem,isolated,live] of [['wolf3d','wolf',32992,8011],['spear','spear',32993,8012]]) {
  for(const [infix,port,data] of [['',isolated,'container'],['live-',live,'cache']]) {
    const get=suffix=>records[`${stem}-input-${infix}${suffix}-2026-09-06.json`].observation;
    for(const [suffix,state] of [['menu','menu'],['world','gameplay'],['forward','gameplay'],
      ['fire-one','gameplay'],['pause','paused'],['resumed','gameplay'],['resume-fire','gameplay']]) {
      const r=get(suffix);assert.equal(r.url,`http://127.0.0.1:${port}/`);
      assert.equal(r.root.wasmGameVariant,game);assert.equal(r.root.wasmDataSource,data);
      assert.equal(r.root.shellEngineState,state);assert.equal(r.root.wolfInputFlags,'7');
      // Capture has NOT been demonstrated. The native legacy grab flag is
      // distinct from the browser's actual pointer-lock element.
      assert.equal(r.pointerLock,null);assert.equal(r.root.shellInputCaptured,'false');
    }
    assert.equal(+get('forward').root.wolfKeyEdges,+get('world').root.wolfKeyEdges+1);
    assert.equal(+get('fire-one').root.wolfMouseEdges,+get('forward').root.wolfMouseEdges+1);
    assert.equal(get('pause').root.wolfMouseEdges,get('resumed').root.wolfMouseEdges,
      'the menu resume click must not count as a gameplay press');
    assert.equal(+get('resume-fire').root.wolfMouseEdges,+get('resumed').root.wolfMouseEdges+1);
  }
}
for(const file of ['gameplay-input-native-2026-09-06.json','input-release-before-2026-09-06.json','input-release-after-2026-09-06.json'])
  hashes[file]=hash(fs.readFileSync(path.join(dir,file)));
const result={observedAt:new Date().toISOString(),pairs:Object.keys(records).length,hashes,
  scope:'28 required final-build Chrome pairs plus retained binding inspection and an inconclusive Wolf second-shot record. Both candidates and live endpoints show forward movement and initial ammo 8 to 7. Candidate Wolf post-resume ammo 8 to 7; candidate/live Spear post-resume 7 to 6. These visible claims were reviewed manually, not inferred from counters.',
  exclusions:['wolf-input-fire-two: by observation lives decreased from 3 to 2 and ammo reset to 8; not second-shot ammo proof',
    'wolf-input-live-resume-fire: lives decreased from 3 to 2 and ammo reset to 8; not post-resume ammo proof',
    'wolf-input-live-bindings predates the input rebuild and has no new input diagnostics'],
  pointerLockProven:false,heldBrowserControlsProven:false,fullGameAccepted:false};
if(process.env.WOLF_INPUT_EVIDENCE_PROOF)fs.writeFileSync(process.env.WOLF_INPUT_EVIDENCE_PROOF,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({pairs:result.pairs,hashes:Object.keys(hashes).length,requiredPairs:28,audited:true}));
