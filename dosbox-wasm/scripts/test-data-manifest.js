#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const site = path.resolve(process.argv[2] || path.join(__dirname, '../web/dist'));
const root = JSON.parse(fs.readFileSync(path.join(site, 'wasm-game-data.json'), 'utf8'));
const variants = root.variants;

const expected = Object.freeze({
  jill1: { count: 28, executable: 'JILL.EXE', namespace: 'dosbox-jill-jill1', preservePaths: false },
  jill2: { count: 27, executable: 'JILL2.EXE', namespace: 'dosbox-jill-jill2', preservePaths: false },
  jill3: { count: 34, executable: 'JILL3.EXE', namespace: 'dosbox-jill-jill3', preservePaths: false },
  jazz: { count: 66, executable: 'JAZZ.EXE', namespace: 'dosbox-jazz', preservePaths: false },
  duke1: { count: 55, executable: 'DN1.EXE', namespace: 'dosbox-duke1', preservePaths: false },
  duke2: { count: 7, executable: 'NUKEM2.EXE', namespace: 'dosbox-duke2', preservePaths: false },
  gta: { count: 89, executable: 'GTA.BAT', namespace: 'dosbox-gta', preservePaths: true },
  nfs: { count: 360, executable: 'TNFS.EXE', namespace: 'dosbox-nfs', preservePaths: true },
  simcity2000: { count: 30, executable: 'SC2000.EXE', namespace: 'dosbox-simcity2000', preservePaths: true }
});

assert.equal(root.namespace, 'dosbox-family');
assert.deepEqual(Object.keys(variants), Object.keys(expected));

for (const [variant, contract] of Object.entries(expected)) {
  const manifest = variants[variant];
  assert.equal(manifest.files.length, contract.count, `${variant}: curated count changed`);
  assert.equal(manifest.executable, contract.executable);
  assert.equal(manifest.namespace, contract.namespace);
  assert.equal(manifest.preservePaths, contract.preservePaths);
  assert.deepEqual(manifest.dosboxArguments, ['-machine', 'svga_s3']);
  assert.deepEqual(manifest.commands.slice(0, 2), ['mount c /game', 'c:']);
  assert.ok(manifest.commands.some(command => command.includes(contract.executable)));

  const keys = new Set();
  const mountNames = new Set();
  for (const policy of manifest.files) {
    assert.match(policy.key, /^[a-z0-9._-]+$/);
    assert.ok(!keys.has(policy.key), `${variant}: duplicate key ${policy.key}`);
    keys.add(policy.key);
    assert.deepEqual(policy.names, [policy.name]);
    assert.equal(policy.path, `${variant}/${policy.mountName || policy.name}`);
    assert.ok(!mountNames.has(policy.mountName || policy.name), `${variant}: duplicate mount path`);
    mountNames.add(policy.mountName || policy.name);
    assert.ok(Number.isSafeInteger(policy.size) && policy.size > 0);
    assert.match(policy.sha256, /^[a-f0-9]{64}$/);
  }
}

function names(variant) {
  return variants[variant].files.map(file => file.mountName || file.name);
}

assert.ok(names('gta').some(name => name.toLowerCase().startsWith('gtados/')));
assert.ok(names('nfs').some(name => name.toLowerCase().startsWith('gamedata/')));
assert.ok(names('simcity2000').some(name => name.toLowerCase().startsWith('sound/')));

const exclusions = {
  jazz: /^(?:CONFIG\.000|SETUP\.EXE|MANUAL\.DOC)$/i,
  duke1: /^(?:HIGHS\.DN1|KEYS\.DN1|SAVEDT\.DN1)$/i,
  duke2: /^NUKEM2\.-(?:GT|NM|V1)$/i,
  gta: /^(?:GTA\.PIF|GTADOS\/(?:DIG\.INI|MEMCHECK\.LOG))$/i,
  nfs: /^(?:INSTALL\.BAT|NFS\.BAT|NFSSB\.BAT|GAMEDATA\/CONFIG\/(?:CONFIG\.DAT|JOYSTICK\.CFG|TMP\.TRI))$/i,
  simcity2000: /^(?:VESA\/|INSTALL\.|INFO\.EXE|PATCH\.EXE|README\.TXT)/i
};
for (const [variant, pattern] of Object.entries(exclusions)) {
  assert.ok(!names(variant).some(name => pattern.test(name)), `${variant}: mutable/setup file entered policy`);
}

assert.deepEqual(variants.nfs.sourceArchive, {
  name: 'Need For Speed (1995)(Pioneer Productions).zip',
  sha256: 'f3a204c48dd39a5735690a45729683a10c00336abfb80b620d74c9213d25ed5a'
});
assert.deepEqual(variants.simcity2000.sourceArchive, {
  name: 'Sim City 2000 (1993)(Maxis Software Inc)(Rev).zip',
  sha256: 'c759d7255fbb3c234ed88f01d6ffbd17661f953b6601f8db1607ccd84320d5b4'
});

console.log('DOSBox owner-data manifests, nested paths, archive provenance, and curated exclusions passed');
