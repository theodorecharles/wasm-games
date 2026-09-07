#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const native = path.resolve(process.env.D3_SABOT_SOURCE || path.join(root, '.work/d3-managed-sabot-source'));
const client = path.resolve(process.env.D3_SABOT_WASM_SOURCE || path.join(root, '.work/d3wasm-sabot'));
const read = file => fs.readFileSync(path.join(native, 'neo', file), 'utf8');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const hashes = {};
for (const file of ['idlib/BitMsg.cpp', 'idlib/BitMsg.h', 'framework/UsercmdGen.h', 'game/bots/BotAI.cpp', 'game/Game_network.cpp']) {
  const text = read(file);
  assert.equal(fs.readFileSync(path.join(client, 'neo', file), 'utf8'), text, 'native/Wasm implementation mismatch: ' + file);
  hashes[file] = hash(text);
}
function block(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, 'missing source marker: ' + marker);
  const open = source.indexOf('{', start);
  let depth = 1, end = open + 1;
  while (depth && end < source.length) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
    end++;
  }
  assert.equal(depth, 0, 'unterminated source block');
  return source.slice(start, end);
}
const header = read('idlib/BitMsg.h');
const implementation = read('idlib/BitMsg.cpp');
const bot = read('game/bots/BotAI.cpp');
const inlineNames = ['Init', 'GetData', 'GetSize', 'SetSize', 'GetNumBitsWritten', 'GetRemainingWriteBits',
  'GetNumBitsRead', 'GetRemainingReadBits', 'BeginWriting', 'BeginReading', 'SaveReadState', 'RestoreReadState',
  'WriteChar', 'WriteByte', 'WriteShort', 'ReadChar', 'ReadByte', 'ReadShort'];
let bits = block(header, 'class idBitMsg {') + ';\n';
for (const name of inlineNames) {
  const matches = [...header.matchAll(new RegExp('ID_INLINE [^\\n]*\\bidBitMsg::' + name + '\\(', 'g'))];
  assert.ok(matches.length, name);
  for (const match of matches) bits += block(header.slice(match.index), match[0]) + '\n';
}
for (const signature of ['idBitMsg::idBitMsg()', 'bool idBitMsg::CheckOverflow(', 'void idBitMsg::WriteBits(', 'int idBitMsg::ReadBits(']) bits += block(implementation, signature) + '\n';
const commands = block(read('framework/UsercmdGen.h'), 'class usercmd_t {') + ';\n';
const methods = block(bot, 'void botAi::WriteUserCmdsToSnapshot(') + '\n' + block(bot, 'void botAi::ReadUserCmdsFromSnapshot(');
const constants = ['MAX_CLIENTS', 'BOT_START_INDEX', 'BOT_MAX_BOTS'];
const declarations = [read('game/GameBase.h').match(/#define\s+MAX_CLIENTS\s+32\b/)?.[0],
  bot.match(/const int botAi::BOT_START_INDEX\s*=\s*1;/)?.[0],
  bot.match(/const int botAi::BOT_MAX_BOTS\s*=\s*MAX_CLIENTS - BOT_START_INDEX;/)?.[0]];
declarations.forEach((value, index) => assert.ok(value, constants[index]));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'd3-sabot-wire-'));
const results = [];
try {
  fs.writeFileSync(path.join(directory, 'wire-bits.h'), bits);
  fs.writeFileSync(path.join(directory, 'wire-usercmd.h'), commands);
  fs.writeFileSync(path.join(directory, 'wire-constants.h'), declarations.join('\n'));
  fs.writeFileSync(path.join(directory, 'wire-bots.h'), methods);
  const fixture = path.join(root, 'tests/d3-sabot-snapshot.cpp');
  const common = ['-std=c++17', '-O1', '-g', '-fno-omit-frame-pointer', '-I', directory, fixture];
  for (const target of ['native', 'wasm']) {
    const binary = path.join(directory, target === 'native' ? 'wire-native' : 'wire-wasm.cjs');
    const compiler = target === 'native' ? (process.env.CXX || 'g++') : (process.env.EMXX || path.join(root, '.work/host-tools/emxx-6'));
    const flags = target === 'native' ? ['-fsanitize=address,undefined', '-fno-sanitize-recover=all']
      : ['-fexceptions', '-sDISABLE_EXCEPTION_CATCHING=0', '-sENVIRONMENT=node', '-sEXIT_RUNTIME=1', '-sASSERTIONS=2', '-sSAFE_HEAP=1', '-fsanitize=undefined', '-fno-sanitize-recover=all'];
    const compiled = spawnSync(compiler, [...common, ...flags, '-o', binary], {encoding: 'utf8', timeout: 120000});
    assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
    const environment = {...process.env};
    if (target === 'native' && environment.LD_PRELOAD) {
      // Preserve inherited runtime hooks while satisfying ASan's required
      // first-library ordering; do not disable sanitizer verification.
      const library = spawnSync(compiler, ['-print-file-name=libasan.so'], {encoding: 'utf8'}).stdout.trim();
      assert.ok(path.isAbsolute(library) && fs.existsSync(library));
      environment.LD_PRELOAD = library + ':' + environment.LD_PRELOAD;
    }
    const run = spawnSync(target === 'native' ? binary : process.execPath, target === 'native' ? [] : [binary], {encoding: 'utf8', timeout: 30000, env: environment});
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const result = JSON.parse(run.stdout);
    assert.equal(result.passed, true);
    results.push({target, sanitizers: flags, ...result});
    console.log(JSON.stringify(results.at(-1)));
  }
  // Exact upstream reader (before our guards) must fail the same malformed
  // prefix contract. This control does not intentionally access invalid memory.
  const reference = fs.readFileSync(path.join(root, '.work/idtech4a-bot-reference/doom3/neo/game/bots/BotAI.cpp'), 'utf8');
  fs.writeFileSync(path.join(directory, 'wire-bots.h'), block(bot, 'void botAi::WriteUserCmdsToSnapshot(') + '\n' + block(reference, 'void botAi::ReadUserCmdsFromSnapshot('));
  const legacy = path.join(directory, 'wire-legacy');
  const compiled = spawnSync(process.env.CXX || 'g++', [...common, '-o', legacy], {encoding: 'utf8'});
  assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
  const rejected = spawnSync(legacy, ['--empty-prefix-only'], {encoding: 'utf8'});
  assert.equal(rejected.status, 1, 'upstream reader must fail to reject the empty prefix');
  assert.match(rejected.stdout, /emptyPrefixRejected.*false/);
  const proof = {scope: 'Exact native/Wasm SABot snapshot read/write methods, actual idBitMsg declarations/used methods and actual usercmd_t compiled on native ASan/UBSan and Wasm SAFE_HEAP/UBSan. Game state/error handling is a fixture; this is not a full network or browser malformed-packet test.',
    sourceHashes: hashes, extractedSHA256: hash(bits + commands + methods), results,
    negativeControl: {upstreamReader: true, exitCode: rejected.status, output: rejected.stdout.trim()}, passed: true};
  if (process.env.D3_SABOT_SNAPSHOT_PROOF) fs.writeFileSync(process.env.D3_SABOT_SNAPSHOT_PROOF, JSON.stringify(proof, null, 2) + '\n');
} finally { fs.rmSync(directory, {recursive: true, force: true}); }
