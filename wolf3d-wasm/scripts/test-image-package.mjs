#!/usr/bin/env node
// Verify image bytes, including the effective base-image shell, not just its
// staged duplicate. This is independent of HTTP/browser gameplay acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, '.work/dist');
const framework = process.env.WASM_FRAMEWORK_DIR || path.resolve(root, '../../wasm-game-framework');
const [image, variant] = process.argv.slice(2);
assert(image && ['wolf3d', 'spear'].includes(variant), 'usage: test-image-package.mjs IMAGE wolf3d|spear');
const run = args => execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const info = JSON.parse(run(['image', 'inspect', image]))[0];
assert(info.Config.Env.includes(`WASM_GAME_VARIANT=${variant}`));
assert.equal(info.Config.Labels['io.wasm-game-framework.version'], '0.9.6');
const inventory = Object.fromEntries(run(['run', '--rm', '--read-only', '--entrypoint', 'find', image,
  '/opt/game-site', '-type', 'f', '-exec', 'sha256sum', '{}', '+']).split('\n')
  .map(line => [line.slice(66).replace('/opt/game-site/', ''), line.slice(0, 64)]));
const files = fs.readdirSync(dist, { recursive: true }).filter(file => fs.statSync(path.join(dist, file)).isFile()).sort();
assert.deepEqual(Object.keys(inventory).sort(), files);
for (const file of files) {
  const bytes = fs.readFileSync(path.join(dist, file));
  assert.equal(inventory[file], hash(bytes), `stale site asset: ${file}`);
  if (file.endsWith('.wasm')) assert(WebAssembly.validate(bytes), `invalid native module: ${file}`);
  assert(!/\.(?:wl6|sod|data)$/i.test(file), `owner data in image: ${file}`);
}
const shellFiles = ['index.html', 'wasm-game-framework.js', 'wasm-game-framework.css', 'wasm-game-bootstrap.js'];
const installed = Object.fromEntries(run(['run', '--rm', '--read-only', '--entrypoint', 'sha256sum', image,
  ...shellFiles.map(file => `/opt/shared-shell/${file}`)]).split('\n')
  .map(line => [line.slice(66).replace('/opt/shared-shell/', ''), line.slice(0, 64)]));
for (const file of shellFiles) {
  const expected = hash(fs.readFileSync(path.join(framework, 'dist', file)));
  assert.equal(installed[file], expected, `stale effective shell: ${file}`);
  assert.equal(inventory[`shared-shell/${file}`], expected);
}
console.log(JSON.stringify({ image, id: info.Id, variant, siteFiles: files.length, files: inventory,
  effectiveShell: installed, nativeModulesValidated: 2, audited: true }, null, 2));
