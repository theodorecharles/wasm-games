import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('two parser translation units preserve separate layouts, storage and dispatch', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scene-token-isolation-'));
  const run = (cmd, args, options = {}) => spawnSync(cmd, args, { cwd: dir, encoding: 'utf8', ...options });
  try {
    writeFileSync(join(dir, 'interface.h'), `
struct ISceneTokenProcessor { virtual int Kind() const = 0; virtual void Set(int) = 0; virtual int Get() const = 0; };
`);
    writeFileSync(join(dir, 'game.cpp'), `
#include "interface.h"
#include <cstring>
#include <cstdio>
class CSceneTokenProcessor : public ISceneTokenProcessor {
 public: int Kind() const { return 1; } void Set(int n) { token[0] = n; } int Get() const { return token[0]; }
 private: const char *buffer; char token[1024];
};
struct Guarded { CSceneTokenProcessor parser; unsigned char guard[256]; Guarded() { memset(guard, 0xa5, sizeof guard); } };
Guarded gameStorage;
asm(R"(.globl g_TokenProcessor
.set g_TokenProcessor, gameStorage)");
ISceneTokenProcessor *GetTokenProcessor();
int main() {
 for (auto c : gameStorage.guard) if (c != 0xa5) { puts("parser constructor overwrote adjacent storage"); return 11; }
 auto game = &gameStorage.parser; auto tier3 = GetTokenProcessor();
 if (game == tier3 || game->Kind() != 1 || tier3->Kind() != 2) return 12;
 game->Set(41); tier3->Set(73);
 if (game->Get() != 41 || tier3->Get() != 73) return 13;
 return 0;
}
`);
    const tier3 = `
#include "interface.h"
#include <cstring>
class CSceneTokenProcessor : public ISceneTokenProcessor {
 public: CSceneTokenProcessor(); int Kind() const { return 2; } void Set(int n) { token[0] = n; } int Get() const { return token[0]; }
 private: const char *buffer; char token[1024]; unsigned char breaks[256];
};
CSceneTokenProcessor::CSceneTokenProcessor() { memset(breaks, 0, sizeof breaks); breaks[':'] = 1; }
CSceneTokenProcessor g_TokenProcessor;

ISceneTokenProcessor *GetTokenProcessor() { return &g_TokenProcessor; }
`;
    writeFileSync(join(dir, 'tier3.cpp'), tier3);
    let result = run('g++', ['-std=c++17', 'game.cpp', 'tier3.cpp', '-Wl,--allow-multiple-definition', '-o', 'broken']);
    assert.equal(result.status, 0, result.stderr);
    result = run('./broken', []);
    assert.equal(result.status, 11, result.stdout + result.stderr);
    assert.match(result.stdout, /overwrote adjacent storage/);
    const patcher = resolve('scripts/apply-scene-token-patches.py');
    result = run('python3', ['-c', `import importlib.util,pathlib,sys
s=importlib.util.spec_from_file_location('patch',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
p=pathlib.Path('tier3.cpp');old=p.read_text();new=m.patch_text(old);assert m.patch_text(new)==new
try: m.patch_text(old.replace('ISceneTokenProcessor *GetTokenProcessor()', 'missing_wrapper'))
except ValueError: pass
else: raise AssertionError('Unknown late anchor accepted')
p.write_text(new)
`, patcher]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(join(dir, 'tier3.cpp'), 'utf8'), /namespace \{/);
    result = run('g++', ['-std=c++17', '-fsanitize=address,undefined', '-fno-sanitize-recover=all', 'game.cpp', 'tier3.cpp', '-Wl,--allow-multiple-definition', '-o', 'fixed']);
    assert.equal(result.status, 0, result.stderr);
    result = run('./fixed', []);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
