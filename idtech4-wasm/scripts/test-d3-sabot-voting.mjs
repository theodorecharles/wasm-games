#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const native = path.join(root, '.work/d3-managed-sabot-source/neo/game');
const wasm = path.join(root, '.work/d3wasm-sabot/neo/game');
function extract(source, marker) {
  const start = source.indexOf(marker), open = source.indexOf('{', start);
  assert.ok(start >= 0 && open > start);
  let end = open + 1, depth = 1;
  while (depth && end < source.length) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; end++; }
  assert.equal(depth, 0);
  return source.slice(start, end);
}
const source = fs.readFileSync(path.join(native, 'MultiplayerGame.cpp'), 'utf8');
const browserSource = fs.readFileSync(path.join(wasm, 'MultiplayerGame.cpp'), 'utf8');
const methods = ['void idMultiplayerGame::ServerStartVote(', 'void idMultiplayerGame::CheckVote('];
const production = methods.map(marker => { const text = extract(source, marker); assert.equal(text, extract(browserSource, marker)); return text; }).join('\n');
const header = fs.readFileSync(path.join(native, 'MultiplayerGame.h'), 'utf8');
const enumNamed = name => {
  const end = header.indexOf('} ' + name + ';'); assert.ok(end >= 0);
  const start = header.lastIndexOf('typedef enum', end); assert.ok(start >= 0);
  return header.slice(start, end + name.length + 3);
};
const enums = enumNamed('playerVote_t');
const classEnums = ['vote_flags_t', 'vote_result_t'].map(enumNamed).join('\n');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'd3-sabot-voting-'));
try {
  fs.writeFileSync(path.join(directory, 'voting-production.h'), production);
  fs.writeFileSync(path.join(directory, 'voting-enums.h'), enums);
  fs.writeFileSync(path.join(directory, 'voting-class-enums.h'), classEnums);
  const results = [];
  const compileRun = (target, mode, negative = false) => {
    const compiler = target === 'native' ? (process.env.CXX || 'g++') : (process.env.EMXX || path.join(root, '.work/host-tools/emxx-6'));
    const binary = path.join(directory, target + '-' + mode + (target === 'wasm' ? '.cjs' : ''));
    const flags = target === 'native' ? ['-fsanitize=address,undefined', '-fno-sanitize-recover=all']
      : ['-fexceptions', '-sDISABLE_EXCEPTION_CATCHING=0', '-sENVIRONMENT=node', '-sEXIT_RUNTIME=1', '-sASSERTIONS=2', '-sSAFE_HEAP=1', '-fsanitize=undefined', '-fno-sanitize-recover=all'];
    const built = spawnSync(compiler, ['-std=c++17', '-O1', '-g', '-fno-omit-frame-pointer', ...flags,
      ...(mode === 'human-only' ? [] : ['-DMOD_BOTS']), '-I', directory, path.join(root, 'tests/d3-sabot-voting.cpp'), '-o', binary], {encoding: 'utf8', timeout: 120000});
    assert.equal(built.status, 0, built.stdout + built.stderr);
    const environment = {...process.env};
    if (target === 'native' && environment.LD_PRELOAD) {
      const library = spawnSync(compiler, ['-print-file-name=libasan.so'], {encoding: 'utf8'}).stdout.trim();
      assert.ok(path.isAbsolute(library) && fs.existsSync(library));
      environment.LD_PRELOAD = library + ':' + environment.LD_PRELOAD;
    }
    return spawnSync(target === 'native' ? binary : process.execPath,
      [...(target === 'native' ? [] : [binary]), ...(negative ? ['--negative-control'] : [])],
      {encoding: 'utf8', env: environment, timeout: 30000});
  };
  for (const target of ['native', 'wasm']) for (const mode of ['bots', 'human-only']) {
    const run = compileRun(target, mode);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    results.push({target, mode, ...JSON.parse(run.stdout)});
    console.log(JSON.stringify(results.at(-1)));
  }
  const blocks = production.match(/#ifdef MOD_BOTS\n[\s\S]*?#endif\n/g) || [];
  assert.equal(blocks.length, 2, 'exactly the two bot eligibility guards');
  const legacy = production.replace(/#ifdef MOD_BOTS\n[\s\S]*?#endif\n/g, '');
  // Removing only the new guards must reproduce the pinned original methods,
  // which remained unchanged in the v3 integration.
  const legacySource = execFileSync('git', ['-C', native, 'show', 'HEAD:neo/game/MultiplayerGame.cpp'], {encoding: 'utf8'});
  assert.equal(legacy, methods.map(marker => extract(legacySource, marker)).join('\n'));
  fs.writeFileSync(path.join(directory, 'voting-production.h'), legacy);
  const negative = compileRun('native', 'legacy', true);
  assert.equal(negative.status, 1, negative.stdout + negative.stderr);
  assert.deepEqual(JSON.parse(negative.stdout), {twoHumansTwoBotsVotePassed: false});
  const proof = {scope: 'Exact native/Wasm vote-start and vote-check methods with actual enums; fixture entities and notification/execution APIs. Native ASan/UBSan and Wasm SAFE_HEAP/UBSan. Not a Chrome map-vote or full-map transition proof.',
    sourceSHA256: crypto.createHash('sha256').update(production).digest('hex'), results,
    negativeControl: {exactV3Methods: true, exitCode: negative.status, output: JSON.parse(negative.stdout)}, passed: true};
  if (process.env.D3_SABOT_VOTING_PROOF) fs.writeFileSync(process.env.D3_SABOT_VOTING_PROOF, JSON.stringify(proof, null, 2) + '\n');
} finally { fs.rmSync(directory, {recursive: true, force: true}); }
