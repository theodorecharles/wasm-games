#!/usr/bin/env node
// Read-only audit of the exact v7 or v8 SP/RoE Chrome proof containers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const version = process.env.D3_CAMPAIGN_VERSION || 'v7';
assert.ok(['v7', 'v8'].includes(version));
const previous = JSON.parse(fs.readFileSync(path.join(root, 'proofs', version === 'v7' ?
  'd3-mp-audio-package-2026-09-06.json' : 'd3-trace-cache-package-2026-09-06.json')));
const expected = {...previous.verifiedImageFiles,
  '/opt/game-site/dhewm3-roe.js':'67df33948b89e95496767642eb279bb44a04cdb94301738d6a67b80463bf70b2',
  '/opt/game-site/dhewm3-roe.wasm': version === 'v7' ?
    'cebd7078d223026613d39c2d6c829d712a6d00a585339ba4251d0f5288de2527' :
    'fbf2936fa64bc0dbd8e6d1ca8ea883386d3bd477aa7ae32bb136c68109a20979',
  '/opt/game-site/wasm-game.json':'7f9d58289cb99377a4c0fc8c4cdd0178881a0a3308f69336d70ad5191cf8ac5c',
  '/opt/game-site/wasm-game-data.json':'3391ee48a278b331e26bbbe4004c5d8f667bca8f7e226268e0622ce861999989',
};
const targets = [
  {variant:'doom3', container:version === 'v7' ? 'd3-sp-v7-save-proof-20260906' : 'd3-sp-v8-trace-proof-20260906', port:32953},
  {variant:'roe', container:version === 'v7' ? 'd3-roe-v7-save-proof-20260906' : 'd3-roe-v8-trace-proof-20260906', port:32954},
];
const resourceCode = `const fs=require('node:fs');
const sessions=fs.readdirSync('/tmp').filter(name=>name.startsWith('d3-managed-'));
const nativeProcesses=fs.readdirSync('/proc').filter(name=>/^\\d+$/.test(name)).flatMap(pid=>{
  try { const exe=fs.readlinkSync('/proc/'+pid+'/exe'); return exe.endsWith('/dhewm3ded')?[{pid:Number(pid),exe}]:[]; }
  catch(error) { if(error.code==='ENOENT'||error.code==='EACCES')return []; throw error; }
});console.log(JSON.stringify({sessions,nativeProcesses}));`;
const results = [];
for (const target of targets) {
  const {container, port, variant} = target;
  const inspect = JSON.parse(execFileSync('docker', ['inspect', container], {encoding:'utf8'}))[0];
  assert.equal(inspect.Image, previous.image);
  assert.equal(inspect.HostConfig.ReadonlyRootfs, true);
  assert.equal(inspect.Mounts.length, 1);
  assert.equal(inspect.Mounts[0].Source, '/home/ted/wasm-game-data/doom3');
  assert.equal(inspect.Mounts[0].Destination, '/data');
  assert.equal(inspect.Mounts[0].RW, false);
  assert.ok(inspect.Config.Env.includes('WASM_GAME_VARIANT=' + variant));
  assert.deepEqual(inspect.NetworkSettings.Ports['8088/tcp'], [{HostIp:'127.0.0.1', HostPort:String(port)}]);
  const output = execFileSync('docker', ['exec', container, 'sha256sum', ...Object.keys(expected)], {encoding:'utf8'});
  const imageFiles = Object.fromEntries(output.trim().split('\n').map(line => {
    const match = /^(\w{64})\s+(.+)$/.exec(line);
    assert.ok(match, line);
    return [match[2], match[1]];
  }));
  assert.deepEqual(imageFiles, expected);
  const httpFiles = {};
  for (const [file, checksum] of Object.entries(expected).filter(([file]) => file.startsWith('/opt/game-site/'))) {
    const url = `http://127.0.0.1:${port}/` + file.slice('/opt/game-site/'.length);
    const response = await fetch(url);
    assert.ok(response.ok, url);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(hash(bytes), checksum, url);
    httpFiles[file] = {bytes:bytes.length, sha256:checksum};
  }
  const response = await fetch(`http://127.0.0.1:${port}/api/doom3/status`);
  assert.ok(response.ok);
  const status = await response.json();
  assert.equal(status.state, 'sleeping');
  for (const field of ['humans', 'browserPeers', 'bots']) assert.equal(status[field], 0);
  assert.equal(status.startedAt, null);
  assert.equal(status.error, null);
  assert.deepEqual(status.relay, {peers:0, clientPackets:0, serverPackets:0});
  const resources = JSON.parse(execFileSync('docker', ['exec', container, 'node', '-e', resourceCode], {encoding:'utf8'}));
  assert.deepEqual(resources, {sessions:[], nativeProcesses:[]});
  results.push({...target, observedAt:new Date().toISOString(), image:inspect.Image,
    startedAt:inspect.State.StartedAt, restartCount:inspect.RestartCount,
    readOnlyRoot:inspect.HostConfig.ReadonlyRootfs, mounts:inspect.Mounts,
    imageFiles, httpFiles, status, resources});
}
const proof = {scope:`Exact immutable ${version} package and HTTP bytes in isolated SP/RoE containers; owner archives are read-only and no multiplayer process, session or relay packet is present. Does not inspect browser storage or prove gameplay/save restoration.`,
  observedAt:new Date().toISOString(), results, deployed:false, passed:true};
if (process.env.D3_CAMPAIGN_PACKAGE_PROOF) fs.writeFileSync(process.env.D3_CAMPAIGN_PACKAGE_PROOF, JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify(proof, null, 2));
