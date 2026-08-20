#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const selected = process.argv[2] || 'suite';
const output = path.resolve(process.argv[3] || path.join(repoDir, '.work', `site-${selected}`));
const allowedOutputRoots = [path.join(repoDir, '.work'), path.join(repoDir, 'web', 'dist')];
if (!allowedOutputRoots.some(root => output === root || output.startsWith(`${root}${path.sep}`))) {
  throw new Error('site output must stay under .work or web/dist');
}

const variants = ['nes', 'snes', 'ps1', 'ps2'];
if (selected !== 'suite' && !variants.includes(selected)) throw new Error(`unknown image variant: ${selected}`);
const included = selected === 'suite' ? variants : [selected];
for (const variant of included) {
  for (const file of ['emulator.js', 'emulator.wasm']) {
    const artifact = path.join(repoDir, 'build-web', variant, file);
    if (!fs.existsSync(artifact)) throw new Error(`${variant}: missing ${artifact}; placeholder images are forbidden`);
  }
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.cpSync(path.join(repoDir, 'web', 'assets'), path.join(output, 'assets'), { recursive: true });
for (const file of ['game-adapter.js', 'data-validator.mjs', 'wasm-game-data.json']) {
  fs.copyFileSync(path.join(repoDir, 'web', file), path.join(output, file));
}
fs.copyFileSync(path.join(repoDir, 'adapters', 'controller-profiles.mjs'), path.join(output, 'controller-profiles.mjs'));

const manifest = JSON.parse(fs.readFileSync(path.join(repoDir, 'web', 'wasm-game.json'), 'utf8'));
for (const [variant, config] of Object.entries(manifest.variants)) {
  config.runtimeReady = included.includes(variant);
}
fs.writeFileSync(path.join(output, 'wasm-game.json'), `${JSON.stringify(manifest, null, 2)}\n`);

for (const variant of included) {
  const destination = path.join(output, variant);
  fs.mkdirSync(destination, { recursive: true });
  for (const file of ['emulator.js', 'emulator.wasm']) {
    fs.copyFileSync(path.join(repoDir, 'build-web', variant, file), path.join(destination, file));
  }
}

for (const forbidden of ['index.html', 'wasm-game-framework.css', 'service-worker.js', 'app.webmanifest']) {
  if (fs.existsSync(path.join(output, forbidden))) throw new Error(`framework-owned site file leaked downstream: ${forbidden}`);
}
console.log(`prepared ${selected} site at ${output}`);
