'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { createMediaLibraryStore } = require('/opt/wasm-game-framework/server/media-library.js');

const sourceRoot = path.resolve(process.argv[2] || '/source');
const dataRoot = path.resolve(process.argv[3] || '/data');
const siteRoot = '/opt/game-site';
const requiredDirectories = Object.freeze(['Data', 'ObjData', 'Scenarios', 'Tracks']);

function encodedCaseName(directory, basename) {
  return `${directory}/__case__/${Buffer.from(basename, 'utf8').toString('hex')}`;
}

async function inventory() {
  const files = [];
  for (const directory of requiredDirectories) {
    const root = path.join(sourceRoot, directory);
    const stat = await fsp.stat(root).catch(() => null);
    if (!stat?.isDirectory()) throw new Error(`Missing ${directory} directory under the selected source.`);
    const items = (await fsp.readdir(root, { withFileTypes: true }))
      .filter(item => item.isFile())
      .sort((left, right) => left.name.localeCompare(right.name, 'en'));
    if (!items.length) throw new Error(`${directory} contains no regular files.`);
    for (const item of items) {
      const target = path.join(root, item.name);
      const details = await fsp.stat(target);
      files.push({ source: target, directory, basename: item.name, size: details.size });
    }
  }

  const folded = new Map();
  for (const file of files) {
    const key = `${file.directory}/${file.basename}`.toLowerCase();
    const values = folded.get(key) || [];
    values.push(file);
    folded.set(key, values);
  }
  for (const values of folded.values()) {
    values.sort((left, right) => left.basename.localeCompare(right.basename, 'en'));
    values.forEach((file, index) => {
      file.name = index === 0 ? `${file.directory}/${file.basename}` : encodedCaseName(file.directory, file.basename);
    });
  }
  return files.sort((left, right) => left.name.localeCompare(right.name, 'en'));
}

async function uploadFiles(store, session, files) {
  let next = 0;
  let completed = 0;
  const workers = Array.from({ length: Math.min(8, files.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= files.length) return;
      const descriptor = session.files[index];
      const source = files[index];
      await store.acceptUploadFile(session.id, descriptor.id, fs.createReadStream(source.source));
      completed += 1;
      if (completed % 100 === 0 || completed === files.length) {
        process.stdout.write(`Provisioned ${completed}/${files.length} files\n`);
      }
    }
  });
  await Promise.all(workers);
}

(async () => {
  const dataManifest = JSON.parse(await fsp.readFile(path.join(siteRoot, 'wasm-game-data.json'), 'utf8'));
  const store = createMediaLibraryStore({ dataRoot, validatorRoot: siteRoot, manifest: dataManifest.mediaLibrary });
  const existing = await store.status();
  if (existing.ready) {
    process.stdout.write(`OpenRCT2 media is already provisioned (${existing.entries[0].fileCount} files).\n`);
    return;
  }
  const files = await inventory();
  const session = await store.beginUpload({
    label: 'RollerCoaster Tycoon 2',
    files: files.map(file => ({ name: file.name, size: file.size }))
  });
  try {
    await uploadFiles(store, session, files);
    const entry = await store.commitUpload(session.id);
    process.stdout.write(`Provisioned ${entry.fileCount} files (${entry.totalSize} bytes) as ${entry.id}.\n`);
  } catch (error) {
    await store.abortUpload(session.id).catch(() => undefined);
    throw error;
  }
})().catch(error => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
