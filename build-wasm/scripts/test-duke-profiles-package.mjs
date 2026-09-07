#!/usr/bin/env node
// Exact isolated packaging audit, not a substitute for Chrome gameplay checks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2], port = Number(process.argv[3]);
const textInput = process.argv[4] === '--text-input';
assert.ok(process.argv[4] === undefined || textInput, 'unknown audit mode');
assert.match(name || '', /^duke-polymost-profiles[a-z-]*-proof-20260906$/);
assert.ok(port >= 32981 && port <= 32999);
const run = args => execFileSync('docker', args, { encoding: 'utf8' }).trim();
const inspect = container => JSON.parse(run(['inspect', container]))[0];
const inventory = container => Object.fromEntries(run(['exec', container, 'find', '/opt/game-site',
  '-type', 'f', '-exec', 'sha256sum', '{}', '+']).split('\n').map(line => [line.slice(66), line.slice(0, 64)]));
const hash = data => createHash('sha256').update(data).digest('hex');
const base = inspect('wasm-duke3d'), candidate = inspect(name), rtcw = inspect('wasm-rtcw-sp');
assert.equal(base.Image, 'sha256:8631a4e193cadf1eb16c4b5b5d8c3cb639dd605bcab109c7fd9dac5ea8788e90');
assert.equal(base.State.StartedAt, '2026-09-04T19:45:41.838343396Z');
assert.equal(rtcw.Image, 'sha256:e6cc9c2be15c9009450dd341e7c25fefc04e868a6ed60be195e5ac6479a6c759');
assert.equal(rtcw.State.StartedAt, '2026-09-04T20:59:30.05162676Z');
assert.equal(candidate.State.Running, true);
assert.equal(candidate.HostConfig.ReadonlyRootfs, true);
assert.deepEqual(candidate.HostConfig.PortBindings['8088/tcp'], [{ HostIp: '127.0.0.1', HostPort: String(port) }]);
const dataMount = candidate.Mounts.find(m => m.Destination === '/data/duke3d');
assert.equal(dataMount?.Source, '/home/ted/wasm-game-data/duke3d');
assert.equal(dataMount?.RW, false);
const oldFiles = inventory(base.Id), files = inventory(candidate.Id);
const added = Object.keys(files).filter(file => !(file in oldFiles)).sort();
const changed = Object.keys(oldFiles).filter(file => files[file] !== oldFiles[file]).sort();
assert.deepEqual(added, ['/opt/game-site/duke3d-modernized.js', '/opt/game-site/duke3d-modernized.wasm']);
assert.deepEqual(changed, ['/opt/game-site/adapters/duke3d.js',
  ...(textInput ? ['/opt/game-site/duke3d.js', '/opt/game-site/duke3d.wasm'] : []), '/opt/game-site/wasm-game.json']);
const sources = {
  ...(textInput ? { 'duke3d.js': '.work/build/dist/duke3d.js', 'duke3d.wasm': '.work/build/dist/duke3d.wasm' } : {}),
  'duke3d-modernized.js': '.work/duke-modernized/dist/duke3d.js',
  'duke3d-modernized.wasm': '.work/duke-modernized/dist/duke3d.wasm',
  'adapters/duke3d.js': 'web/duke3d-adapter.js', 'wasm-game.json': 'web/wasm-game.json'
};
const http = {};
for (const relative of new Set(['duke3d.js', 'duke3d.wasm', ...Object.keys(sources)])) {
  const response = await fetch(`http://127.0.0.1:${port}/${relative}`);
  assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  http[relative] = hash(bytes);
  assert.equal(http[relative], files['/opt/game-site/' + relative]);
  if (sources[relative]) assert.equal(http[relative], hash(fs.readFileSync(path.join(repo, sources[relative]))));
  if (relative.endsWith('.js')) assert.doesNotMatch(bytes.toString('utf8'), /\[GPU (?:driver|draw|pending|world)\]/);
  if (textInput && /^duke3d(?:-modernized)?\.js$/.test(relative))
    assert.match(bytes.toString('utf8'), /_Build_WasmTextEvent/);
}
const status = await fetch(`http://127.0.0.1:${port}/game-data/status?variant=duke3d`).then(r => r.json());
assert.equal(status.ready, true);
assert.equal(status.variant, 'duke3d');
const result = { observedAt: new Date().toISOString(), scope: 'Selectable profile package and HTTP identity, not gameplay acceptance',
  base: { id: base.Id, image: base.Image, startedAt: base.State.StartedAt },
  rtcw: { id: rtcw.Id, image: rtcw.Image, startedAt: rtcw.State.StartedAt },
  candidate: { name, id: candidate.Id, image: candidate.Image, startedAt: candidate.State.StartedAt, port },
  added, changed, unchangedFiles: Object.keys(oldFiles).length - changed.length, files, http,
  classicEngineUnchanged: !textInput, textInputBothProfiles: textInput,
  bloodUnchanged: true, ownerDataReadOnly: true, ready: status.ready, drawObserverPresent: false };
if (process.env.DUKE_PROFILES_PACKAGE_PROOF) fs.writeFileSync(process.env.DUKE_PROFILES_PACKAGE_PROOF,
  JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result, null, 2));
