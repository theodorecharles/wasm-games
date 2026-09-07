#!/usr/bin/env node
// Read-only exact-package audit; does not assert that the renderer works.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const name = process.argv[2], port = Number(process.argv[3]);
assert.match(name || '', /^duke-polymost-[a-z-]+proof-20260906$/);
assert.ok(port >= 32963 && port <= 32999);
const run = args => execFileSync('docker', args, {encoding:'utf8'}).trim();
const inspect = container => JSON.parse(run(['inspect', container]))[0];
const inventory = container => Object.fromEntries(run(['exec', container, 'find', '/opt/game-site',
  '-type', 'f', '-exec', 'sha256sum', '{}', '+']).split('\n').map(line => [line.slice(66), line.slice(0, 64)]));
const hash = data => createHash('sha256').update(data).digest('hex');
const base = inspect('wasm-duke3d'), candidate = inspect(name);
assert.equal(base.Image, 'sha256:8631a4e193cadf1eb16c4b5b5d8c3cb639dd605bcab109c7fd9dac5ea8788e90');
assert.equal(candidate.State.Running, true);
assert.equal(candidate.HostConfig.ReadonlyRootfs, true);
assert.deepEqual(candidate.HostConfig.PortBindings['8088/tcp'], [{HostIp:'127.0.0.1', HostPort:String(port)}]);
const dataMount = candidate.Mounts.find(m => m.Destination === '/data/duke3d');
assert.equal(dataMount?.Source, '/home/ted/wasm-game-data/duke3d');
assert.equal(dataMount?.RW, false);
const oldFiles = inventory(base.Id), files = inventory(candidate.Id);
assert.deepEqual(Object.keys(files).sort(), Object.keys(oldFiles).sort());
const changed = Object.keys(files).filter(file => files[file] !== oldFiles[file]).sort();
assert.deepEqual(changed, ['/opt/game-site/duke3d.js', '/opt/game-site/duke3d.wasm']);
const http = {};
let drawObserverPresent = false;
for (const suffix of ['js', 'wasm']) {
  const relative = 'duke3d.' + suffix;
  const response = await fetch(`http://127.0.0.1:${port}/${relative}`);
  assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  http[relative] = hash(bytes);
  if (suffix === 'js') drawObserverPresent = /\[GPU (?:driver|draw|pending|world)\]/.test(bytes.toString('utf8'));
  assert.equal(http[relative], files['/opt/game-site/' + relative]);
}
const status = await fetch(`http://127.0.0.1:${port}/game-data/status?variant=duke3d`).then(r => r.json());
if (process.env.DUKE_NO_DRAW_OBSERVER === '1') assert.equal(drawObserverPresent,false);
assert.equal(status.ready, true);
assert.equal(status.variant, 'duke3d');
const result = {observedAt:new Date().toISOString(), scope:'Package and HTTP identity, not rendering or gameplay acceptance',
  base:{id:base.Id, image:base.Image, startedAt:base.State.StartedAt},
  candidate:{name, id:candidate.Id, image:candidate.Image, startedAt:candidate.State.StartedAt, port},
  changed, unchangedFiles:Object.keys(files).length - changed.length, files, http,
  ownerDataReadOnly:true, ready:status.ready, drawObserverPresent};
if (process.env.DUKE_PACKAGE_PROOF) fs.writeFileSync(process.env.DUKE_PACKAGE_PROOF,
  JSON.stringify(result, null, 2) + '\n', {flag:'wx'});
console.log(JSON.stringify(result, null, 2));
