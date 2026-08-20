#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(repo, 'web');
await rm(path.join(web, 'artifacts'), { recursive: true, force: true });
await rm(path.join(web, 'game-adapter.js'), { force: true });
await mkdir(web, { recursive: true });

const result = await build({
  entryPoints: [path.join(repo, 'src/framework-adapter.js')],
  outfile: path.join(web, 'game-adapter.js'),
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  minify: true,
  sourcemap: false,
  loader: { '.wasm': 'file', '.pk3': 'file' },
  assetNames: 'artifacts/[name]-[hash]',
  metafile: true,
  legalComments: 'none',
  plugins: [{
    name: 'framework-xash-glue',
    setup(bundle) {
      bundle.onResolve({ filter: /^\.\/generated\/xash$/ }, args => {
        if (!args.importer.endsWith('/node_modules/xash3d-fwgs/dist/xash3d.js')) return null;
        return { path: path.join(repo, 'native/xash-framework.js') };
      });
    }
  }]
});

const outputs = Object.keys(result.metafile.outputs);
assert.ok(outputs.some(file => file.endsWith('game-adapter.js')));
assert.ok(outputs.filter(file => file.endsWith('.wasm')).length >= 9, 'expected core, renderer, menu, and game WASM artifacts');
assert.ok(outputs.some(file => file.endsWith('.pk3')), 'expected Xash support data');
console.log(`Built canonical GoldSource adapter with ${outputs.length - 1} immutable artifacts.`);
