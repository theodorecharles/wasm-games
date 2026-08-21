#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..', '.work/source'));
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const server = read('src/PC/server_mp/sv_main_mp.c');
const client = read('src/PC/server_mp/sv_client_mp.c');
const script = read('src/PC/game_mp/g_client_script_cmd_mp.c');
const header = read('src/headers/PC/server_mp/sv_funcs.h');

assert.match(server, /#define COD2_BOT_MAX_CLIENTS 64/);
assert.match(server, /s_botCmdState\[COD2_BOT_MAX_CLIENTS\]/);
assert.match(server, /cmd\.serverTime = svs\.time;/);
assert.match(server, /cmd\.forwardmove = state->forwardmove;/);
assert.match(server, /cmd\.rightmove = state->rightmove;/);
assert.match(server, /cmd\.weapon = state->hasWeapon \? state->weapon : \(byte\)ps->weapon;/);
assert.match(server, /cmd\.offHandIndex = \(byte\)ps->offHandIndex;/);
assert.match(server, /SV_ClientThink\(cl, &cmd\);/);
assert.doesNotMatch(server, /\brandomf\s*\(|\bcrandom\s*\(/);

const tableStart = server.indexOf('static const cod2BotActionDef_t s_botActions[]');
const tableEnd = server.indexOf('\n};', tableStart);
assert.notEqual(tableStart, -1);
assert.notEqual(tableEnd, -1);
const actions = {};
for (const match of server.slice(tableStart, tableEnd).matchAll(/\{\s*"([^"]+)",\s*(0x[0-9a-f]+)\s*\}/gi)) {
  actions[match[1]] = Number.parseInt(match[2], 16);
}
assert.deepEqual(actions, {
  fire: 0x00001,
  melee: 0x00004,
  activate: 0x00008,
  reload: 0x00010,
  usereload: 0x00020,
  leanleft: 0x00040,
  leanright: 0x00080,
  goprone: 0x00100,
  gocrouch: 0x00200,
  gostand: 0x00400,
  jump: 0x00400,
  ads: 0x01000,
  binoculars: 0x04000,
  holdbreath: 0x08000,
  frag: 0x10000,
  smoke: 0x20000
});

for (const api of [
  'SV_BotIsTestClient', 'SV_BotResetClient', 'SV_BotStop',
  'SV_BotSetMovement', 'SV_BotSetAngles', 'SV_BotSetWeapon', 'SV_BotSetAction'
]) {
  assert.match(server, new RegExp(`\\b${api}\\s*\\(`));
  assert.match(header, new RegExp(`\\b${api}\\s*\\(`));
}

assert.match(client, /cl->bIsTestClient = 1;\s+SV_BotResetClient\(clientNum\);/);
assert.match(client, /SV_BotResetClient\(clientNum\);\s+SV_SetUserinfo\(clientNum, ""\);/);

for (const method of ['isbot', 'botstop', 'botmovement', 'botangles', 'botweapon', 'botaction']) {
  assert.match(script, new RegExp(`\\{ "${method}", \\(BuiltinMethod\\)`));
}
assert.match(script, /SetClientViewAngle\(pSelf, angles\);\s+Scr_AddBool\(SV_BotSetAngles/);
assert.match(script, /PlayerCmd_HasWeapon\(&pSelf->client->ps, weaponIndex\)/);

const tracked = childProcess.execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean);
assert.equal(tracked.filter(file => /\.(?:gsc|wp)$/i.test(file)).length, 0,
  'third-party bot scripts or waypoint graphs must not be tracked');

console.log('Call of Duty 2 clean-room bot foundation contract passed');
