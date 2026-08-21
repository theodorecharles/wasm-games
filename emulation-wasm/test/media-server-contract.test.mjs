import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frameworkDir = path.resolve(process.env.WASM_FRAMEWORK_DIR || '/home/ted/Development/wasm-game-framework');
const require = createRequire(import.meta.url);
const { normalizeManifestCollection } = require(path.join(frameworkDir, 'server/provisioning.js'));
const { createMediaLibraryStore } = require(path.join(frameworkDir, 'server/media-library.js'));
const manifests = normalizeManifestCollection(JSON.parse(fs.readFileSync(path.join(repoDir, 'web/wasm-game-data.json'))));

async function install(store, files) {
  const session = await store.beginUpload({ files: files.map(file => ({ name: file.name, size: file.bytes.length })) });
  for (let index = 0; index < files.length; index += 1) {
    await store.acceptUploadFile(session.id, session.files[index].id, Readable.from([files[index].bytes]));
  }
  return store.commitUpload(session.id);
}

test('released framework server executes the downstream bundle validator unchanged', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'emulation-media-contract.'));
  try {
    const nesStore = createMediaLibraryStore({
      dataRoot: root, validatorRoot: path.join(repoDir, 'web'), manifest: manifests.get('nes').mediaLibrary
    });
    const nes = Buffer.alloc(16 + 16384);
    nes.set([0x4e, 0x45, 0x53, 0x1a]);
    const installedNes = await install(nesStore, [{ name: 'fixture.nes', bytes: nes }]);
    assert.equal(installedNes.label, 'fixture');
    assert.deepEqual(installedNes.metadata, { system: 'nes', format: 'nes', fileCount: 1 });
    assert.doesNotMatch(JSON.stringify(installedNes), /fixture\.nes/,
      'public media summaries must not disclose raw filenames');

    const ps1Store = createMediaLibraryStore({
      dataRoot: root, validatorRoot: path.join(repoDir, 'web'), manifest: manifests.get('ps1').mediaLibrary
    });
    const cue = Buffer.from('FILE "track01.bin" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n');
    const installedPs1 = await install(ps1Store, [
      { name: 'disc/game.cue', bytes: cue },
      { name: 'disc/track01.bin', bytes: Buffer.alloc(2352) }
    ]);
    const detail = await ps1Store.detail(installedPs1.id);
    assert.equal(detail.primary, 'disc/game.cue');
    assert.equal(detail.files.length, 2);
    assert.deepEqual(installedPs1.metadata, { system: 'ps1', format: 'cue', fileCount: 2 });

    const ps2Store = createMediaLibraryStore({
      dataRoot: root, validatorRoot: path.join(repoDir, 'web'), manifest: manifests.get('ps2').mediaLibrary
    });
    const iso = Buffer.alloc(17 * 2048);
    iso.set([1, 0x43, 0x44, 0x30, 0x30, 0x31, 1], 16 * 2048);
    const installedPs2 = await install(ps2Store, [{ name: 'fixture.iso', bytes: iso }]);
    assert.equal(installedPs2.metadata.system, 'ps2');
    assert.equal(ps2Store.manifest.maxBrowserCacheBytes, 0,
      'server installation must not weaken the PS2 browser random-access gate');
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});
