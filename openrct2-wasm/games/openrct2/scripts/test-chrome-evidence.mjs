import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Validate recorded telemetry, not screenshots by inference or OCR. Park identity,
// placement and saved cash/guests/date are manually reviewed in the linked images.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../proofs');
async function record(name, state) {
  const value = JSON.parse(await fs.readFile(path.join(root, name + '-2026-09-05.json')));
  const data = value.observed.dataset;
  assert.equal(data.openrct2State, state, name);
  assert.equal(data.shellEngineState, state, name);
  assert.equal(data.shellDataReady, 'true', name);
  assert.equal(data.wasmGameVariant, 'openrct2', name);
  assert.ok(Number(data.openrct2DrawCount) > 0, name);
  assert.ok(Number(data.openrct2FramebufferVariation) > 0, name);
  assert.equal(data.openrct2CanvasWidth, data.openrct2ContextWidth, name);
  assert.equal(data.openrct2CanvasHeight, data.openrct2ContextHeight, name);
  const persistence = JSON.parse(data.openrct2Persistence);
  assert.equal(persistence.initialized, true, name);
  assert.equal(persistence.supported, true, name);
  assert.equal(persistence.lastError, null, name);
  return { name, at: Date.parse(value.observedAt), data, persistence };
}
await record('rct2-electric-fields-start', 'gameplay');
await record('rct2-electric-fields-pause', 'paused');
await record('rct2-candidate-started', 'gameplay');
for (const variant of ['live', 'candidate']) {
  const saved = await record(`rct2-${variant}-saved`, 'paused');
  const loaded = await record(`rct2-${variant}-reloaded`, 'paused');
  assert.ok(saved.at < loaded.at, `${variant}: record order`);
  assert.equal(saved.persistence.dirty, false, `${variant}: save not flushed`);
  assert.ok(Number(saved.data.openrct2KeyEvents) > 0, `${variant}: filename input missing`);
  assert.equal(loaded.data.openrct2KeyEvents, '0', `${variant}: expected fresh engine`);
  assert.ok(Number(loaded.data.openrct2DrawCount) < Number(saved.data.openrct2DrawCount), `${variant}: counters did not reset`);
  assert.equal(loaded.persistence.dirty, false, `${variant}: reload persistence dirty`);
}
const resumed = await record('rct2-candidate-resumed', 'gameplay');
const loaded = await record('rct2-candidate-reloaded', 'paused');
assert.ok(resumed.at > loaded.at);
assert.ok(Number(resumed.data.openrct2PointerEvents) > Number(loaded.data.openrct2PointerEvents));
const images = [];
for (const name of (await fs.readdir(root)).filter(name => name.endsWith('.jpg')).sort()) {
  const bytes = await fs.readFile(path.join(root, name));
  assert.ok(bytes.length > 10000, `${name}: missing screenshot content`);
  images.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
for (const name of ['rct2-scenario-selection', 'rct2-electric-fields-start',
  'rct2-electric-fields-built', 'rct2-live-reload-menu', 'rct2-live-reloaded-world',
  'rct2-candidate-built', 'rct2-candidate-save-name', 'rct2-candidate-reload-menu',
  'rct2-candidate-reloaded-world']) {
  assert.ok(images.some(image => image.name === name + '-2026-09-05.jpg'), name);
}
if (process.argv[2]) await fs.writeFile(process.argv[2], JSON.stringify({
  observedAt: new Date().toISOString(), telemetryChecks: 'passed',
  visualReview: 'manual; see RCT2-CHROME-2026-09-05.md; hashes are not a visual oracle', images
}, null, 2) + '\n');
console.log('OpenRCT2 recorded start/pause, input, flushed save, fresh-engine reload and resume telemetry checks passed. Screenshots require manual review.');
