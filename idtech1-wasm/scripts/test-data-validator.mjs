#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const framework = path.resolve(process.env.WASM_FRAMEWORK_DIR || path.join(repo, '../wasm-game-framework'));
const { ownerFileValidation, runDataValidator, validateOwnerFile } = require(path.join(framework, 'dist/wasm-game-framework.js'));
const { createProvisioningStore, normalizeManifestCollection } = require(path.join(framework, 'server/provisioning.js'));
const validatorModule = await import(new URL('../web/data-validator.mjs', import.meta.url));
const manifest = JSON.parse(await fsp.readFile(path.join(repo, 'web/wasm-game-data.json'), 'utf8'));

if (!globalThis.crypto?.subtle) globalThis.crypto = crypto.webcrypto;

const REQUIRED = Object.freeze({
  doom: ['POSSA1', 'E1M1', 'E3M1', 'E4M1'],
  doom2: ['POSSA1', 'MAP01', 'MAP30', 'MAP31', 'MAP32', 'D_RUNNIN'],
  tnt: ['MAP01', 'MAP30', 'MAP31', 'MAP32', 'DOTNTDR', 'BTNTCRAT'],
  plutonia: ['MAP01', 'MAP30', 'MAP31', 'MAP32', 'CAMO1', 'MC1'],
  heretic: ['IMPXA1', 'E1M1', 'E2M1', 'E3M1', 'EXTENDED'],
  hexen: ['ETTNA1', 'MAP01', 'SKY1', 'CLUS1MSG', 'BEHAVIOR'],
  chex: ['E1M1', 'POSSH0M0', 'SARGE2E8']
});

function fixtureWad(identification, names) {
  const bytes = Buffer.alloc(12 + names.length * 16);
  bytes.write(identification, 0, 4, 'latin1');
  bytes.writeUInt32LE(names.length, 4);
  bytes.writeUInt32LE(12, 8);
  names.forEach((name, index) => {
    const entry = 12 + index * 16;
    bytes.writeUInt32LE(12, entry);
    bytes.writeUInt32LE(0, entry + 4);
    Buffer.from(String(name).toUpperCase(), 'latin1').copy(bytes, entry + 8, 0, 8);
  });
  return bytes;
}

function declaration(family, identification) {
  return {
    ...manifest.validator,
    policy: { ...manifest.validator.policy, family, identification }
  };
}

function digestBuffer(bytes, algorithm) {
  return crypto.createHash(String(algorithm).toLowerCase().replace(/-/g, '')).update(bytes).digest('hex');
}

async function validateBuffer(bytes, family, identification) {
  const source = {
    size: bytes.length,
    async read(offset, length) { return bytes.subarray(offset, offset + length); },
    async digest(algorithm) { return digestBuffer(bytes, algorithm); }
  };
  return runDataValidator(source, declaration(family, identification), {
    name: `${family}.wad`,
    loadModule: async modulePath => {
      assert.equal(modulePath, '/data-validator.mjs');
      return validatorModule;
    }
  });
}

for (const [family, names] of Object.entries(REQUIRED)) {
  const identification = family === 'chex' ? 'PWAD' : 'IWAD';
  const result = await validateBuffer(fixtureWad(identification, names), family, identification);
  assert.equal(result.accepted, true, `${family} structural fixture should pass`);
  assert.equal(result.identity, family);
  assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
}

const browserFixture = fixtureWad('IWAD', [...REQUIRED.doom, 'THINGS', 'THINGS']);
const nodeResult = await validateBuffer(browserFixture, 'doom', 'IWAD');
const browserFile = new Blob([browserFixture]);
await validateOwnerFile(browserFile, {
  key: 'iwad', name: 'doom.wad', minSize: 12, maxSize: 67108864,
  validator: declaration('doom', 'IWAD')
}, null, { loadModule: async () => validatorModule });
const browserResult = ownerFileValidation(browserFile);
assert.deepEqual(browserResult, nodeResult, 'Node and browser Blob paths must run the exact same validator module');
assert.equal(browserResult.metadata.duplicateNameCount, 1, 'duplicate lump names are counted without unsafe last-write wins');
assert.equal(browserResult.metadata.signals.e4m1, true);

const malformedDirectory = fixtureWad('IWAD', REQUIRED.doom);
malformedDirectory.writeUInt32LE(malformedDirectory.length - 4, 8);
assert.equal((await validateBuffer(malformedDirectory, 'doom', 'IWAD')).accepted, false);

const malformedLump = fixtureWad('IWAD', REQUIRED.doom);
malformedLump.writeUInt32LE(malformedLump.length, 12);
malformedLump.writeUInt32LE(1, 16);
assert.match((await validateBuffer(malformedLump, 'doom', 'IWAD')).error, /lump 0.*outside/);

const excessiveCount = Buffer.alloc(12);
excessiveCount.write('IWAD', 0, 4, 'latin1');
excessiveCount.writeUInt32LE(65537, 4);
excessiveCount.writeUInt32LE(12, 8);
assert.match((await validateBuffer(excessiveCount, 'doom', 'IWAD')).error, /lump count/);

