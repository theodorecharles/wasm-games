#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkout = path.join(process.env.IDTECH4_WORK_ROOT || path.join(root, '.work'), 'd3wasm');
const source = fs.readFileSync(path.join(checkout, 'neo/sys/posix/posix_net.cpp'), 'utf8');
const declarations = fs.readFileSync(path.join(checkout, 'neo/sys/sys_public.h'), 'utf8');
const seamStart = source.indexOf('EM_JS(int, D3WASM_DatagramOpen');
const methodsStart = source.indexOf('idPort::idPort()');
assert.ok(seamStart >= 0 && methodsStart > seamStart, 'browser datagram seam must exist');
const production = declarations.slice(declarations.indexOf('typedef enum {\n\tNA_BAD'), declarations.indexOf('class idTCP')) +
  source.slice(seamStart, source.indexOf('\n#endif', seamStart)) + '\n' +
  source.slice(methodsStart, source.indexOf('//=============================================================================', methodsStart));
assert.match(fs.readFileSync(path.join(checkout, 'neo/framework/async/AsyncClient.cpp'), 'utf8'),
  /ConnectToServer\( const netadr_t adr \)[\s\S]*?#ifdef __EMSCRIPTEN__[\s\S]*?ClosePort\(\);[\s\S]*?#endif\s*if \( !InitPort\(\) \)/,
  'reconnect must discard the previous managed WebSocket');
const worker = fs.readFileSync(path.join(root, 'site/d3-managed-network.js'), 'utf8');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'd3-network-'));
try {
  fs.writeFileSync(path.join(temporary, 'd3-network-production.h'), production);
  fs.writeFileSync(path.join(temporary, 'pre.js'), worker + `
globalThis.setupD3NetworkFixture = function () {
  Module.d3ManagedNetwork = createD3ManagedNetwork({
    pageUrl: 'https://game.test/',
    WebSocket: class {
      constructor() { this.readyState = 1; this.bufferedAmount = 0; this.sent = []; globalThis.fixtureSocket = this; }
      send(packet) { this.sent.push(packet); }
      close() { this.readyState = 3; this.onclose?.(); }
    }
  });
};
`);
  const binary = path.join(temporary, 'network.cjs');
  const compiled = spawnSync(process.env.EMXX || 'em++', ['-std=c++17', '-O1', '-sENVIRONMENT=node',
    '-sEXIT_RUNTIME=1', '-sASYNCIFY=1', '-sASSERTIONS=1', '--pre-js', path.join(temporary, 'pre.js'),
    '-I', temporary, path.join(root, 'tests/d3-network.cpp'), '-o', binary], {encoding: 'utf8'});
  assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
  const run = spawnSync(process.execPath, [binary], {encoding: 'utf8', timeout: 10000});
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const result = JSON.parse(run.stdout.trim());
  assert.equal(result.cases, 30);
  assert.equal(result.passed, true);
  const proof = {scope: 'Actual idPort declarations/methods and EM_JS bindings compiled to Wasm with the production managed datagram worker transport. The WebSocket is a deterministic fixture, not a dedicated-server handshake. Real Asyncify yields deliver delayed queued bytes.',
    sourceSHA256: crypto.createHash('sha256').update(production).digest('hex'),
    workerSHA256: crypto.createHash('sha256').update(worker).digest('hex'), ...result};
  if (process.env.D3_NETWORK_PROOF) fs.writeFileSync(process.env.D3_NETWORK_PROOF, JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify(proof, null, 2));
} finally { fs.rmSync(temporary, {recursive: true, force: true}); }
