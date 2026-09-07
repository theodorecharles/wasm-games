#!/usr/bin/env node
// Audit the full canonical build, including the shared shell actually served.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, '.work/build/dist');
const framework = process.env.WASM_FRAMEWORK_DIR || path.resolve(root, '../../wasm-game-framework');
const container = process.argv[2] || 'build-family-current-proof-20260906';
const port = Number(process.argv[3] || 32989);
assert.match(container, /^build-family-(?:current|modernized)-proof-20260906$/);
assert([32988, 32989].includes(port));
const run = args => execFileSync('docker', args, { encoding: 'utf8' }).trim();
const c = JSON.parse(run(['inspect', container]))[0];
assert.equal(c.State.Running, true); assert.equal(c.HostConfig.ReadonlyRootfs, true);
assert.deepEqual(c.HostConfig.PortBindings['8088/tcp'], [{ HostIp: '127.0.0.1', HostPort: String(port) }]);
for (const game of ['blood', 'duke3d']) {
  const mount = c.Mounts.find(m => m.Destination === `/data/${game}`);
  assert.equal(mount.Source, `/home/ted/wasm-game-data/${game}`); assert.equal(mount.RW, false);
}
const hash = value => createHash('sha256').update(value).digest('hex');
const inventory = Object.fromEntries(run(['exec', container, 'find', '/opt/game-site', '-type', 'f',
  '-exec', 'sha256sum', '{}', '+']).split('\n').map(line => [line.slice(66).replace('/opt/game-site/', ''), line.slice(0, 64)]));
const stagedFiles = fs.readdirSync(dist, { recursive: true }).filter(file => fs.statSync(path.join(dist, file)).isFile()).sort();
assert.deepEqual(Object.keys(inventory).sort(), stagedFiles);
for (const relative of stagedFiles) assert.equal(inventory[relative], hash(fs.readFileSync(path.join(dist, relative))), relative);
const http = {};
for (const relative of stagedFiles.filter(file => !file.startsWith('shared-shell/'))) {
  const r = await fetch(`http://127.0.0.1:${port}/${relative}`); assert.equal(r.status, 200);
  const bytes = Buffer.from(await r.arrayBuffer()); http[relative] = hash(bytes);
  assert.equal(http[relative], inventory[relative]);
  if (relative.endsWith('.wasm')) assert.equal(WebAssembly.validate(bytes), true);
  if (relative.endsWith('.js')) assert.doesNotMatch(bytes.toString(), /\[GPU (?:driver|draw|pending|world)\]/);
}
// Metadata is generated only for the staged browser package. Public shell
// requests resolve to the base image, not that staging directory.
const shell = {};
for (const file of ['index.html', 'wasm-game-framework.js', 'wasm-game-bootstrap.js', 'wasm-game-framework.css']) {
  const bytes = fs.readFileSync(path.join(framework, 'dist', file)), expected = hash(bytes);
  const installed = run(['exec', container, 'sha256sum', `/opt/shared-shell/${file}`]).slice(0, 64);
  assert.equal(installed, expected, `served base shell is stale: ${file}`);
  assert.equal(inventory[`shared-shell/${file}`], expected);
  // Root index is rendered by the server; only the static assets are byte-identical.
  if (file !== 'index.html') {
    const r = await fetch(`http://127.0.0.1:${port}/shared-shell/${file}`); assert.equal(r.status, 200);
    assert.equal(hash(Buffer.from(await r.arrayBuffer())), expected);
  }
  shell[file] = expected;
}
const ready = {};
for (const game of ['blood', 'duke3d']) {
  const r = await fetch(`http://127.0.0.1:${port}/game-data/status?variant=${game}`).then(r => r.json());
  assert.equal(r.ready, true); assert.equal(r.variant, game); ready[game] = true;
}
for (const prefix of ['blood', 'blood-modernized'])
  assert.equal(inventory[`${prefix}.data`], hash(fs.readFileSync(path.join(root, '.work/source/nblood.pk3'))));
const compile = JSON.parse(run(['inspect', 'build-family-compile-20260906']))[0];
assert.equal(compile.State.Status, 'exited'); assert.equal(compile.State.ExitCode, 0);
const logs = {};
for (const [file, marker] of [
  ['/tmp/build-family-compile-20260906.log', 'Built Blood and Duke Nukem 3D family site'],
  ['/tmp/build-family-web-tests-20260906-02.log', 'Blood and Duke Nukem 3D builds passed'],
  ['/tmp/build-family-static-tests-20260906.log', 'Verified canonical document/PWA/fullscreen'],
  ['/tmp/build-family-framework-tests-20260906.log', 'fail 0']
]) { const text = fs.readFileSync(file, 'utf8'); assert(text.includes(marker), file); logs[file] = hash(text); }
const source = JSON.parse(fs.readFileSync(path.join(root, 'proofs/blood-modernized-slots-source-2026-09-06.json')));
assert.equal(source.tree, '4a724072809f49588749b7b51e6d761c551933de');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'proofs/blood-modernized-package-2026-09-06.json')));
const live = JSON.parse(run(['inspect', 'wasm-blood']))[0];
assert.equal(live.Image, baseline.live.image); assert.equal(live.State.StartedAt, baseline.live.startedAt);
const result = { observedAt: new Date().toISOString(),
  scope: 'Four native modules, complete staged/installed/HTTP identity, actual base-image shell identity and canonical build/test completion; not Chrome gameplay',
  candidate: { container, port, id: c.Id, image: c.Image, startedAt: c.State.StartedAt },
  compile: { id: compile.Id, image: compile.Image, startedAt: compile.State.StartedAt, finishedAt: compile.State.FinishedAt, exitCode: compile.State.ExitCode },
  sourceTree: source.tree, ready, nativeModules: 4, siteFiles: stagedFiles.length, files: inventory, http, shell,
  logs, bothOwnerMountsReadOnly: true, drawObserverPresent: false, liveBloodUnchanged: true, deployed: false };
if (process.env.BUILD_FAMILY_PACKAGE_PROOF) fs.writeFileSync(process.env.BUILD_FAMILY_PACKAGE_PROOF,
  JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result, null, 2));
