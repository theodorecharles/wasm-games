'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { parseStatusResponse, classifyPlayer } = require('../server/status');
const { rosterFromStatus, GAMEPLAY_CVARS } = require('../server/supervisor');

const ROOT = path.join(__dirname, '..');

describe('status parser classifies Omni-Bot vs humans', () => {
  it('treats [BOT] names as bots even at ping 0', () => {
    const raw = Buffer.concat([
      Buffer.from([0xff, 0xff, 0xff, 0xff]),
      Buffer.from(
        'statusResponse\n' +
        '\\mapname\\oasis\\g_gametype\\2\\sv_hostname\\wolfet-wasm Shared Match\\sv_maxclients\\12\n' +
        '0 0 "^o[BOT]^7Nundak"\n' +
        '0 12 "TankRed"\n'
      )
    ]);
    const st = parseStatusResponse(raw);
    assert.equal(st.map, 'oasis');
    assert.equal(st.gametype, '2');
    assert.equal(st.players.length, 2);
    assert.equal(classifyPlayer(st.players[0]), 'bot');
    assert.equal(classifyPlayer(st.players[1]), 'human');
    const roster = rosterFromStatus(st, ['TankRed']);
    assert.equal(roster.humans, 1);
    assert.equal(roster.bots, 1);
  });
});

describe('runtime reconciliation', () => {
  it('reasserts the selected gameplay mode without the unsupported minplayers command', () => {
    const supervisor = fs.readFileSync(path.join(ROOT, 'server', 'supervisor.js'), 'utf8');
    const commands = GAMEPLAY_CVARS.join('\n');
    assert.match(commands, /g_speed 400/);
    assert.match(commands, /g_etjsArcade 1/);
    assert.match(commands, /g_friendlyFire 0/);
    assert.match(commands, /g_forcerespawn 1/);
    assert.match(commands, /bot balanceteams 0/);
    assert.doesNotMatch(supervisor, /bot minplayers/);
    assert.match(supervisor, /stopped \|\| running/);
  });
});

describe('shipped game data is official ET', () => {
  it('has official paks on the runtime search path', () => {
    const etmain = path.join(ROOT, 'runtime', 'etmain');
    ['pak0.pk3', 'pak1.pk3', 'pak2.pk3'].forEach((name) => {
      const p = path.join(etmain, name);
      assert.ok(fs.existsSync(p), p);
      assert.ok(fs.statSync(p).size > 1000, name + ' too small');
    });
  });

  it('pak0 contains oasis.bsp and oasis.objdata', () => {
    const listing = execFileSync('unzip', ['-l', path.join(ROOT, 'runtime', 'etmain', 'pak0.pk3')], {
      encoding: 'utf8'
    });
    assert.match(listing, /maps\/oasis\.bsp/);
    assert.match(listing, /maps\/oasis\.objdata/);
    assert.match(listing, /maps\/oasis\.script/);
  });

  it('oasis.objdata describes Allied and Axis objectives', () => {
    const text = execFileSync('unzip', ['-p', path.join(ROOT, 'runtime', 'etmain', 'pak0.pk3'), 'maps/oasis.objdata'], {
      encoding: 'utf8'
    });
    assert.match(text, /wm_mapdescription axis/i);
    assert.match(text, /wm_mapdescription allied/i);
    assert.match(text, /75mm/);
  });

  it('five classes and two teams exist in the shipped game headers', () => {
    const hdr = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'game', 'bg_public.h'), 'utf8');
    assert.match(hdr, /#define PC_SOLDIER/);
    assert.match(hdr, /#define PC_MEDIC/);
    assert.match(hdr, /#define PC_ENGINEER/);
    assert.match(hdr, /#define PC_FIELDOPS/);
    assert.match(hdr, /#define PC_COVERTOPS/);
    assert.match(hdr, /#define NUM_PLAYER_CLASSES\s+5/);
    assert.match(hdr, /TEAM_AXIS/);
    assert.match(hdr, /TEAM_ALLIES/);
  });
});
