'use strict';

const { afterEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dedicated = require('../server/dedicated');

const temporaryRoots = [];

function makePk3(root, name, entries) {
  const staging = path.join(root, 'staging-' + name);
  fs.mkdirSync(staging, { recursive: true });
  Object.entries(entries).forEach(([entry, contents]) => {
    const output = path.join(staging, entry);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, contents);
  });
  const output = path.join(root, name);
  execFileSync('zip', ['-q', '-r', output, '.'], { cwd: staging });
  return output;
}

afterEach(() => {
  while (temporaryRoots.length) {
    fs.rmSync(temporaryRoots.pop(), { recursive: true, force: true });
  }
});

describe('custom map provisioning', () => {
  it('mounts every PK3 and appends discovered BSPs to Objective rotation', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wolfet-custom-maps-'));
    temporaryRoots.push(root);
    const customMapsDir = path.join(root, 'custom_maps');
    const etmainDir = path.join(root, 'runtime', 'etmain');
    fs.mkdirSync(customMapsDir, { recursive: true });
    makePk3(customMapsDir, 'alpha.pk3', {
      'maps/alpha.bsp': 'test bsp',
      'maps/alpha.script': 'test script'
    });
    makePk3(customMapsDir, 'alpha-assets.pk3', {
      'textures/alpha/readme.txt': 'support data'
    });

    const result = dedicated.prepareCustomMaps({ customMapsDir: customMapsDir, etmainDir: etmainDir });
    assert.equal(result.assets.length, 2);
    assert.deepEqual(result.maps.slice(0, 6), dedicated.BASE_OBJECTIVE_MAPS);
    assert.equal(result.maps.at(-1), 'alpha');
    assert.ok(fs.lstatSync(path.join(etmainDir, 'alpha.pk3')).isSymbolicLink());
    assert.ok(fs.lstatSync(path.join(etmainDir, 'alpha-assets.pk3')).isSymbolicLink());
    const rotation = fs.readFileSync(result.rotationFile, 'utf8');
    assert.match(rotation, /map oasis/);
    assert.match(rotation, /map alpha/);
    result.assets.forEach((asset) => {
      assert.match(asset.hash, /^[a-f0-9]{64}$/);
      assert.ok(asset.bytes > 0);
    });
  });

  it('removes stale managed links and rejects official pak collisions', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wolfet-custom-maps-'));
    temporaryRoots.push(root);
    const customMapsDir = path.join(root, 'custom_maps');
    const etmainDir = path.join(root, 'runtime', 'etmain');
    fs.mkdirSync(customMapsDir, { recursive: true });
    makePk3(customMapsDir, 'gone.pk3', { 'maps/gone.bsp': 'gone' });
    dedicated.prepareCustomMaps({ customMapsDir: customMapsDir, etmainDir: etmainDir });
    fs.unlinkSync(path.join(customMapsDir, 'gone.pk3'));
    dedicated.prepareCustomMaps({ customMapsDir: customMapsDir, etmainDir: etmainDir });
    assert.equal(fs.existsSync(path.join(etmainDir, 'gone.pk3')), false);

    makePk3(customMapsDir, 'pak0.pk3', { 'maps/nope.bsp': 'nope' });
    assert.throws(
      () => dedicated.prepareCustomMaps({ customMapsDir: customMapsDir, etmainDir: etmainDir }),
      /reserved filename/
    );
  });
});
