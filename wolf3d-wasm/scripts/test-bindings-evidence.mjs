#!/usr/bin/env node
// Provenance/counter checks; visible labels and ammo are manually reviewed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../proofs');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const records={},hashes={};
for(const file of fs.readdirSync(dir).filter(f=>/^(wolf|spear)-(bindings|capture)-.*-2026-09-06\.json$/.test(f)).sort()) {
  records[file]=JSON.parse(fs.readFileSync(path.join(dir,file))).observation;
  const image=file.replace(/\.json$/,'.jpg');
  assert.equal(fs.readFileSync(path.join(dir,image)).readUInt16BE(0),0xffd8);
  for(const name of [file,image])hashes[name]=hash(fs.readFileSync(path.join(dir,name)));
}
let requiredPairs=0;
for(const [stem,game,port,data] of [
  ['wolf-bindings-final','wolf3d',32996,'container'],
  ['spear-bindings','spear',32997,'container'],
  ['wolf-bindings-live','wolf3d',8011,'cache'],
  ['spear-bindings-live','spear',8012,'cache']
]) {
  const get=suffix=>records[`${stem}-${suffix}-2026-09-06.json`];
  for(const [suffix,state] of [['menu','menu'],['visible','menu'],['world','gameplay'],
    ['forward','gameplay'],['fire','gameplay'],['pause','paused'],['resumed','gameplay']]) {
    const r=get(suffix);assert(r,`${stem}-${suffix}`);requiredPairs++;
    assert.equal(r.url,`http://127.0.0.1:${port}/`);
    assert.equal(r.root.wasmGameVariant,game);assert.equal(r.root.wasmDataSource,data);
    assert.equal(r.root.shellEngineState,state);assert.equal(r.root.wolf3dControlsValid,'true');
    assert.equal(r.canvas[0].width,960);assert.equal(r.canvas[0].height,720);
    assert.equal(r.pointerLock,null);assert.equal(r.root.shellInputCaptured,'false');
  }
  assert.equal(+get('forward').root.wolfKeyEdges,+get('world').root.wolfKeyEdges+1);
  assert.equal(+get('fire').root.wolfMouseEdges,+get('forward').root.wolfMouseEdges+1);
  assert.equal(get('pause').root.wolfMouseEdges,get('resumed').root.wolfMouseEdges);
  const fire=get('fire').root, context=JSON.parse(fire.shellCaptureContext);
  assert.match(fire.shellCaptureError,/^WrongDocumentError:/);
  assert.equal(fire.shellCaptureStatus,'denied');
  for(const field of ['trusted','connected','sameDocument','focused','activation'])assert.equal(context[field],true);
  assert.equal(context.visibility,'visible');
}
for(const suffix of ['edit-f','world-ready','f-shot','restored']) {
  const r=records[`wolf-bindings-${suffix}-2026-09-06.json`];assert(r);
  assert.equal(r.url,'http://127.0.0.1:32994/');
}
assert.equal(+records['wolf-bindings-f-shot-2026-09-06.json'].root.wolfKeyEdges,
  +records['wolf-bindings-world-ready-2026-09-06.json'].root.wolfKeyEdges+1);
for(const file of ['key-bindings-native-2026-09-06.json','gameplay-input-sdk-2026-09-06.json',
  'bindings-release-before-2026-09-06.json','bindings-release-after-2026-09-06.json'])
  hashes[file]=hash(fs.readFileSync(path.join(dir,file)));
const result={observedAt:new Date().toISOString(),pairs:Object.keys(records).length,requiredPairs,hashes,
  scope:'Native labels, isolated Wolf Ctrl-to-F edit, F firing (7 to 6), and Ctrl restoration were reviewed in real Chrome. Both final candidates and both live cached origins show labels, first level, W movement, primary firing (8 to 7), pause and resume. This script checks provenance/counters, not OCR or real held input.',
  exclusions:['wolf-bindings-world is a black transition frame, not rendered-world proof',
    'wolf-capture-click and wolf-bindings-final-resume-fire were observed during enemy-death animations; not stable post-resume gameplay acceptance'],
  pointerLockProven:false,fullscreenProven:false,bindingPersistenceProven:false,physicalControllerProven:false,
  heldBrowserControlsProven:false,fullGameAccepted:false};
if(process.env.WOLF_BINDINGS_EVIDENCE_PROOF)fs.writeFileSync(process.env.WOLF_BINDINGS_EVIDENCE_PROOF,
  JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({pairs:result.pairs,requiredPairs,hashes:Object.keys(hashes).length,audited:true}));
