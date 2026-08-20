'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dedicated = require('../server/dedicated');
const host = require('../server/index');
const {
  createLifecycle,
  parseBoolean,
  parseIdleTimeout
} = require('../server/lifecycle');

describe('idle dedicated-server lifecycle', () => {
  it('defaults false booleans and accepts readable idle durations', () => {
    assert.equal(parseBoolean(undefined, false, 'KEEP_ALIVE'), false);
    assert.equal(parseBoolean('true', false, 'KEEP_ALIVE'), true);
    assert.equal(parseBoolean('0', true, 'KEEP_ALIVE'), false);
    assert.throws(() => parseBoolean('sometimes', false, 'KEEP_ALIVE'), /KEEP_ALIVE/);
    assert.equal(parseIdleTimeout(undefined), 900);
    assert.equal(parseIdleTimeout('45'), 45);
    assert.equal(parseIdleTimeout('15m'), 900);
    assert.equal(parseIdleTimeout('2h'), 7200);
    assert.throws(() => parseIdleTimeout('5s'), /between 10 seconds/);
  });

  it('sleeps after the configured human-free interval and wakes again', async () => {
    let clock = 0;
    let running = false;
    let starts = 0;
    let stops = 0;
    const lifecycle = createLifecycle({
      keepAlive: false,
      idleTimeoutMs: 10000,
      now: () => clock,
      isRunning: () => running,
      start: async () => {
        starts += 1;
        running = true;
        return { map: starts === 1 ? 'oasis' : 'radar' };
      },
      stop: async () => {
        stops += 1;
        running = false;
      }
    });

    assert.equal(lifecycle.status().state, 'sleeping');
    assert.equal((await lifecycle.wake('test')).map, 'oasis');
    lifecycle.observeHumans(1);
    clock = 12000;
    assert.equal(await lifecycle.checkIdle(), false);
    lifecycle.observeHumans(0);
    clock = 21999;
    assert.equal(await lifecycle.checkIdle(), false);
    clock = 22000;
    assert.equal(await lifecycle.checkIdle(), true);
    assert.equal(lifecycle.status().state, 'sleeping');
    assert.equal(stops, 1);
    assert.equal((await lifecycle.wake('second test')).map, 'radar');
    assert.equal(starts, 2);
  });

  it('never idles a keep-alive server', async () => {
    let clock = 0;
    let running = false;
    let stops = 0;
    const lifecycle = createLifecycle({
      keepAlive: true,
      idleTimeoutMs: 10000,
      now: () => clock,
      isRunning: () => running,
      start: async () => { running = true; return { map: 'battery' }; },
      stop: async () => { running = false; stops += 1; }
    });
    await lifecycle.wake();
    clock = 100000;
    assert.equal(await lifecycle.checkIdle(), false);
    assert.equal(stops, 0);
    assert.equal(lifecycle.status().state, 'running');
  });
});

describe('random rotation starts', () => {
  it('does not immediately repeat the persisted previous map', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wolfet-wasm-map-'));
    const stateFile = path.join(temp, 'last-map');
    try {
      const first = dedicated.chooseStartMap({
        maps: ['oasis', 'battery', 'radar'],
        stateFile: stateFile,
        randomInt: () => 1
      });
      assert.equal(first, 'battery');
      const second = dedicated.chooseStartMap({
        maps: ['oasis', 'battery', 'radar'],
        stateFile: stateFile,
        randomInt: () => 1
      });
      assert.equal(second, 'radar');
      assert.equal(fs.readFileSync(stateFile, 'utf8'), 'radar\n');
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

  it('starts the selected rotation command before post-map rule enforcement', () => {
    const args = dedicated.launchArgs('goldrush');
    const execIndex = args.indexOf('+exec');
    const vstrIndex = args.indexOf('+vstr');
    const postModeIndex = args.lastIndexOf('g_etjsArcade');
    assert.equal(args[execIndex + 1], 'objectiverotate.cfg');
    assert.equal(args[vstrIndex + 1], 'd3');
    assert.ok(execIndex < vstrIndex);
    assert.ok(vstrIndex < postModeIndex);
  });
});

describe('map startup fallback', () => {
  it('rejects a broken custom map and starts the next available map', async () => {
    const events = [];
    const rejected = [];
    const result = await host.startDedicatedWithFallback({
      maps: ['broken_custom', 'oasis'],
      choose: async (maps) => maps[0],
      start: async (map) => {
        events.push('start:' + map);
        if (map === 'broken_custom') {
          throw new Error('map script parse failed');
        }
        return { map: map, gametype: 2, players: [] };
      },
      stop: async () => { events.push('stop'); },
      reject: async (map) => { rejected.push(map); }
    });

    assert.equal(result.map, 'oasis');
    assert.equal(result.status.map, 'oasis');
    assert.deepEqual(events, ['start:broken_custom', 'stop', 'start:oasis']);
    assert.deepEqual(rejected, ['broken_custom']);
  });
});
