#!/usr/bin/env node
// Compile the exact menu lookup expressions and helper, not a JS reimplementation.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const patch = readFileSync(new URL('../patches/xash-save-hints.patch', import.meta.url), 'utf8');
const legacy = process.env.MENU_HINT_LEGACY === '1';
const source = process.env.MENU_HINT_SOURCE ? readFileSync(process.env.MENU_HINT_SOURCE, 'utf8') :
  patch.split('\n').filter(line => line.startsWith(' ') ||
    (line.startsWith(legacy ? '-' : '+') && !line.startsWith(legacy ? '---' : '+++')))
    .map(line => line.slice(1)).join('\n');
const helper = source.match(/static int UI_QuickSaveHintKey\([^]*?\n\}/)?.[0] || '';
const calls = [...source.matchAll(/EngFuncs::KeynumToString\( (KEY_GetKey\( "[^"]+" \)|UI_QuickSaveHintKey\( "[^"]+", "[^"]+" \)) \)/g)].map(match => match[1]);
assert.equal(calls.length, 2, 'compile both actual save/load hint expressions');
const directory = mkdtempSync(path.join(tmpdir(), 'goldsource-save-hint-test-'));
const harness = `#include <array>
#include <string>
#include <cstdio>
#include <strings.h>
static std::array<std::string, 256> bindings;
// Same case-insensitive, lowest-key, exact-binding contract as mainui KEY_GetKey.
static int KEY_GetKey(const char *binding) {
  for (int key = 0; key < 256; ++key)
    if (!strcasecmp(binding, bindings[key].c_str())) return key;
  return -1;
}
${helper}
static int checks;
static bool check(int expectedSave, int expectedLoad) {
  const int save = ${calls[0]};
  const int load = ${calls[1]};
  ++checks;
  if (save == expectedSave && load == expectedLoad) return true;
  std::fprintf(stderr, "case %d: save/load %d/%d expected %d/%d\\n", checks, save, load, expectedSave, expectedLoad);
  return false;
}
int main() {
  bindings[140] = "savequick"; bindings[141] = "loadquick";
  if (!check(140, 141)) return 1;
  bindings.fill(""); bindings[10] = "save quick"; bindings[20] = "load quick";
  if (!check(10, 20)) return 1;
  bindings[140] = "savequick"; bindings[141] = "loadquick";
  if (!check(140, 141)) return 1;
  bindings.fill(""); bindings[0] = "savequick"; bindings[255] = "loadquick";
  if (!check(0, 255)) return 1;
  bindings[100] = "savequick"; bindings[99] = "loadquick";
  if (!check(0, 99)) return 1;
  bindings.fill(""); bindings[30] = "SAVEQUICK"; bindings[31] = "LOAD QUICK";
  if (!check(30, 31)) return 1;
  bindings.fill(""); bindings[30] = "savequickly"; bindings[31] = "load quick-other";
  if (!check(-1, -1)) return 1;
  bindings.fill(""); bindings[44] = "savequick";
  if (!check(44, -1)) return 1;
  bindings.fill(""); bindings[45] = "load quick";
  if (!check(-1, 45)) return 1;
  bindings.fill("");
  if (!check(-1, -1)) return 1;
  std::printf("%d compiled menu lookup cases passed\\n", checks);
}
`;
writeFileSync(path.join(directory, 'hints.cpp'), harness);
for (const [command, args] of [
  [process.env.CXX || 'c++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-o', path.join(directory, 'hints'), path.join(directory, 'hints.cpp')]],
  [path.join(directory, 'hints'), []]
]) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  assert.equal(result.status, 0, result.error?.message || `${command} failed; retained fixture: ${directory}`);
}
const report = { testedAt: new Date().toISOString(), cases: 10,
  source: process.env.MENU_HINT_SOURCE || 'production patch postimage',
  sourceSHA256: createHash('sha256').update(source).digest('hex'),
  harnessSHA256: createHash('sha256').update(harness).digest('hex'), passed: true };
if (process.env.MENU_HINT_PROOF) writeFileSync(process.env.MENU_HINT_PROOF, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
