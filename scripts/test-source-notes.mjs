#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scripts = [
  'dosbox-wasm/scripts/fetch-source',
  'emulation-wasm/scripts/fetch-sources.sh',
  'openrct2-wasm/games/openrct2/scripts/fetch-source',
  'idtech2-wasm/scripts/fetch-source',
  'idtech1-wasm/scripts/fetch-dsda-source.sh',
  'idtech1-wasm/scripts/fetch-libtess2-source.sh',
  'idtech3-wasm/games/wolfet/scripts/setup-etlegacy.sh',
  'cod2-wasm/scripts/fetch-source',
  'wolf3d-wasm/scripts/fetch-source'
];
for (const script of scripts) {
  const source = fs.readFileSync(path.join(root, script), 'utf8');
  assert.doesNotMatch(source, /find[^\n]*\.md[^\n]*-delete/, script);
  assert.doesNotMatch(source, /cleanup_upstream_markdown/, script);
  execFileSync(source.startsWith('#!/bin/sh') ? 'sh' : 'bash', ['-n', path.join(root, script)]);
}

// Exercise actual DOSBox source preparation in a disposable, local-only clone.
// The other eight scripts above receive static deletion/syntax checks, not
// complete source-preparation or engine-build coverage from this test.
const original = path.resolve(process.env.DOSBOX_SOURCE_CHECKOUT || path.join(root, 'dosbox-wasm/.work/source'));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'source-notes-'));
const checkout = path.join(temporary, 'checkout');
const commit = '8bde9c0d99858cd7bced3887885f6d4cd0a9efd3';
const repository = 'https://github.com/theodorecharles/dosbox-wasm.git';
const git = (...args) => execFileSync('git', ['-C', checkout, ...args], {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']});
try {
  execFileSync('git', ['clone', '--shared', '--no-checkout', original, checkout], {stdio: 'pipe'});
  git('checkout', '--detach', commit);
  git('remote', 'set-url', 'origin', repository);
  const notes = new Map([
    ['README.md', 'Locally edited upstream notes must survive preparation.\n'],
    ['local notes/REPRO.md', 'Owner reproduction steps: preserve exactly.\n'],
    ['local notes/NESTED/note.md', 'Nested untracked Markdown must survive.\n']
  ]);
  const originalRunbook = fs.readFileSync(path.join(checkout, 'RUNBOOK.md'));
  for (const [file, content] of notes) {
    fs.mkdirSync(path.dirname(path.join(checkout, file)), {recursive: true});
    fs.writeFileSync(path.join(checkout, file), content);
  }
  const env = {...process.env, DOSBOX_SOURCE_CHECKOUT: checkout};
  for (let pass = 0; pass < 2; pass++) {
    const result = execFileSync(path.join(root, scripts[0]), [], {env, encoding: 'utf8'});
    assert.equal(result.trim(), path.join(checkout, 'vendor/dosbox'));
    for (const [file, content] of notes) assert.equal(fs.readFileSync(path.join(checkout, file), 'utf8'), content, file);
    assert.deepEqual(fs.readFileSync(path.join(checkout, 'RUNBOOK.md')), originalRunbook);
  }
  // Negative control: reproduce the removed deletion only in this disposable
  // fixture, never in the user's source tree.
  execFileSync('find', [checkout, '-type', 'f', '-name', '*.md', '-delete']);
  assert.ok([...notes.keys()].every(file => !fs.existsSync(path.join(checkout, file))));
  const report = {
    scope: 'Nine source-preparation scripts: static deletion guard and shell syntax. Actual DOSBox first preparation and idempotent re-run preserve edited, untouched and nested/untracked Markdown. Removed deletion reproduced only in the disposable local clone. Not full execution of the other source preparers.',
    scripts, dosboxCommit: commit, passes: 2, preservedFixtureFiles: 4,
    oldDeletionDestroysNotes: true
  };
  if (process.env.SOURCE_NOTES_PROOF) fs.writeFileSync(process.env.SOURCE_NOTES_PROOF, JSON.stringify(report, null, 2) + '\n');
  console.log('Source notes preserved: 9 script guards, 2 actual DOSBox preparations, 4 note fixtures; old deletion fails.');
} finally {
  fs.rmSync(temporary, {recursive: true, force: true});
}
