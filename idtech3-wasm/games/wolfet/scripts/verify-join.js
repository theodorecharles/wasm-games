'use strict';

const fs = require('fs');
const path = require('path');
const { queryStatus } = require('../server/status');
const { connectClient } = require('../server/et-protocol-client');
const { fillPlan } = require('../server/botfill');

const outDir = process.argv[2] || '.';
const port = Number(process.env.ETJS_DED_PORT || 27961);

function write(name, data) {
  fs.writeFileSync(path.join(outDir, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}

(async () => {
  const empty = await queryStatus({ host: '127.0.0.1', port: port, timeoutMs: 3000 });
  write('status-empty.json', empty);
  const emptyTxt = [
    'map=' + empty.map,
    'gametype=' + empty.gametype,
    'humans=' + empty.humans,
    'bots=' + empty.bots,
    'players=' + empty.players.length,
    empty.players.map((p) => p.kind + ' ' + p.ping + ' ' + p.name).join('\n')
  ].join('\n') + '\n';
  write('status-empty.txt', emptyTxt);

  const beforeBots = empty.bots;
  const client = await connectClient({ host: '127.0.0.1', port: port, name: 'VerifyJoin' });
  await new Promise((r) => setTimeout(r, 2500));
  const after = await queryStatus({ host: '127.0.0.1', port: port, timeoutMs: 3000 });
  write('status-after-join.json', after);
  const afterTxt = [
    'map=' + after.map,
    'gametype=' + after.gametype,
    'humans=' + after.humans,
    'bots=' + after.bots,
    'players=' + after.players.length,
    after.players.map((p) => p.kind + ' ' + p.ping + ' ' + p.name).join('\n')
  ].join('\n') + '\n';
  write('status-after-join.txt', afterTxt);

  const names = after.players.map((p) => p.name);
  const hasHuman = names.some((n) => /VerifyJoin/i.test(n.replace(/\^[0-9]/g, '')));
  console.log(emptyTxt);
  console.log('--- after ---');
  console.log(afterTxt);
  console.log('hasHuman', hasHuman, 'botDelta', after.bots - beforeBots, 'plan', fillPlan({ humans: 1, bots: beforeBots }));

  client.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
