#!/usr/bin/env node
// Exercise the real adapter handlers in the suite fixture, then restore only
// the old shortcut guard in a disposable copy to prove the regression fails.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.resolve(process.env.IDTECH4_ADAPTER_SOURCE || path.join(root, 'site/game-adapter.js'));
const source = fs.readFileSync(sourcePath, 'utf8');
const guard = 'if (!started || event.metaKey || ((event.ctrlKey || event.altKey) && !physicalModifier)) return;';
const oldGuard = 'if (!started || event.ctrlKey || event.metaKey || event.altKey) return;';
assert.equal(source.split(guard).length, 2, 'one exact repaired input guard is required');
const negativeSource = source.replace(guard, oldGuard);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const run = file => {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/test-adapter.mjs'), ...process.argv.slice(2)], {
    cwd: root, encoding: 'utf8', env: {...process.env, IDTECH4_ADAPTER_SOURCE: file}, timeout: 60000
  });
  assert.ifError(result.error);
  return {status: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr};
};
const temporary = fs.mkdtempSync(path.join(root, '.work/idtech4-modifier-negative-'));
try {
  const negativePath = path.join(temporary, 'game-adapter.js');
  fs.writeFileSync(negativePath, negativeSource);
  const positive = run(sourcePath);
  assert.equal(positive.status, 0, positive.stderr);
  const negative = run(negativePath);
  assert.equal(negative.status, 1);
  assert.match(negative.stderr, /doom3: ControlLeft modifier flags 1/);
  const proof = {
    scope: 'Actual browser-adapter event handlers executed with fixture DOM/worker APIs across all six suite variants; not native held-input or Chrome acceptance.',
    sourceSHA256: hash(source), fixtureSHA256: hash(fs.readFileSync(path.join(root, 'scripts/test-adapter.mjs'))),
    variants: ['doom3', 'doom3-mp', 'roe', 'quake4', 'quake4-mp', 'prey'],
    casesPerVariant: {physicalModifierFlagCombinations: 32, reservedShortcutCombinations: 35},
    modifierCases: 402, positive,
    negativeControl: {change: 'Restore only the original blanket modifier guard.', sourceSHA256: hash(negativeSource), ...negative},
    passed: true
  };
  if (process.env.IDTECH4_MODIFIER_PROOF) fs.writeFileSync(process.env.IDTECH4_MODIFIER_PROOF, JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify(proof, null, 2));
} finally {
  // Only the exact directory allocated by this invocation is removed.
  fs.rmSync(temporary, {recursive: true});
}
