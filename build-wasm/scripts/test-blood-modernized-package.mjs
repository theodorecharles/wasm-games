#!/usr/bin/env node
// Installed-package identity and source boundary; not gameplay acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2] || 'blood-modernized-profiles-proof-20260906';
const port = Number(process.argv[3] || 32987);
assert.match(name, /^blood-modernized[a-z-]*-proof-20260906$/);
assert(port >= 32987 && port <= 32999);
const run = args => execFileSync('docker', args, { encoding: 'utf8' }).trim();
const inspect = name => JSON.parse(run(['inspect', name]))[0];
const inventory = container => Object.fromEntries(run(['exec', container, 'find', '/opt/game-site', '-type', 'f',
  '-exec', 'sha256sum', '{}', '+']).split('\n').map(line => [line.slice(66), line.slice(0, 64)]));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const base = inspect('duke-polymost-profiles-text-proof-20260906'), candidate = inspect(name), live = inspect('wasm-blood');
assert.equal(base.Image, 'sha256:f8b946e377699f674493e9286ed8dde3bcd0d60c41b7f3230d3dae8035e407bf');
assert.equal(live.Image, 'sha256:ef1fe7905bb41c0bbf9ad805d58fc520e70a54a0fe9a85b8deb35a6d61bd2328');
assert.equal(live.State.StartedAt, '2026-09-04T19:45:41.839082344Z');
assert.equal(candidate.State.Running, true); assert.equal(candidate.HostConfig.ReadonlyRootfs, true);
assert.deepEqual(candidate.HostConfig.PortBindings['8088/tcp'], [{ HostIp: '127.0.0.1', HostPort: String(port) }]);
const mount = candidate.Mounts.find(m => m.Destination === '/data/blood');
assert.equal(mount.Source, '/home/ted/wasm-game-data/blood'); assert.equal(mount.RW, false);
const old = inventory(base.Id), files = inventory(candidate.Id), installed = inventory(live.Id);
const added = Object.keys(files).filter(file => !(file in old)).sort();
const changed = Object.keys(old).filter(file => old[file] !== files[file]).sort();
assert.deepEqual(added, ['/opt/game-site/blood-modernized.data', '/opt/game-site/blood-modernized.js', '/opt/game-site/blood-modernized.wasm']);
assert.deepEqual(changed, ['/opt/game-site/adapters/blood.js', '/opt/game-site/wasm-game.json']);
for (const ext of ['js', 'wasm', 'data']) assert.equal(files[`/opt/game-site/blood.${ext}`], installed[`/opt/game-site/blood.${ext}`]);
const sources = { 'blood-modernized.js': '.work/blood-modernized/dist/blood.js',
  'blood-modernized.wasm': '.work/blood-modernized/dist/blood.wasm',
  'blood-modernized.data': '.work/blood-modernized/dist/blood.data',
  'adapters/blood.js': 'web/blood-adapter.js', 'wasm-game.json': 'web/wasm-game.json' };
const http = {};
for (const relative of ['blood.js', 'blood.wasm', 'blood.data', ...Object.keys(sources)]) {
  const response = await fetch(`http://127.0.0.1:${port}/${relative}`);
  assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  http[relative] = hash(bytes); assert.equal(http[relative], files[`/opt/game-site/${relative}`]);
  if (sources[relative]) assert.equal(http[relative], hash(fs.readFileSync(path.join(root, sources[relative]))));
  // The error-event logger has a [GPU probe] label but never observes draws.
  // Reject the distinct draw-observer markers without rejecting error reporting.
  if (relative.endsWith('.js')) assert.doesNotMatch(bytes.toString(), /\[GPU (?:driver|draw|pending|world)\]/);
  if (relative === 'blood-modernized.data') assert.equal(hash(bytes), hash(fs.readFileSync(path.join(root, '.work/source/nblood.pk3'))));
}
const status = await fetch(`http://127.0.0.1:${port}/game-data/status?variant=blood`).then(r => r.json());
assert.equal(status.ready, true); assert.equal(status.variant, 'blood');
const info = c => ({ id: c.Id, image: c.Image, startedAt: c.State.StartedAt });
const result = { observedAt: new Date().toISOString(), scope: 'Blood Classic/Modernized package and HTTP identity; not Chrome gameplay',
  base: info(base), live: info(live), candidate: { name, port, ...info(candidate) }, added, changed,
  unchangedFiles: Object.keys(old).length - changed.length, files, http, classicBloodUnchanged: true,
  dukeEnginesAndAdapterUnchanged: true, ownerDataReadOnly: true, dataBundleIsNativeResourceOnly: true, drawObserverPresent: false, ready: true };
if (process.env.BLOOD_MODERNIZED_PACKAGE_PROOF) fs.writeFileSync(process.env.BLOOD_MODERNIZED_PACKAGE_PROOF,
  JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result, null, 2));
