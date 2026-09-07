import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createHash, webcrypto } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const game = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nativeRoot = process.env.OPENRCT2_SOURCE_DIR || path.resolve(game, '../../.work/openrct2');
const worker = await fs.readFile(path.join(game, 'web/openrct2-worker.js'), 'utf8');
const begin = worker.indexOf('async function stampBundledObjects(');
const end = worker.indexOf('\nfunction mountInstallationObjects(', begin);
assert.ok(begin >= 0 && end > begin);
const stampSource = worker.slice(begin, end);
const context = vm.createContext({ crypto: webcrypto, DataView });
vm.runInContext(stampSource, context);
const stamp = context.stampBundledObjects;
const call = worker.indexOf('await stampBundledObjects(runtime.FS)');
assert.ok(call > worker.indexOf('runtime = await factory(moduleConfig)'));
assert.ok(call < worker.indexOf('Mounting the installation.'));
assert.ok(call < worker.indexOf('persistenceManager.attach('));
assert.ok(call < worker.indexOf('runtime.callMain(launchArguments)'));

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const second = bytes => createHash('sha256').update(bytes).digest().readUInt32BE(0);
const bundled = '/OpenRCT2/object';
const isIndexed = name => /\.(dat|pob|json|parkobj)$/i.test(name);
function filesystem(entries, clock = 1788670000000) {
  const nodes = new Map();
  function directory(name) {
    if (nodes.has(name)) return;
    nodes.set(name, { mode: 0o40755, atime: clock, mtime: clock });
    if (name !== '/') directory(path.posix.dirname(name));
  }
  directory(bundled);
  for (const [name, bytes, mode = 0o100644, mtime = clock] of entries) {
    directory(path.posix.dirname(name));
    nodes.set(name, { bytes: Uint8Array.from(bytes), mode, mtime, atime: clock });
  }
  const reads = [], writes = [];
  const lookup = name => { assert.ok(nodes.has(name), name); return nodes.get(name); };
  return {
    nodes, reads, writes,
    readdir(name) {
      assert.equal(lookup(name).mode, 0o40755);
      return ['.', '..', ...[...nodes.keys()].filter(p => p !== name && path.posix.dirname(p) === name).map(p => path.posix.basename(p))];
    },
    lstat(name) { const n = lookup(name); return { mode: n.mode, size: n.bytes?.length || 0, atime: new Date(n.atime), mtime: new Date(n.mtime) }; },
    isDir: mode => (mode & 0o170000) === 0o40000,
    isFile: mode => (mode & 0o170000) === 0o100000,
    readFile(name) { reads.push(name); return lookup(name).bytes.slice(); },
    utime(name, atime, mtime) {
      assert.ok(Number.isFinite(atime) && Number.isFinite(mtime));
      writes.push(name); Object.assign(lookup(name), { atime, mtime });
    }
  };
}
const samples = [
  [bundled + '/a.json', [1, 2, 3]], [bundled + '/nested/b.PARKOBJ', [4, 5]],
  [bundled + '/empty.pob', []], [bundled + '/legacy.dat', [9]],
  [bundled + '/notes.txt', [8]], [bundled + '/alias.json', [7], 0o120777],
  ['/RCT/ObjData/owner.parkobj', [6]], ['/save/openrct2/object/custom.json', [5]],
  ['/save/openrct2/objects.idx', [4]], ['/OpenRCT2/g2.dat', [3]]
];
const first = filesystem(samples), next = filesystem(samples, 1788670100000);
const before = new Map([...first.nodes].map(([name, node]) => [name, { ...node, bytes: node.bytes?.slice() }]));
assert.deepEqual({ ...await stamp(first) }, { files: 4, bytes: 6 });
assert.deepEqual({ ...await stamp(next) }, { files: 4, bytes: 6 });
for (const [name, node] of first.nodes) {
  assert.deepEqual(node.bytes, before.get(name).bytes, 'no payload changes');
  assert.equal(node.mode, before.get(name).mode, 'no permission/type changes');
  assert.equal(node.atime, before.get(name).atime, 'atime is preserved');
  if (first.writes.includes(name)) {
    assert.equal(node.mtime, second(node.bytes) * 1000, 'content-derived whole seconds');
    assert.equal(node.mtime, next.nodes.get(name).mtime, 'independent of launch clock');
  } else assert.equal(node.mtime, before.get(name).mtime, 'all non-bundled/non-indexed/link nodes untouched');
}
assert.deepEqual(first.reads, first.writes, 'only stamped files are read');
const originalTimes = first.writes.map(name => first.nodes.get(name).mtime);
await stamp(first);
assert.deepEqual(first.writes.slice(0, 4).map(name => first.nodes.get(name).mtime), originalTimes, 'idempotent');
assert.deepEqual({ ...await stamp(filesystem([])) }, { files: 0, bytes: 0 });
for (const seconds of [0, 0xffffffff]) {
  const digest = new Uint8Array(32); new DataView(digest.buffer).setUint32(0, seconds, false);
  const isolated = vm.createContext({ crypto: { subtle: { async digest() { return digest.buffer; } } }, DataView });
  vm.runInContext(stampSource, isolated);
  const FS = filesystem([[bundled + '/edge.json', [1]]]);
  await isolated.stampBundledObjects(FS);
  assert.equal(FS.lstat(bundled + '/edge.json').mtime.getTime(), seconds * 1000, 'full unsigned stamp range');
}
const rejecting = vm.createContext({ crypto: { subtle: { async digest() { throw new Error('digest failure'); } } }, DataView });
vm.runInContext(stampSource, rejecting);
await assert.rejects(rejecting.stampBundledObjects(filesystem(samples)), /digest failure/);
const unreadable = filesystem(samples); unreadable.readFile = () => { throw new Error('read failure'); };
await assert.rejects(stamp(unreadable), /read failure/);

