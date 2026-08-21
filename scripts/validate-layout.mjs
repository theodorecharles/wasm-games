#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'games.catalog.json'), 'utf8'));
const prohibitedNames = /^(CODE_OF_CONDUCT|CONTRIBUTING)/i;
const ignoredGeneratedDirectories = new Set(['.work', 'build', 'dist', 'node_modules']);

for (const engine of catalog.engines) {
  const engineRoot = path.join(root, engine.id);
  const engineManifest = JSON.parse(fs.readFileSync(path.join(engineRoot, 'engine.json'), 'utf8'));
  assert.deepEqual(engineManifest.games, engine.games.map((game) => game.id));

  for (const game of engine.games) {
    const gameRoot = path.join(engineRoot, 'games', game.id);
    for (const relative of ['game.json', 'sources.json', 'patches/series']) {
      assert.ok(fs.existsSync(path.join(gameRoot, relative)), `${engine.id}/${game.id} is missing ${relative}`);
    }

    const gameManifest = JSON.parse(fs.readFileSync(path.join(gameRoot, 'game.json'), 'utf8'));
    const manifestDataPath = gameManifest.data?.relativePath || gameManifest.dataDir;
    if (typeof manifestDataPath === 'string') {
      assert.equal(
        manifestDataPath,
        game.dataPath,
        `${engine.id}/${game.id} data path differs from games.catalog.json`
      );
    }

    const sourceManifestPath = path.join(gameRoot, 'sources.json');
    const sourceManifest = JSON.parse(fs.readFileSync(sourceManifestPath, 'utf8'));
    for (const repository of sourceManifest.repositories || []) {
      assert.match(
        repository.repository || '',
        /^https:\/\/github\.com\/theodorecharles\/[A-Za-z0-9_.-]+\.git$/,
        `${engine.id}/${game.id} build source is not a Ted-owned GitHub repository`
      );
      assert.match(
        repository.commit || '',
        /^[0-9a-f]{40}$/,
        `${engine.id}/${game.id} build source is not pinned to a full commit`
      );
      for (const patchName of repository.patches || []) {
        assert.ok(
          fs.existsSync(path.resolve(gameRoot, patchName)),
          `${engine.id}/${game.id} references missing source patch ${patchName}`
        );
      }
    }

    const seriesPath = path.join(gameRoot, 'patches/series');
    for (const patchName of fs.readFileSync(seriesPath, 'utf8').split(/\r?\n/)) {
      if (!patchName || patchName.startsWith('#')) continue;
      assert.ok(
        fs.existsSync(path.join(gameRoot, 'patches', patchName)),
        `${engine.id}/${game.id} series references missing patch ${patchName}`
      );
    }
  }
}

const queue = [root];
while (queue.length) {
  const current = queue.pop();
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const target = path.join(current, entry.name);
    if (entry.isDirectory() && !ignoredGeneratedDirectories.has(entry.name)) queue.push(target);
    else {
      assert.ok(!prohibitedNames.test(entry.name), `Prohibited repository document: ${path.relative(root, target)}`);
      if (entry.name === 'wasm-game.json') {
        const manifest = JSON.parse(fs.readFileSync(target, 'utf8'));
        if (typeof manifest.adapter === 'string' && manifest.adapter.startsWith('/')) {
          const adapterPath = path.join(current, manifest.adapter.slice(1).split(/[?#]/, 1)[0]);
          assert.ok(
            fs.existsSync(adapterPath) && fs.statSync(adapterPath).isFile(),
            `${path.relative(root, target)} references missing ${manifest.adapter}`
          );
        }
      }
    }
  }
}

for (const prohibited of ['wasm-game-framework', 'wasm-game-lab', 'jill-wasm']) {
  assert.ok(!fs.existsSync(path.join(root, prohibited)), `Prohibited embedded project: ${prohibited}`);
}

console.log(`Validated ${catalog.engines.length} engines and ${catalog.engines.reduce((sum, engine) => sum + engine.games.length, 0)} games.`);
