#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkout = process.env.PREY_PROMPT_SOURCE || path.join(root, '.work/prey-d3wasm');
const legacy = process.argv.includes('--legacy');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const read = file => fs.readFileSync(path.join(checkout, 'neo/framework', file), 'utf8');
const session = read('Session.cpp'), common = read('Common.cpp'), input = read('KeyInput.cpp');
function method(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, signature);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; ++i) {
    if (source[i] === '{') ++depth;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  assert.fail('unclosed method');
}
const load = method(session, 'bool idSessionLocal::QuickLoad()');
const boundary = load.indexOf('\tidStr saveName = common->GetLanguageDict()');
assert.ok(boundary > 0);
const prefix = load.slice(0, boundary);
assert.match(read('Session_local.h'), /static const int\s+SAVE_TIME_BAIL = 4000;/);
assert.match(prefix, legacy ? /MaterialKeyForBinding\( "loadgame",/ : /MaterialKeyForBinding\( loadBinding,/);
const dependencies = [method(input, 'int idKeyInput::NumBinds('),
  method(input, 'const char * IN_FirstKeyFromBinding('),
  method(common, 'void idCommonLocal::MaterialKeyForBinding(')].join('\n');
const negativeCases = ['default-f9', 'explicit-preferred', 'custom-function-key',
  'custom-letter', 'mouse-key', 'wheel-key', 'case-insensitive'];
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'prey-quickload-prompt-'));
const results = [];
try {
  for (const negative of legacy ? [true] : [false, true]) {
    const tested = negative && !legacy ? prefix.replace('MaterialKeyForBinding( loadBinding,', 'MaterialKeyForBinding( "loadgame",') : prefix;
    // True is only a harness marker for reaching the omitted file-loading tail.
    const production = dependencies + '\n' + tested + '\treturn true;\n}\n';
    fs.writeFileSync(path.join(temporary, 'prey-quickload-prompt-production.h'), production);
    for (const target of ['native', 'wasm']) {
      const compiler = target === 'native' ? (process.env.CXX || 'c++') :
        (process.env.EMXX || path.join(root, '.work/host-tools/emxx-6'));
      const binary = path.join(temporary, target === 'native' ? 'prompt-native' : 'prompt-wasm.cjs');
      const flags = target === 'native' ? ['-fsanitize=address,undefined', '-fno-sanitize-recover=all'] :
        ['-sENVIRONMENT=node', '-sEXIT_RUNTIME=1', '-sSAFE_HEAP=1', '-fsanitize=undefined', '-fno-sanitize-recover=all'];
      const built = spawnSync(compiler, ['-std=c++17', '-O1', ...flags, '-I', temporary,
        path.join(root, 'tests/prey-quickload-prompt.cpp'), '-o', binary], {encoding:'utf8', timeout:120000});
      assert.equal(built.status, 0, built.stdout + built.stderr);
      const env = {...process.env};
      if (target === 'native' && env.LD_PRELOAD) {
        const library = execFileSync(compiler, ['-print-file-name=libasan.so'], {encoding:'utf8'}).trim();
        assert.ok(path.isAbsolute(library) && fs.existsSync(library));
        env.LD_PRELOAD = library + ':' + env.LD_PRELOAD;
      }
      const run = spawnSync(target === 'native' ? binary : process.execPath,
        target === 'native' ? [] : [binary], {encoding:'utf8', timeout:30000, env});
      assert.equal(run.status, negative ? 1 : 0, run.stdout + run.stderr);
      assert.equal(run.stderr, '');
      const cases = run.stdout.trim().split('\n').map(line => JSON.parse(line));
      assert.equal(cases.length, 13);
      assert.deepEqual(cases.filter(c => !c.passed).map(c => c.case), negative ? negativeCases : []);
      results.push({target, negative, productionSHA256:hash(production), cases});
      console.log(JSON.stringify({target, negative, cases:cases.length, expectedFailures:negative ? negativeCases.length : 0}));
    }
  }
  const proof = {
    scope:'Exact Prey QuickLoad confirmation block, NumBinds, IN_FirstKeyFromBinding and MaterialKeyForBinding compiled natively with ASan/UBSan and to Wasm with SAFE_HEAP/UBSan. Fixture supplies key-name/localization primitives and GUI recorder. File load/rotation and timeout loop are not substituted or claimed tested by this fixture; Chrome tests cover those paths separately.',
    legacy, sessionSHA256:hash(session), commonSHA256:hash(common), inputSHA256:hash(input),
    fixtureSHA256:hash(fs.readFileSync(path.join(root, 'tests/prey-quickload-prompt.cpp'))), results
  };
  if (process.env.PREY_PROMPT_PROOF) fs.writeFileSync(process.env.PREY_PROMPT_PROOF, JSON.stringify(proof, null, 2) + '\n', {flag:'wx'});
} finally {
  fs.rmSync(temporary, {recursive:true, force:true});
}