assert.match((await validateBuffer(fixtureWad('PWAD', REQUIRED.doom), 'doom', 'IWAD')).error, /expected IWAD/);
const doom2WithTntMarkers = fixtureWad('IWAD', [...REQUIRED.doom2, 'DOTNTDR', 'BTNTCRAT']);
assert.match((await validateBuffer(doom2WithTntMarkers, 'doom2', 'IWAD')).error, /different game family/);
assert.match((await validateBuffer(fixtureWad('IWAD', REQUIRED.doom2), 'tnt', 'IWAD')).error, /missing required tnt lumps/);
assert.match((await validateBuffer(fixtureWad('PWAD', [...REQUIRED.chex, 'MAP01']), 'chex', 'PWAD')).error, /different game family/);

const variants = normalizeManifestCollection(manifest);
const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), 'idtech1-validator-'));
try {
  const dataRoot = path.join(temporary, 'data');
  const store = createProvisioningStore({ dataRoot, validatorRoot: path.join(repo, 'web'), manifest: variants.get('doom2') });
  const target = store.filePath(store.policyFor('iwad'));
  const existing = Buffer.from('existing invalid data');
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(target, existing);
  await assert.rejects(store.acceptUpload('iwad', Readable.from(doom2WithTntMarkers)), /rejected/);
  assert.deepEqual(await fsp.readFile(target), existing, 'a rejected upload must not replace an existing target');
  await fsp.rm(target);
  const accepted = await store.acceptUpload('iwad', Readable.from(fixtureWad('IWAD', REQUIRED.doom2)));
  assert.equal(accepted.validation.identity, 'doom2');
  const status = await store.status();
  assert.equal(status.ready, true);
  assert.equal(status.files[0].validation.identity, 'doom2');
  assert.equal(JSON.stringify(status).includes(temporary), false, 'status must not expose filesystem paths');
} finally {
  await fsp.rm(temporary, { recursive: true, force: true });
}

const installedRoots = [
  '/home/ted/.steam/debian-installation/steamapps/common',
  '/home/ted/Development/wasm/data/crispy',
  '/home/ted/Development/dos/DOS/CHEX'
];
const familiesByName = new Map([
  ['doom.wad', ['doom', 'IWAD']], ['doom2.wad', ['doom2', 'IWAD']],
  ['tnt.wad', ['tnt', 'IWAD']], ['plutonia.wad', ['plutonia', 'IWAD']],
  ['heretic.wad', ['heretic', 'IWAD']], ['hexen.wad', ['hexen', 'IWAD']],
  ['chex.wad', ['chex', 'PWAD']]
]);

async function walk(directory, found) {
  let entries;
  try { entries = await fsp.readdir(directory, { withFileTypes: true }); } catch (_) { return; }
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(filename, found);
    else if (entry.isFile() && familiesByName.has(entry.name.toLowerCase())) found.push(filename);
  }
}

async function fileSource(filename) {
  const stat = await fsp.stat(filename);
  const handle = await fsp.open(filename, 'r');
  return {
    size: stat.size,
    async read(offset, length) {
      const bytes = Buffer.alloc(length);
      const result = await handle.read(bytes, 0, length, offset);
      return bytes.subarray(0, result.bytesRead);
    },
    async digest(algorithm) {
      const hash = crypto.createHash(String(algorithm).toLowerCase().replace(/-/g, ''));
      await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filename);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', resolve);
      });
      return hash.digest('hex');
    },
    close: () => handle.close()
  };
}

const installed = [];
for (const root of installedRoots) await walk(root, installed);
const releaseMatrix = new Map();
for (const filename of installed.sort()) {
  const [family, identification] = familiesByName.get(path.basename(filename).toLowerCase());
  const source = await fileSource(filename);
  let result;
  try {
    result = await runDataValidator(source, declaration(family, identification), {
      name: path.basename(filename), loadModule: async () => validatorModule
    });
  } finally { await source.close(); }
  const header = (await fsp.readFile(filename)).subarray(0, 4).toString('latin1');
  const expected = !(family === 'doom2' && header === 'PWAD');
  assert.equal(result.accepted, expected, `${filename}: ${result.error || result.version}`);
  const key = result.fingerprint || `${family}:${header}:${result.error}`;
  if (!releaseMatrix.has(key)) releaseMatrix.set(key, { family, header, result, filename });
}

for (const { family, header, result, filename } of releaseMatrix.values()) {
  console.log(`${result.accepted ? 'ACCEPT' : 'REJECT'}\t${family}\t${header}\t${result.version || result.error}\t${filename}`);
}

const fixtureFlag = process.argv.indexOf('--write-fixtures');
if (fixtureFlag >= 0) {
  const directory = path.resolve(process.argv[fixtureFlag + 1] || '');
  if (!process.argv[fixtureFlag + 1]) throw new Error('--write-fixtures requires a directory');
  await fsp.mkdir(directory, { recursive: true });
  await fsp.writeFile(path.join(directory, 'doom2-valid.wad'), fixtureWad('IWAD', REQUIRED.doom2));
  await fsp.writeFile(path.join(directory, 'doom2-wrong-family.wad'), doom2WithTntMarkers);
  await fsp.writeFile(path.join(directory, 'doom2-corrupt.wad'), malformedDirectory);
}

console.log(`Validated ${releaseMatrix.size} unique installed release(s), shared Node/browser semantics, malformed bounds, family rules, and atomic provisioning.`);
