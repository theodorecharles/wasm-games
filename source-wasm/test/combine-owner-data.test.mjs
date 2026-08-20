import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function cstring(value) {
  return Buffer.from(`${value}\0`, 'utf8');
}

function makeVpk(entries) {
  const treeParts = [];
  const dataParts = [];
  let dataOffset = 0;
  for (const group of entries) {
    treeParts.push(cstring(group.extension));
    treeParts.push(cstring(group.directory));
    for (const entry of group.files) {
      const payload = Buffer.from(entry.bytes);
      treeParts.push(cstring(entry.name));
      const meta = Buffer.alloc(18);
      meta.writeUInt32LE(0, 0); // CRC is not needed by the combine step.
      meta.writeUInt16LE(0, 4); // no preload bytes
      meta.writeUInt16LE(0x7fff, 6); // embedded archive
      meta.writeUInt32LE(dataOffset, 8);
      meta.writeUInt32LE(payload.length, 12);
      meta.writeUInt16LE(0xffff, 16);
      treeParts.push(meta);
      dataParts.push(payload);
      dataOffset += payload.length;
    }
    treeParts.push(Buffer.from([0])); // end names
    treeParts.push(Buffer.from([0])); // end directories
  }
  treeParts.push(Buffer.from([0])); // end extensions
  const tree = Buffer.concat(treeParts);
  const header = Buffer.alloc(28);
  header.writeUInt32LE(0x55aa1234, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(tree.length, 8);
  return Buffer.concat([header, tree, ...dataParts]);
}

const tempRoot = await mkdtemp('/tmp/source-wasm-combine-');
const gotyRoot = path.join(tempRoot, 'goty');
const steamRoot = path.join(tempRoot, 'steam');
const destRoot = path.join(tempRoot, 'combined');
const badSteamRoot = path.join(tempRoot, 'steam-bad');
const badDestRoot = path.join(tempRoot, 'combined-bad');
const script = path.join(root, 'scripts', 'combine-owner-data.mjs');

try {
  await mkdir(path.join(gotyRoot, 'hl2'), { recursive: true });
  await mkdir(path.join(steamRoot, 'hl2'), { recursive: true });
  await writeFile(path.join(gotyRoot, 'hl2', 'gameinfo.txt'), 'GameInfo\n');
  await writeFile(path.join(gotyRoot, 'hl2', 'glshaders.cfg'), 'stale cache');
  await writeFile(path.join(gotyRoot, 'hl2', 'old.dll'), 'blocked');
  await mkdir(destRoot, { recursive: true });
  await writeFile(path.join(destRoot, 'stale.txt'), 'must not survive');
  await writeFile(path.join(steamRoot, 'hl2', 'hl2_misc_dir.vpk'), makeVpk([
    {
      extension: 'vcs',
      directory: 'shaders/fxc',
      files: [{ name: 'vertexlit_and_unlit_generic_vs20', bytes: Buffer.from([6, 0, 0, 0]) }]
    },
    {
      extension: 'txt',
      directory: 'scripts',
      files: [{ name: 'must_not_overlay', bytes: Buffer.from('not part of the recipe') }]
    }
  ]));

  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    env: {
      ...process.env,
      HL2_GOTY_ROOT: gotyRoot,
      HL2_STEAM_ROOT: steamRoot,
      HL2_COMBINED_ROOT: destRoot
    },
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const published = await readdir(destRoot, { withFileTypes: true });
  assert.ok(published.some(entry => entry.name === 'gameinfo.txt') || published.some(entry => entry.name === 'hl2'));
  assert.equal((await readFile(path.join(destRoot, 'hl2', 'shaders', 'fxc', 'vertexlit_and_unlit_generic_vs20.vcs')))[0], 6);
  await assert.rejects(() => readFile(path.join(destRoot, 'hl2', 'glshaders.cfg')));
  await assert.rejects(() => readFile(path.join(destRoot, 'hl2', 'old.dll')));
  await assert.rejects(() => readFile(path.join(destRoot, 'hl2', 'scripts', 'must_not_overlay.txt')));
  assert.equal((await readFile(path.join(destRoot, 'stale.txt')).catch(() => null)), null);
  const siblings = await readdir(tempRoot);
  const previous = siblings.find(name => name.startsWith('combined.previous-'));
  assert.ok(previous, 'existing destination must be retained as a recoverable previous tree');
  assert.equal((await readFile(path.join(tempRoot, previous, 'stale.txt'))).toString(), 'must not survive');

  await mkdir(path.join(badSteamRoot, 'hl2'), { recursive: true });
  await writeFile(path.join(badSteamRoot, 'hl2', 'hl2_misc_dir.vpk'), makeVpk([{
    extension: 'vcs',
    directory: 'shaders/fxc',
    files: [{ name: 'vertexlit_and_unlit_generic_vs20', bytes: Buffer.from([5, 0, 0, 0]) }]
  }]));
  const bad = spawnSync(process.execPath, [script], {
    cwd: root,
    env: {
      ...process.env,
      HL2_GOTY_ROOT: gotyRoot,
      HL2_STEAM_ROOT: badSteamRoot,
      HL2_COMBINED_ROOT: badDestRoot
    },
    encoding: 'utf8'
  });
  assert.notEqual(bad.status, 0);
  assert.match(`${bad.stdout}\n${bad.stderr}`, /version 5/);
  console.log('owner combine: fresh publication, shader-only overlay, blocked files, and exact shader-v6 validation passed');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
