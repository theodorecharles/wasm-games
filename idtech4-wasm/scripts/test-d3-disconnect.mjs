#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = process.env.IDTECH4_WORK_ROOT || path.join(root, '.work');
const source = fs.readFileSync(process.env.D3_ASYNC_CLIENT_SOURCE || path.join(work, 'd3wasm/neo/framework/async/AsyncClient.cpp'), 'utf8');
const start = source.indexOf('void idAsyncClient::DisconnectFromServer( void )');
const end = source.indexOf('\n/*', start);
assert.ok(start >= 0 && end > start);
const production = source.slice(start, end);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'd3-disconnect-'));
try {
  fs.writeFileSync(path.join(temporary, 'd3-disconnect-production.h'), `
using byte = unsigned char;
constexpr int MAX_MESSAGE_SIZE=16384, CLIENT_RELIABLE_MESSAGE_DISCONNECT=1;
enum {CS_DISCONNECTED, CS_CHALLENGING, CS_CONNECTED, CS_PURERESTART};
static std::string trace;
struct idBitMsg { void Init(byte*,int){} void WriteByte(int){} void WriteString(const char*){} };
struct Files { void ClearPureChecksums(){trace += "pure,";} } files;
static Files* fileSystem=&files;
struct Common { void Error(const char*){throw "unexpected reliable overflow";} } commonObject;
static Common* common=&commonObject;
struct Channel { bool SendReliableMessage(idBitMsg&){trace += "reliable,"; return true;} void Shutdown(){trace += "shutdown,";} };
struct idAsyncClient {
  int clientState; bool active; Channel channel;
  void SendEmptyToServer(bool){trace += "send,";}
  void ClosePort(){trace += "close,";}
  void DisconnectFromServer();
};
` + production);
  const results = [];
  for (const browser of [false, true]) {
    const binary = path.join(temporary, browser ? 'browser' : 'desktop');
    const compiled = spawnSync(process.env.CXX || 'c++', ['-std=c++17', '-O1', ...(browser ? ['-D__EMSCRIPTEN__'] : []),
      '-I', temporary, path.join(root, 'tests/d3-disconnect.cpp'), '-o', binary], {encoding: 'utf8'});
    assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
    const run = spawnSync(binary, [], {encoding: 'utf8', timeout: 10000});
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const cases = run.stdout.trim().split('\n').map(JSON.parse);
    assert.equal(cases.length, 4);
    results.push({browser, cases});
  }
  const proof = {scope: 'Exact native DisconnectFromServer body compiled for browser and desktop branches with tracing protocol/channel dependencies. Packet ordering and cleanup routing, not real network delivery.',
    sourceSHA256: crypto.createHash('sha256').update(production).digest('hex'), results};
  if (process.env.D3_DISCONNECT_PROOF) fs.writeFileSync(process.env.D3_DISCONNECT_PROOF, JSON.stringify(proof, null, 2) + '\n');
  const failures = results.flatMap(row => row.cases.filter(test => !test.passed).map(test => ({browser: row.browser, ...test})));
  console.log(JSON.stringify({cases: 8, failures}));
  if (process.env.D3_DISCONNECT_EXPECT_FAILURE === '1') assert.equal(failures.length, 4);
  else assert.equal(failures.length, 0);
} finally { fs.rmSync(temporary, {recursive: true, force: true}); }
