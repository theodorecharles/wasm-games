#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkout = path.join(process.env.IDTECH4_WORK_ROOT || path.join(root, '.work'), 'openq4');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'q4-audio-'));
try {
  const output = path.join(temporary, 'audio.cjs');
  const result = spawnSync(process.env.EMXX || 'em++', [
    '-std=c++17', '-O1', '-sASSERTIONS=1', '-sMODULARIZE=1', '-sENVIRONMENT=node', '-sMAIN_MODULE=1',
    '-sEXPORTED_FUNCTIONS=_Q4AudioProbe', '-I', path.join(checkout, 'subprojects/openal-soft-prebuilt/include'),
    path.join(checkout, 'src/sys/emscripten/openal_emscripten.cpp'),
    path.join(root, 'tests/q4-audio.cpp'), '--no-entry', '-o', output
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const messages = [];
  globalThis.postMessage = message => messages.push(message);
  const module = await createRequire(import.meta.url)(output)();
  assert.equal(module._Q4AudioProbe(), 1);
  assert.equal(messages.filter(message => message.type === 'audio-init').length, 1);
  const buffers = messages.filter(message => message.type === 'audio-buffer');
  assert.equal(buffers.length, 2);
  assert.deepEqual(Array.from(new Int16Array(buffers[0].data)), [0, 8192, -8192, 0]);
  for (const type of ['audio-create-source', 'audio-source-int', 'audio-source-float',
    'audio-source-position', 'audio-source-queue', 'audio-source-unqueue', 'audio-listener-float',
    'audio-delete-source', 'audio-delete-buffer']) assert.ok(messages.some(message => message.type === type), type);
  assert.deepEqual(messages.filter(message => message.type === 'audio-source-action').map(message => message.action), [1, 2, 0, 1, 0]);
  console.log('Quake 4 native worker audio: terminated device enumeration, device/context, PCM delivery, source/queue state, pause/stop and cleanup passed');
} finally {
  delete globalThis.postMessage;
  fs.rmSync(temporary, { recursive: true, force: true });
}
