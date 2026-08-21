#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'games.catalog.json'), 'utf8'));

for (const engine of catalog.engines) {
  const engineRoot = path.join(root, engine.id);
  if (!fs.existsSync(engineRoot)) throw new Error(`Missing engine directory: ${engine.id}`);

  const engineManifest = {
    schemaVersion: 1,
    id: engine.id,
    sourceStatus: engine.sourceStatus,
    games: engine.games.map((game) => game.id),
    dataRoot: catalog.dataRoot,
    sourcePolicy: catalog.sourcePolicy
  };
  fs.writeFileSync(path.join(engineRoot, 'engine.json'), `${JSON.stringify(engineManifest, null, 2)}\n`);

  for (const game of engine.games) {
    const gameRoot = path.join(engineRoot, 'games', game.id);
    const patchesRoot = path.join(gameRoot, 'patches');
    fs.mkdirSync(patchesRoot, { recursive: true });

    const gameManifestPath = path.join(gameRoot, 'game.json');
    if (!fs.existsSync(gameManifestPath)) {
      const gameManifest = {
        schemaVersion: 1,
        id: game.id,
        title: game.title,
        engine: engine.id,
        runtimeStatus: game.runtimeStatus,
        data: {
          hostRoot: catalog.dataRoot,
          relativePath: game.dataPath,
          containerPath: '/data'
        }
      };
      fs.writeFileSync(gameManifestPath, `${JSON.stringify(gameManifest, null, 2)}\n`);
    }

    const sourcesPath = path.join(gameRoot, 'sources.json');
    if (!fs.existsSync(sourcesPath)) {
      const sourceManifest = {
        schemaVersion: 1,
        policy: catalog.sourcePolicy,
        status: game.sources.length ? 'existing-repositories-require-pin-audit' : 'missing-canonical-fork',
        repositories: game.sources.map((repository) => ({ repository, commit: null }))
      };
      fs.writeFileSync(sourcesPath, `${JSON.stringify(sourceManifest, null, 2)}\n`);
    }

    const seriesPath = path.join(patchesRoot, 'series');
    if (!fs.existsSync(seriesPath)) fs.writeFileSync(seriesPath, '');
  }
}
