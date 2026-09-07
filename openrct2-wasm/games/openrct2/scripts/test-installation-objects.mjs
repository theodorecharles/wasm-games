import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../web/openrct2-worker.js', import.meta.url), 'utf8');
const start = source.indexOf('function mountInstallationObjects(');
const end = source.indexOf('\nfunction stateName(', start);
assert.ok(start >= 0 && end > start);
const calls = [];
const mounted = {};
const workerFs = {};
const FS = { mount(type, options, root) { calls.push({ type, options, root }); return mounted; } };
const cache = { markTree(node) { calls.push({ node }); } };
const context = vm.createContext({ ensureDirectory(fs, root) { calls.push({ fs, root }); }, Set, Error });
vm.runInContext(source.slice(start, end), context);
// The old worker only mounted ObjData under /RCT, outside native object roots.
const mount = process.env.OPENRCT2_OBJECTS_LEGACY === '1' ? () => 0 : context.mountInstallationObjects;
const object = { name: 'private.parkobj' }, upper = { name: 'UPPER.PARKOBJ' };
const groups = [{ directory: 'ObjData', files: [object, upper, { name: 'ORIGINAL.DAT' }, { name: 'notes.json' }] },
  { directory: 'Tracks', files: [{ name: 'not-an-object.parkobj' }] }];
assert.equal(mount(FS, workerFs, groups, cache), 2);
assert.equal(calls.length, 3);
assert.equal(calls[0].fs, FS);
assert.equal(calls[0].root, '/OpenRCT2/object/installed');
assert.equal(calls[1].root, calls[0].root);
assert.equal(calls[1].type, workerFs);
assert.equal(calls[1].options.files[0], object);
assert.equal(calls[1].options.files[1], upper);
assert.equal(calls[2].node, mounted);
assert.equal(groups[0].files.length, 4, 'original group is not filtered in place');
for (const groups of [[], [{ directory: 'ObjData', files: [] }], [{ directory: 'ObjData', files: [{ name: 'BASE.DAT' }] }],
  [{ directory: 'Data', files: [object] }]]) {
  calls.length = 0;
  assert.equal(mount(FS, workerFs, groups, cache), 0);
  assert.equal(calls.length, 0, 'unchanged installations create no extra mount');
}
for (const files of [[object, object], [{ name: '../escape.parkobj' }], [{ name: 'dir\\escape.parkobj' }]]) {
  calls.length = 0;
  assert.throws(() => mount(FS, workerFs, [{ directory: 'ObjData', files }], cache), /Invalid or duplicate/);
  assert.equal(calls.length, 0, 'validate before mounting');
}
const callSite = source.indexOf('const installedObjects = mountInstallationObjects(runtime.FS, workerFs, groups, hotCache)');
assert.ok(callSite > source.indexOf('Mounting the installation.'));
assert.ok(callSite < source.indexOf('runtime.callMain(launchArguments)'));
console.log('OpenRCT2 private object mounting: native indexed root, original Blob identity, cache, extension/directory filtering, empty installs and invalid-name cases pass.');