// Exercise the actual public preload payloads, not owner installation data.
const script = await fs.readFile(path.join(nativeRoot, 'build-framework/openrct2.js'), 'utf8');
const data = await fs.readFile(path.join(nativeRoot, 'build-framework/openrct2.data'));
const packageSha256 = hash(data);
const metadataStart = script.indexOf('loadPackage({files:[');
const metadataEnd = script.indexOf('})})();', metadataStart);
assert.ok(metadataStart >= 0 && metadataEnd > metadataStart);
const literal = script.slice(metadataStart + 'loadPackage('.length, metadataEnd + 1);
const metadata = JSON.parse(literal.replace(/([{,])(files|filename|start|end|remote_package_size):/g, '$1"$2":'));
assert.equal(metadata.remote_package_size, data.length);
assert.match(script, /node\.atime=node\.mtime=node\.ctime=Date\.now\(\)/, 'pinned MEMFS uses launch-time file metadata');
assert.match(script, /FS_createDataFile"\]\(name,null,data,true,true,true\)/, 'preload creates files without source mtimes');
let offset = 0;
const names = new Set();
for (const file of metadata.files) {
  assert.equal(file.start, offset); assert.ok(file.end >= file.start && file.end <= data.length);
  assert.ok(file.filename.startsWith('/OpenRCT2/') && !file.filename.split('/').includes('..'));
  assert.ok(!names.has(file.filename)); names.add(file.filename); offset = file.end;
}
assert.equal(offset, data.length);
const publicEntries = metadata.files.filter(file => file.filename.startsWith(bundled + '/') && isIndexed(file.filename))
  .map(file => [file.filename, data.subarray(file.start, file.end)]);
assert.equal(publicEntries.length, 2484, 'pinned asset-package inventory');
const real = filesystem(publicEntries);
const actualStats = await stamp(real);
for (const [name, bytes] of publicEntries) {
  assert.equal(real.nodes.get(name).mtime, second(bytes) * 1000);
  assert.deepEqual(Buffer.from(real.nodes.get(name).bytes), Buffer.from(bytes));
}

const headerName = 'src/openrct2/core/FileIndex.hpp';
const header = await fs.readFile(path.join(nativeRoot, headerName), 'utf8');
assert.equal(header, execFileSync('git', ['-C', nativeRoot, 'show', `HEAD:${headerName}`], { encoding: 'utf8' }), 'native invalidation unchanged');
for (const name of ['src/openrct2/core/Numerics.hpp', 'src/openrct2/core/FileScanner.cpp']) {
  assert.equal(await fs.readFile(path.join(nativeRoot, name), 'utf8'),
    execFileSync('git', ['-C', nativeRoot, 'show', `HEAD:${name}`], { encoding: 'utf8' }), 'native checksum/stat semantics unchanged');
}
const classStart = header.indexOf('template<typename TItem>\nclass FileIndex');
assert.ok(classStart >= 0);
const classBody = header.slice(classStart);
const fixturePrefix = await fs.readFile(path.join(game, 'tests/file-index-fixture.cpp'), 'utf8');
const fixtureMain = await fs.readFile(path.join(game, 'tests/file-index-main.cpp'), 'utf8');
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'openrct2-object-stamps-'));
await fs.writeFile(path.join(scratch, 'index.cpp'), fixturePrefix + '\n' + classBody + '\n' + fixtureMain);
const binary = path.join(scratch, 'index-test');
execFileSync(process.env.CXX || 'c++', ['-std=c++20', '-O2', '-Wall', '-Wextra', '-Werror', '-fsanitize=undefined',
  '-I', path.join(nativeRoot, 'src/openrct2/core'), path.join(scratch, 'index.cpp'), '-o', binary], { stdio: 'inherit' });
