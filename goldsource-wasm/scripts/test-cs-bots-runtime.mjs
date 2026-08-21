#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(root, 'runtime', 'counter-strike');
const container = process.env.CS_CONTAINER_NAME || 'wasm-games-counter-strike-yapb-proof';
const image = process.env.CS_SERVER_IMAGE || 'wasm-games/counter-strike-yapb:4.4.957';
const quota = Number(process.env.CS_BOTS || 4);
const difficulty = Number(process.env.CS_BOT_DIFFICULTY || 2);
const bridgePort = process.env.CS_BRIDGE_PORT || '4290';
const webrtcPort = process.env.CS_WEBRTC_PORT || '4291';
const keep = process.env.CS_PROOF_KEEP === '1';
const outputIndex = process.argv.indexOf('--output');
const outputPath = outputIndex < 0 ? '' : String(process.argv[outputIndex + 1] || '').trim();
if (outputIndex >= 0) assert(outputPath, '--output requires a report path.');
assert(Number.isInteger(quota) && quota > 0 && quota < 16, 'CS_BOTS must be 1 through 15 for this proof.');

const run = (command, args, options = {}) => execFileSync(command, args, {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  ...options
});
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const exists = () => {
  try { run('docker', ['container', 'inspect', container]); return true; }
  catch { return false; }
};
const remove = () => {
  if (exists()) run('docker', ['rm', '-f', container]);
};

remove();
let completed = false;
try {
  run(path.join(runtime, 'start.sh'), [], {
    env: {
      ...process.env,
      CS_CONTAINER_NAME: container,
      CS_SERVER_IMAGE: image,
      CS_BOTS: String(quota),
      CS_BOT_DIFFICULTY: String(difficulty),
      CS_BRIDGE_PORT: bridgePort,
      CS_WEBRTC_PORT: webrtcPort
    }
  });

  const deadline = Date.now() + 60000;
  let logs = '';
  while (Date.now() < deadline) {
    logs = run('docker', ['logs', container], { stdio: ['ignore', 'pipe', 'pipe'] });
    const connections = logs.match(/Connecting Bot\.\.\./g)?.length || 0;
    if (logs.includes('successfully loaded for game: Counter-Strike v1.6 @ Xash3D Engine') &&
        logs.includes('Loaded Bots Graph data v2') && connections >= quota) break;
    await delay(250);
  }

  const connectionCount = logs.match(/Connecting Bot\.\.\./g)?.length || 0;
  assert.match(logs, /YaPB v4\.4\.957 successfully loaded for game: Counter-Strike v1\.6 @ Xash3D Engine/);
  assert.match(logs, /Loaded Bots Graph data v2/);
  assert.equal(connectionCount, quota, 'YaPB did not connect exactly the requested bot quota.');
  assert.doesNotMatch(logs, /permission denied/i);
  const config = run('docker', ['exec', container, 'sh', '-lc',
    "grep -E '^(yb_quota|yb_difficulty) ' /xashds/cstrike/addons/yapb/conf/yapb.cfg"]);
  assert.match(config, new RegExp(`yb_quota "${quota}"`));
  assert.match(config, new RegExp(`yb_difficulty "${difficulty}"`));

  const inspect = JSON.parse(run('docker', ['inspect', container]))[0];
  const imageInspect = JSON.parse(run('docker', ['image', 'inspect', image]))[0];
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    passed: true,
    engine: 'Xash3D-FWGS',
    game: 'Counter-Strike 1.6',
    botEngine: 'YaPB 4.4.957',
    map: 'de_dust2',
    requestedBots: quota,
    connectedBots: connectionCount,
    difficulty,
    graphLoaded: true,
    permissionErrors: 0,
    bridge: `ws://127.0.0.1:${bridgePort}/websocket`,
    containerImage: image,
    imageId: imageInspect.Id,
    containerId: inspect.Id
  };
  if (outputPath) {
    await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  completed = true;
  process.stdout.write(`Counter-Strike YaPB runtime proof passed: ${connectionCount}/${quota} bots connected on de_dust2.\n`);
} finally {
  if (!keep || !completed) remove();
}
