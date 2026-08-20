'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const namePath = path.join(__dirname, '..', 'web', 'js', 'player-name.js');
const ETJSName = require(namePath);

function memoryStorage() {
  const data = Object.create(null);
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; },
    _data: data
  };
}

describe('shipped player-name localStorage path', () => {
  it('exports the same module the website script defines', () => {
    const src = fs.readFileSync(namePath, 'utf8');
    assert.match(src, /window\.ETJSName/);
    assert.match(src, /localStorage/);
    assert.equal(ETJSName.STORAGE_KEY, 'etjs.playerName');
  });

  it('saves a name and loads it back from the same storage', () => {
    const storage = memoryStorage();
    const saved = ETJSName.savePlayerName('  TankRed  ', storage);
    assert.equal(saved, 'TankRed');
    assert.equal(storage.getItem('etjs.playerName'), 'TankRed');
    assert.equal(ETJSName.loadPlayerName(storage), 'TankRed');
  });

  it('reuses the stored name on a second load (return visit)', () => {
    const storage = memoryStorage();
    ETJSName.savePlayerName('AxisMedic', storage);
    const again = require(namePath);
    assert.equal(again.loadPlayerName(storage), 'AxisMedic');
  });

  it('turns the stored name into in-game +set name args', () => {
    const storage = memoryStorage();
    const name = ETJSName.savePlayerName('FieldOps_1', storage);
    assert.deepEqual(ETJSName.nameToGameArgs(name), ['+set', 'name', 'FieldOps_1']);
    assert.deepEqual(ETJSName.nameToGameArgs(ETJSName.loadPlayerName(storage)), ['+set', 'name', 'FieldOps_1']);
  });

  it('rejects an empty name and does not write storage', () => {
    const storage = memoryStorage();
    assert.throws(() => ETJSName.savePlayerName('   ', storage), /required/);
    assert.equal(storage.getItem('etjs.playerName'), null);
    assert.equal(ETJSName.loadPlayerName(storage), null);
  });
});
