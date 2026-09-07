#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const native = path.join(root, '.work/d3-managed-sabot-source/neo/game/bots');
const client = path.join(root, '.work/d3wasm-sabot/neo/game/bots');
const source = fs.readFileSync(path.join(native, 'BotAI_manager.cpp'), 'utf8');
assert.equal(source, fs.readFileSync(path.join(client, 'BotAI_manager.cpp'), 'utf8'));
function method(marker) {
  const start = source.indexOf(marker), open = source.indexOf('{', start);
  assert.ok(start >= 0 && open > start);
  let end = open + 1, depth = 1;
  while (depth && end < source.length) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; end++; }
  assert.equal(depth, 0);
  return source.slice(start, end);
}
const extracted = ['int botAi::PopulationTarget(', 'void botAi::MaintainPopulation(', 'int botAi::FindIdleBotSlot(', 'idPlayer * botAi::FindBotClient('].map(method).join('\n');
for (const tree of ['d3-managed-sabot-source', 'd3wasm-sabot']) {
  const game = fs.readFileSync(path.join(root, '.work', tree, 'neo/game/Game_local.cpp'), 'utf8');
  const start = game.indexOf('gameReturn_t idGameLocal::RunFrame(');
  const hook = game.indexOf('botAi::MaintainPopulation();', start);
  assert.ok(hook > start && hook < game.indexOf('SetupPlayerPVS();', start), 'population runs before PVS/entity traversal');
}
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'd3-sabot-population-'));
try {
  fs.writeFileSync(path.join(directory, 'population-production.h'), extracted);
  const results = [];
  for (const target of ['native', 'wasm']) {
    const compiler = target === 'native' ? (process.env.CXX || 'g++') : (process.env.EMXX || path.join(root, '.work/host-tools/emxx-6'));
    const binary = path.join(directory, target === 'native' ? 'population-native' : 'population-wasm.cjs');
    const flags = target === 'native' ? ['-fsanitize=address,undefined', '-fno-sanitize-recover=all']
      : ['-fexceptions', '-sDISABLE_EXCEPTION_CATCHING=0', '-sENVIRONMENT=node', '-sEXIT_RUNTIME=1', '-sASSERTIONS=2', '-sSAFE_HEAP=1', '-fsanitize=undefined', '-fno-sanitize-recover=all'];
    const built = spawnSync(compiler, ['-std=c++17', '-O1', '-g', '-fno-omit-frame-pointer', ...flags, '-I', directory,
      path.join(root, 'tests/d3-sabot-population.cpp'), '-o', binary], {encoding: 'utf8', timeout: 120000});
    assert.equal(built.status, 0, built.stdout + built.stderr);
    const environment = {...process.env};
    if (target === 'native' && environment.LD_PRELOAD) {
      const library = spawnSync(compiler, ['-print-file-name=libasan.so'], {encoding: 'utf8'}).stdout.trim();
      assert.ok(path.isAbsolute(library) && fs.existsSync(library));
      environment.LD_PRELOAD = library + ':' + environment.LD_PRELOAD;
    }
    const run = spawnSync(target === 'native' ? binary : process.execPath, target === 'native' ? [] : [binary], {encoding: 'utf8', env: environment, timeout: 30000});
    assert.equal(run.status, 0, run.stdout + run.stderr);
    results.push({target, ...JSON.parse(run.stdout)});
    console.log(JSON.stringify(results.at(-1)));
  }
  const proof = {scope: 'Exact population target/maintenance and slot lookup methods compiled with native ASan/UBSan and Wasm SAFE_HEAP/UBSan. Entity and spawn/delete APIs are fixtures; full native map and Chrome client tests are separate.',
    sourceSHA256: crypto.createHash('sha256').update(extracted).digest('hex'), results, passed: true};
  if (process.env.D3_SABOT_POPULATION_PROOF) fs.writeFileSync(process.env.D3_SABOT_POPULATION_PROOF, JSON.stringify(proof, null, 2) + '\n');
} finally { fs.rmSync(directory, {recursive: true, force: true}); }