function records(FS) {
  return [...FS.nodes].filter(([name, node]) => name.startsWith(bundled + '/') && FS.isFile(node.mode) && isIndexed(name))
    .map(([name, node]) => [name, node.bytes.length, Math.floor(node.mtime / 1000), second(node.bytes)]);
}
const base = records(real);
base.push([bundled + '/installed/private.parkobj', 100, 1700000000, 123], ['/save/openrct2/object/custom.json', 90, 1700000001, 456]);
const shifted = base.map(record => [...record]);
for (let i = 0; i < publicEntries.length; i++) shifted[i][2] = 1788670000;
const shiftedAgain = shifted.map((record, index) => index < publicEntries.length ? [record[0], record[1], 1788670100, record[3]] : [...record]);
const changedBytes = Uint8Array.from(publicEntries[0][1]); changedBytes[0] ^= 1;
const changed = base.map(record => [...record]); changed[0][2] = changed[0][3] = second(changedBytes);
assert.notEqual(changed[0][2], base[0][2]);
const cases = [];
async function nativeCase(name, initial, later, expectRebuild, options = '') {
  const input = path.join(scratch, name + '.txt');
  const world = rows => rows.length + '\n' + rows.map(row => row.join(' ')).join('\n') + '\n';
  await fs.writeFile(input, world(initial) + world(later));
  const output = execFileSync(binary, [input, path.join(scratch, name + '.idx'), expectRebuild ? '1' : '0', options], { encoding: 'utf8' });
  assert.match(output, /passed/); cases.push({ name, expectRebuild, output: output.trim() });
}
await nativeCase('old-launch-clock-rebuild', shifted, shiftedAgain, true);
await nativeCase('stable-content-reload', base, base, false);
await nativeCase('same-size-content-change', base, changed, true);
await nativeCase('old-to-new-one-time-rebuild', shifted, base, true);
for (const [name, column, value] of [['size-change', 1, base[0][1] + 1], ['private-mtime-change', 2, 1700000005]]) {
  const later = base.map(record => [...record]); later[name.startsWith('private') ? base.length - 2 : 0][column] = value;
  await nativeCase(name, base, later, true);
}
await nativeCase('object-added', base, [...base, [bundled + '/new.json', 0, 3, 4]], true);
await nativeCase('object-removed', base, base.slice(1), true);
const renamed = base.map(record => [...record]); renamed[0][0] += '.json';
await nativeCase('object-renamed', base, renamed, true);
const user = base.map(record => [...record]); user.at(-1)[2]++;
await nativeCase('user-mtime-change', base, user, true);
await nativeCase('language-change', base, base, true, 'language');
await nativeCase('version-change', base, base, true, 'version');
await nativeCase('corrupt-header', base, base, true, 'corrupt');
await nativeCase('truncated-index', base, base, true, 'truncate');
assert.equal(hash(data), packageSha256, 'content-change fixtures must not mutate the package buffer');
const report = { checkedAt: new Date().toISOString(), scratch, bundled: { ...actualStats }, cases,
  nativeClassSha256: hash(classBody), workerSha256: hash(worker), packageSha256,
  scope: 'Exact worker function and all 2484 public preload object payloads; complete unchanged native FileIndex class with controlled scanner/item/job dependencies and real index-file round trips. Existing 32-bit invalidation is retained, not a collision-free content-addressed cache. Actual Chrome is separate.' };
if (process.argv[2]) await fs.writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
console.log(`Bundled object stamps: scope/immutability/errors/zero/full-width cases, ${actualStats.files} real packaged files and ${cases.length} exact native FileIndex cases pass. Fixtures: ${scratch}`);
