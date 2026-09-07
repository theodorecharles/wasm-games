'use strict';
const {StringDecoder} = require('node:string_decoder');

// Read only native stdout, never merge stderr into an incomplete JSON line.
// A complete frame describes real player entities with live bot brains.
function createSabotRoster({now = Date.now, maxAgeMs = 15000, maxLineBytes = 4096, requirePopulation = false} = {}) {
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0 || !Number.isInteger(maxLineBytes) || maxLineBytes < 256) {
    throw new Error('Invalid SABot telemetry bounds.');
  }
  const decoder = new StringDecoder('utf8');
  let line = '';
  let dropping = false;
  let pending = null;
  let players = [];
  let updatedAt = null;
  let population = null;
  const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  const signed = value => integer(value, -2147483648, 2147483647);
  const vector = (value, valid) => Array.isArray(value) && value.length === 3 && value.every(valid);
  function invalidate() { pending = null; players = []; updatedAt = null; population = null; }
  function acceptLine(text) {
    const kind = text.startsWith('SABOT_FRAME ') ? 'frame' : text.startsWith('SABOT_SAMPLE ') ? 'sample' : null;
    if (!kind) return;
    let value;
    try { value = JSON.parse(text.slice(kind === 'frame' ? 12 : 13)); }
    catch (_) { invalidate(); return; }
    if (!value || typeof value !== 'object' || !integer(value.time, 0, 2147483647)) { invalidate(); return; }
    if (kind === 'frame') {
      if (!integer(value.bots, 0, 31)) { invalidate(); return; }
      let reported = null;
      if (requirePopulation || value.humans !== undefined || value.target !== undefined) {
        if (!integer(value.humans, 0, 32) || !integer(value.target, -1, 31) || value.humans + value.bots > 32) { invalidate(); return; }
        reported = {humans: value.humans, target: value.target};
      }
      pending = {time: value.time, count: value.bots, rows: [], population: reported};
      if (value.bots === 0) { players = []; updatedAt = now(); population = reported; pending = null; }
      return;
    }
    if (!pending || value.time !== pending.time || !integer(value.slot, 1, 31) ||
        pending.rows.some(row => row.slot === value.slot) || !signed(value.health) ||
        !integer(value.spectating, 0, 1) || !integer(value.buttons, 0, 255) ||
        !vector(value.origin, n => Number.isFinite(n) && Math.abs(n) <= 1e9) ||
        !vector(value.move, n => integer(n, -128, 127)) ||
        !integer(value.weapon, -1, 63) || !signed(value.frags)) { invalidate(); return; }
    // Project known fields; never forward arbitrary properties from output.
    const {time, slot, health, spectating, origin, buttons, move, weapon, frags} = value;
    pending.rows.push({time, slot, health, spectating, origin, buttons, move, weapon, frags});
    if (pending.rows.length === pending.count) {
      players = pending.rows;
      population = pending.population;
      updatedAt = now();
      pending = null;
    }
  }
  return Object.freeze({
    push(chunk) {
      const text = decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      let start = 0;
      while (start < text.length) {
        const end = text.indexOf('\n', start);
        const part = text.slice(start, end < 0 ? text.length : end);
        if (!dropping) {
          if (Buffer.byteLength(line) + Buffer.byteLength(part) > maxLineBytes) {
            invalidate(); line = ''; dropping = true;
          } else line += part;
        }
        if (end < 0) break;
        if (!dropping) acceptLine(line.replace(/\r$/, ''));
        line = ''; dropping = false; start = end + 1;
      }
    },
    snapshot() {
      const age = updatedAt === null ? Infinity : now() - updatedAt;
      const fresh = age >= 0 && age < maxAgeMs;
      return {fresh, updatedAt, players: fresh ? players.map(row => ({...row, origin: [...row.origin], move: [...row.move]})) : [],
        ...(fresh && population ? population : {})};
    }
  });
}
module.exports = {createSabotRoster};
