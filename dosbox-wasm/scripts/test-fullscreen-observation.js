'use strict';
// Audit the observed browser refusal, not fullscreen success or its browser policy cause.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const proof = path.resolve(__dirname, '../proofs/fullscreen-browser-rejection-2026-09-06.json');
const { rows } = JSON.parse(fs.readFileSync(proof, 'utf8'));
const requests = rows.filter(row => row.type === 'request');
assert.equal(requests.length, 3);
for (const request of requests) {
  assert.equal(request.enabled, true);
  assert.equal(request.active, true, 'a real activation was present before requestFullscreen');
  assert.equal(request.focused, true);
  assert.equal(request.visibility, 'visible');
  const gesture = rows.find(row => row.sequence === request.sequence - 1);
  assert.equal(gesture.type, 'click');
  assert.equal(gesture.trusted, true);
  assert.equal(gesture.target, 'enter');
  const next = rows.find(row => row.sequence > request.sequence && row.type.startsWith('request-'));
  assert.equal(next.type, 'request-rejected');
  assert.equal(next.name, 'TypeError');
  assert.equal(next.message, 'not granted');
}
assert.equal(rows.filter(row => row.type === 'fullscreenerror').length, 3);
assert.ok(rows.some(row => row.type === 'keydown' && row.code === 'Enter' && row.trusted));
assert.ok(rows.some(row => row.type === 'pointerdown' && row.trusted));
assert.ok(rows.every(row => row.fullscreen === null));
assert.ok(!rows.some(row => row.type === 'fullscreenchange' || row.type === 'request-resolved'));
console.log('Three trusted, activated, engine-free fullscreen requests were rejected by Chrome: TypeError: not granted.');
