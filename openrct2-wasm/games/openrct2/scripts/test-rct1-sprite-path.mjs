import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const game = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.env.OPENRCT2_SOURCE_DIR || path.resolve(game, '../../.work/openrct2');
const legacy = process.env.RCT1_PATH_LEGACY === '1';
const nativePath = 'src/openrct2/drawing/Drawing.Sprite.cpp';
const native = legacy ? execFileSync('git', ['-C', source, 'show', `HEAD:${nativePath}`], { encoding: 'utf8' })
  : await fs.readFile(path.join(source, nativePath), 'utf8');
const begin = native.indexOf('bool GfxLoadCsg(');
const end = native.indexOf('\n    try\n', begin);
assert.ok(begin >= 0 && end > begin);
// Compile the exact native path-selection prefix, stopping before file IO.
// Full CSG decoding/rendering is checked by the real build and Chrome, not these fixtures.
const prefix = native.slice(begin, end);
const context = await fs.readFile(path.join(source, 'src/openrct2/Context.cpp'), 'utf8');
const header = await fs.readFile(path.join(source, 'src/openrct2/drawing/Drawing.Sprite.h'), 'utf8');
if (!legacy) {
  assert.match(context, /GfxLoadG1\(\*_env\)[\s\S]*?GfxLoadCsg\(\*_env\)/);
  assert.match(header, /bool GfxLoadCsg\(const OpenRCT2::IPlatformEnvironment& env\)/);
  const original = execFileSync('git', ['-C', source, 'show', `HEAD:${nativePath}`], { encoding: 'utf8' });
  const originalEnd = original.indexOf('\n    try\n', original.indexOf('bool GfxLoadCsg('));
  assert.ok(originalEnd >= 0);
  assert.equal(native.slice(end), original.slice(originalEnd), 'CSG validation, decoding and sprite lookup must remain unchanged');
  const imageTable = 'src/openrct2/object/ImageTable.cpp';
  assert.equal(await fs.readFile(path.join(source, imageTable), 'utf8'),
    execFileSync('git', ['-C', source, 'show', `HEAD:${imageTable}`], { encoding: 'utf8' }),
    'native fallback image selection must remain unchanged');
}
const fixture = `
#include <cassert>
#include <iostream>
#include <string>
#include <vector>
#define LOG_VERBOSE(...) ((void)0)
enum class DirBase { rct1 };
struct IPlatformEnvironment {
  std::string root;
  std::string GetDirectoryPath(DirBase base) const { assert(base == DirBase::rct1); return root; }
};
namespace Config {
  struct General { std::string rct1Path; };
  struct Configuration { General general; };
  static Configuration instance;
  Configuration& Get() { return instance; }
}
static std::vector<std::string> probes;
std::string FindCsg1idatAtLocation(const std::string& root) { probes.push_back(root + "/Data/CSG1I.DAT"); return probes.back(); }
std::string FindCsg1datAtLocation(const std::string& root) { probes.push_back(root + "/Data/CSG1.DAT"); return probes.back(); }
${prefix}
    return true;
}
int main() {
  const std::vector<std::pair<std::string, std::string>> cases = {
    {"/RCT/RCT1", ""}, {"/explicit/RCT1", "/stale/config"},
    {"/configured/RCT1", "/configured/RCT1"}, {"", ""},
    {"", "/not-the-resolved-path"}, {"/owner/My RCT1", ""},
    {"/owner/Été", "/other"}, {"/", "/other"}
  };
  int number = 0;
  for (const auto& [resolved, configured] : cases) {
    number++;
    probes.clear();
    Config::Get().general.rct1Path = configured;
    const IPlatformEnvironment env{resolved};
    bool result = ${legacy ? 'GfxLoadCsg()' : 'GfxLoadCsg(env)'};
    std::vector<std::string> expected;
    if (!resolved.empty()) expected = {resolved + "/Data/CSG1I.DAT", resolved + "/Data/CSG1.DAT"};
    if (result != !resolved.empty() || probes != expected) {
      std::cerr << "native RCT1 path case " << number << " failed: resolved=" << resolved << " configured=" << configured << "\\n";
      return 1;
    }
    assert(Config::Get().general.rct1Path == configured);
  }
  std::cout << cases.size() << " exact native path-selection cases passed\\n";
}
`;
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'openrct2-rct1-path-'));
await fs.writeFile(path.join(scratch, 'path.cpp'), fixture);
execFileSync(process.env.CXX || 'c++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-O2', path.join(scratch, 'path.cpp'), '-o', path.join(scratch, 'path-test')], { stdio: 'inherit' });
execFileSync(path.join(scratch, 'path-test'), { stdio: 'inherit' });
console.log(`RCT1 native path prefix checked (${legacy ? 'old source' : 'applied source'}); fixture retained at ${scratch}`);
