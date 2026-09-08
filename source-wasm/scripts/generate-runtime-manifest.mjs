#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function runtimeManifest(input) {
  if (!input?.variants?.hl2 || input.preferencesNamespace !== 'source-wasm'
      || input.syncBackbuffer !== false || input.pointerWidth !== 1280 || input.pointerHeight !== 720) {
    throw new Error('Expected the reviewed Source HL2 manifest and canvas contract.');
  }
  const description = 'Playable preview. Some rendering and animation issues remain.';
  const pwa = {
    ...input.variants.hl2.pwa,
    id: '/', startUrl: '/', scope: '/', name: 'Half-Life 2', shortName: 'HL2', description
  };
  return {
    ...structuredClone(input),
    id: 'hl2', title: 'Half-Life 2', description,
    runtimeReady: true, runtimeStatus: 'engine', defaultVariant: 'hl2',
    identity: false, graphics: false, advanced: false, fps: false, dynamicQuality: false,
    pwa,
    variants: {
      hl2: { ...structuredClone(input.variants.hl2), title: 'Half-Life 2', description, pwa: structuredClone(pwa) }
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output || path.resolve(input) === path.resolve(output)) {
    throw new Error('Usage: generate-runtime-manifest.mjs REVIEWED_MANIFEST PRIVATE_OUTPUT');
  }
  const manifest = runtimeManifest(JSON.parse(fs.readFileSync(input, 'utf8')));
  fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
