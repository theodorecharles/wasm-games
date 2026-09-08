import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const patcher = join(packageRoot, 'scripts/apply-side-module-patches.py');

test('native module names resolve from absolute, mod-relative and Windows paths', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'source-side-module-name-'));
  try {
    const source = join(temporary, 'name-test.cpp');
    const executable = join(temporary, 'name-test');
    writeFileSync(source, String.raw`
#include "source_wasm_side_module_name.h"
#include <cstring>
#include <cstdio>
int main() {
    const char *cases[][2] = {
        {"filesystem_stdio", "filesystem_stdio"},
        {"/game/bin/filesystem_stdio.so", "filesystem_stdio.so"},
        {"/game/hl2/bin/client.so", "client.so"},
        {"hl2/bin/server.so", "server.so"},
        {"/bin/libengine.so", "engine.so"},
        {"libsteam_api.so", "steam_api.so"},
        {"C:\\game\\bin\\libserver.so", "server.so"},
        {"C:\\game/bin\\libclient.so", "client.so"},
        {"", ""}, {"l", "l"}, {"li", "li"}
    };
    for (const auto &item : cases) {
        if (std::strcmp(SourceWasm_ModuleName(item[0]), item[1]) != 0) {
            std::fprintf(stderr, "Wrong module basename for %s\n", item[0]);
            return 1;
        }
    }
    return 0;
}
`);
    execFileSync(process.env.CXX || 'c++', ['-std=c++11', '-Wall', '-Wextra', '-Werror', '-I', join(packageRoot, 'patches/files'), source, '-o', executable]);
    execFileSync(executable);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('private patch application is idempotent and refuses unknown contexts', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'source-side-module-patch-'));
  try {
    mkdirSync(join(temporary, 'tier1'));
    const source = join(temporary, 'tier1/interface.cpp');
    const fixture = '#include "tier1/strtools.h"\n'
      + '#define EAT(prefix) if(strncmp(pModuleName, prefix, strlen(prefix)) == 0) pModuleName += strlen(prefix)\n'
      + '\tEAT("/"); EAT("bin"); EAT("/"); EAT("lib");\n#undef EAT\n';
    writeFileSync(source, fixture);
    execFileSync('python3', [patcher, temporary]);
    const applied = readFileSync(source, 'utf8');
    execFileSync('python3', [patcher, temporary]);
    assert.equal(readFileSync(source, 'utf8'), applied);
    execFileSync('python3', [patcher, '--check', temporary]);

    writeFileSync(source, fixture.replace('EAT("bin")', 'EAT("other")'));
    const unknown = readFileSync(source, 'utf8');
    const result = spawnSync('python3', [patcher, temporary], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /refusing to patch/);
    assert.equal(readFileSync(source, 'utf8'), unknown);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
