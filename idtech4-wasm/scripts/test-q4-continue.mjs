#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkout = path.join(process.env.IDTECH4_WORK_ROOT || path.join(root, '.work'), 'openq4');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'q4-continue-'));
try {
  const source = fs.readFileSync(path.join(checkout, 'src/framework/Session.cpp'), 'utf8');
  const functions = ['FinishBrowserLoadingContinue', 'HandleBrowserLoadingContinueEvent', 'BrowserLoadingContinueFrame'];
  let production = functions.map(name => {
    const match = source.match(new RegExp(`^(?:void|bool) idSessionLocal::${name}\\([^]*?^}`, 'm'));
    assert.ok(match, `missing production ${name}`);
    return match[0];
  }).join('\n');
  const commonSource = process.env.Q4_CONTINUE_CLOCK_BASELINE === '1'
    ? execFileSync('git', ['show', 'HEAD:src/framework/Common.cpp'], { cwd: checkout, encoding: 'utf8' })
    : fs.readFileSync(path.join(checkout, 'src/framework/Common.cpp'), 'utf8');
  for (const [body, name] of [[commonSource, 'openQ4_BeginPresentationFrame'], [source, 'Session_BeginBlockingLoadPresentationFrame']]) {
    const match = body.match(new RegExp(`^(?:static )?void ${name}\\([^]*?^}`, 'm'));
    assert.ok(match, `missing production ${name}`);
    production += '\n' + match[0];
  }
  fs.writeFileSync(path.join(temporary, 'q4-continue-production.h'), production);
  assert.match(source, /if \( HandleBrowserLoadingContinueEvent\( event \) \) return true;/);
  assert.match(source, /if \( BrowserLoadingContinueFrame\(\) \) return;/);
  assert.match(source, /if \( browserLoadingContinue \) targetSoundWorld = NULL;/);
  assert.match(source, /if \( insideExecuteMapChange\s+#if defined\( __EMSCRIPTEN__ \)\s+\|\| browserLoadingContinue/);
  const output = path.join(temporary, 'continue.cjs');
  const compile = spawnSync(process.env.EMXX || 'em++', [
    '-std=c++17', '-O1', '-sENVIRONMENT=node', '-sEXIT_RUNTIME=1', '-I', temporary,
    path.join(root, 'tests/q4-continue.cpp'), '-o', output
  ], { encoding: 'utf8' });
  assert.equal(compile.status, 0, compile.stdout + compile.stderr);
  const test = spawnSync(process.execPath, [output], { encoding: 'utf8', timeout: 10000 });
  assert.equal(test.status, 0, test.stdout + test.stderr);
  console.log('Quake 4 production presentation clock hooks and Continue methods: initialization gate, blocking presentation, bounded frames, stale-input rejection, input/timeout completion, sound/input cleanup and one-shot transition passed (fixture engine/GPU)');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
