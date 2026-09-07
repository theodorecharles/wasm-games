#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const checkout=path.join(process.env.IDTECH4_WORK_ROOT || path.join(root,'.work'),'prey-d3wasm');
const bridge=path.join(checkout,'neo/sys/openal_emscripten.cpp');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'prey-audio-'));
const messages=[];
try {
  const results=[];
  globalThis.postMessage=message=>messages.push(message);
  for(const backend of ['sdk-worker','prey-bridge']) {
    const output=path.join(temporary,backend+'.cjs');
    const args=['-std=c++17','-O1','-sASSERTIONS=1','-sMODULARIZE=1','-sENVIRONMENT=node',
      '-sEXPORTED_FUNCTIONS=_PreyDeviceProbe,_PreyAudioProbe,_PreyVoiceStart,_PreyVoiceFinished',
      path.join(root,'tests/prey-audio.cpp'),'--no-entry','-o',output];
    if(backend==='prey-bridge')args.push(bridge);
    else args.push('-lopenal');
    const build=spawnSync(process.env.EMXX || 'em++',args,{encoding:'utf8'});
    assert.equal(build.status,0,build.stdout+build.stderr);
    const module=await createRequire(import.meta.url)(output)();
    const device=module._PreyDeviceProbe();
    if(backend==='sdk-worker') {
      assert.equal(device,0,'unmodified SDK OpenAL cannot open a device without window AudioContext');
      results.push({backend,deviceAvailable:false});
      continue;
    }
    assert.equal(device,1);
    messages.length=0;
    assert.equal(module._PreyAudioProbe(),1);
    assert.equal(messages.filter(x=>x.type==='audio-init').length,1);
    const buffers=messages.filter(x=>x.type==='audio-buffer');
    assert.equal(buffers.length,2);
    assert.deepEqual(Array.from(new Int16Array(buffers[0].data)),[0,8192,-8192,0]);
    assert.deepEqual(messages.filter(x=>x.type==='audio-source-action').map(x=>x.action),[1,2,0,1,0]);
    assert.equal(module._PreyVoiceStart(),1);
    await new Promise(resolve=>setTimeout(resolve,300));
    assert.equal(module._PreyVoiceFinished(),1,'non-looping voice must stop after its real PCM duration');
    results.push({backend,deviceAvailable:true,coreApiAndPcm:true,naturalVoiceCompletion:true,
      messageTypes:[...new Set(messages.map(x=>x.type))]});
  }
  const proof={scope:'Actual Emscripten SDK OpenAL negative control and exact Prey bridge compiled to Wasm without AudioContext. Positive covers terminated device enumeration, context, copied PCM, source/queue state, pause/stop/cleanup and natural PCM completion. Not full game-script or audible-listening acceptance.',
    bridgeSHA256:crypto.createHash('sha256').update(fs.readFileSync(bridge)).digest('hex'),results};
  if(process.env.PREY_AUDIO_PROOF)fs.writeFileSync(process.env.PREY_AUDIO_PROOF,JSON.stringify(proof,null,2)+'\n');
  console.log(JSON.stringify(proof,null,2));
} finally {
  delete globalThis.postMessage;
  fs.rmSync(temporary,{recursive:true,force:true});
}
