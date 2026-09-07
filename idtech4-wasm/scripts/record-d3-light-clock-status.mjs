#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [mode, stem, flag] = process.argv.slice(2);
const targets = {
  fixed:{container:'d3-light-clock-diagnostic-20260906', port:32951},
  legacy:{container:'d3-light-clock-legacy-diagnostic-20260906', port:32952},
};
assert.ok(targets[mode], 'fixed or legacy diagnostic only');
assert.match(stem || '', /^d3-light-clock-[a-z-]+$/);
assert.ok(flag === undefined || flag === '--idle');
const {container, port} = targets[mode];
const response = await fetch(`http://127.0.0.1:${port}/api/doom3/status`);
assert.ok(response.ok);
const status = await response.json();
const inspect = JSON.parse(execFileSync('docker', ['inspect', container], {encoding:'utf8'}))[0];
assert.equal(inspect.HostConfig.ReadonlyRootfs, true);
assert.equal(inspect.Mounts.length, 1);
assert.equal(inspect.Mounts[0].Source, '/home/ted/wasm-game-data/doom3');
assert.equal(inspect.Mounts[0].Destination, '/data');
assert.equal(inspect.Mounts[0].RW, false);
const resourceCode = `const fs=require('node:fs');
const sessions=fs.readdirSync('/tmp').filter(name=>name.startsWith('d3-managed-'));
const nativeProcesses=fs.readdirSync('/proc').filter(name=>/^\\d+$/.test(name)).flatMap(pid=>{
  try { const exe=fs.readlinkSync('/proc/'+pid+'/exe'); return exe.endsWith('/dhewm3ded')?[{pid:Number(pid),exe}]:[]; }
  catch(error) { if(error.code==='ENOENT'||error.code==='EACCES')return []; throw error; }
});console.log(JSON.stringify({sessions,nativeProcesses}));`;
const resources = JSON.parse(execFileSync('docker', ['exec', container, 'node', '-e', resourceCode], {encoding:'utf8'}));
if (flag === '--idle') {
  assert.equal(status.state, 'sleeping');
  for (const field of ['humans', 'browserPeers', 'bots']) assert.equal(status[field], 0);
  assert.equal(status.startedAt, null);
  assert.deepEqual(resources, {sessions:[], nativeProcesses:[]});
}
const proof = {observedAt:new Date().toISOString(), container, image:inspect.Image, status, resources,
  readOnlyRoot:inspect.HostConfig.ReadonlyRootfs, mounts:inspect.Mounts, tmpfs:inspect.HostConfig.Tmpfs};
fs.writeFileSync(path.join(root, 'proofs', stem + '-2026-09-06.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify(proof, null, 2));
