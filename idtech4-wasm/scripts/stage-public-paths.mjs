import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { publicPathRuntime } from './public-path-runtime.mjs';

assert.ok(process.argv[2], 'Provide an explicitly staged site directory.');
const site = path.resolve(process.argv[2]);
const files = ['game-adapter.js', 'd3-managed-network.js', 'd3-worker.js', 'q4-worker.js', 'prey-worker.js'];
// Check every transformation before changing any generated file. Deliberately
// refuse a repeat/unknown tree rather than silently stacking transformations.
const outputs = files.map(name => [name, publicPathRuntime(name, fs.readFileSync(path.join(site, name), 'utf8'))]);
for (const [name, source] of outputs) fs.writeFileSync(path.join(site, name), source);
console.log(`Staged ${outputs.length} prefix-aware id Tech 4 launcher files; native payloads unchanged.`);
