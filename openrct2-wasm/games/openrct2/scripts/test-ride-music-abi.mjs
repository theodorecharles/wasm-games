import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const image = 'ghcr.io/openrct2/openrct2-build@sha256:0e1daa8e3f5a1c6951179aeab5c5de471ea705cb5f756bfb6e0ae5162b7e67be';
const symbol = 'RideMusicGetTrackOffsetLength_';
function command(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, `${binary} ${args.join(' ')}\n${result.stderr}`);
  return { stdout: result.stdout, stderr: result.stderr };
}

if (process.argv[2] === '--inside') {
  const cxx = '/emsdk/upstream/emscripten/em++';
  const linker = '/emsdk/upstream/bin/wasm-ld';
  const records = [];
  for (const variant of ['original', 'applied']) {
    const includes = [`-I/proof/${variant}`, '-I/src/src/openrct2/ride', '-I/proof'];
    for (const optimization of ['-O0', '-O3']) {
      const output = `/proof/${variant}-${optimization.slice(1)}.ll`;
      command(cxx, ['-std=c++20', ...includes, optimization, '-S', '-emit-llvm', '/proof/address.cpp', '-o', output]);
      const ir = await fs.readFile(output, 'utf8');
      const declarations = ir.split('\n').filter(line => line.startsWith('declare ') && line.includes(symbol));
      assert.equal(declarations.length, 2, 'both native callbacks must be referenced');
      for (const declaration of declarations) {
        if (variant === 'original') assert.match(declaration, /ERK4Ride\(\)$/, 'old address-only header reproduces placeholder prototype');
        else {
          assert.match(declaration, /ERK4Ride\(ptr .*sret\(.*pair.*\).*?, ptr /, 'complete native sret and Ride arguments');
          assert.doesNotMatch(declaration, /ERK4Ride\(\)$/);
        }
      }
      records.push({ variant, optimization, declarations });
    }
    for (const unit of ['definition', 'driver']) {
      command(cxx, ['-std=c++20', ...includes, '-O3', '-c', `/proof/${unit}.cpp`, '-o', `/proof/${variant}-${unit}.o`]);
    }
    for (const lto of [false, true]) {
      const stem = `${variant}-${lto ? 'thin' : 'wasm'}`;
      command(cxx, ['-std=c++20', ...includes, '-O3', ...(lto ? ['-flto=thin'] : []), '-c', '/proof/address.cpp', '-o', `/proof/${stem}.o`]);
      // A reduced native callback fixture, not the full UI's link-warning repro.
      // The old header's indirect calls also work here. Never claim a crash fix.
      const link = command(linker, ['--fatal-warnings', '--no-entry', '--export=runCase', `/proof/${stem}.o`,
        `/proof/${variant}-definition.o`, `/proof/${variant}-driver.o`, '-o', `/proof/${stem}.wasm`]);
      assert.equal(link.stderr, '', stem);
      const bytes = await fs.readFile(`/proof/${stem}.wasm`);
      const { instance, module } = await WebAssembly.instantiate(bytes, {});
      assert.deepEqual(WebAssembly.Module.imports(module), [], 'self-contained callback Wasm');
      const cases = [];
      for (let scenario = 0; scenario < 6; scenario++) for (let circus = 0; circus < 2; circus++) {
        assert.equal(instance.exports.runCase(scenario * 2 + circus), 1, `${stem}: scenario ${scenario}, circus ${circus}`);
        cases.push({ scenario, circus: Boolean(circus), passed: true });
      }
      records.push({ variant, lto, cases, bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'), linkerDiagnostics: link.stderr });
    }
  }
  const report = { checkedAt: new Date().toISOString(), toolchain: image,
    compiler: command('/emsdk/upstream/bin/clang++', ['--version']).stdout.trim(), records,
    scope: 'Exact original/applied native header, exact unmodified callback bodies with controlled metadata; address-only IR at O0/O3 and 48 Wasm indirect-call scenarios across normal/ThinLTO objects. Original reduced runtime cases pass too. Full native link and Chrome are separate gates; this is not an audio listening test.' };
  await fs.writeFile('/proof/report.json', JSON.stringify(report, null, 2) + '\n');
  console.log('Ride-music ABI: old placeholder prototypes reproduced; applied headers retain both arguments at O0/O3; 48 original/applied native callback Wasm cases pass with normal/ThinLTO objects.');
} else {
  const game = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const source = process.env.OPENRCT2_SOURCE_DIR || path.resolve(game, '../../.work/openrct2');
  const headerPath = 'src/openrct2/ride/RideAudio.h';
  const applied = await fs.readFile(path.join(source, headerPath), 'utf8');
  const original = execFileSync('git', ['-C', source, 'show', `HEAD:${headerPath}`], { encoding: 'utf8' });
  const addition = '#ifdef __EMSCRIPTEN__\n'
    + "    // Instantiate the return type in units that only take a callback's address.\n"
    + '    // Otherwise Clang can emit a placeholder void() declaration for Wasm linking.\n'
    + '    static_assert(sizeof(std::pair<size_t, size_t>) > 0);\n#endif\n\n';
  assert.ok(applied.includes(addition), 'bounded native return-type completion is present');
  assert.equal(applied.replace(addition, ''), original, 'no ABI/API or desktop header changes');
  const nativePath = 'src/openrct2/ride/RideAudio.cpp';
  const native = await fs.readFile(path.join(source, nativePath), 'utf8');
  assert.equal(native, execFileSync('git', ['-C', source, 'show', `HEAD:${nativePath}`], { encoding: 'utf8' }), 'music algorithms remain unchanged');
  const dataPath = 'src/openrct2/ride/RideData.h';
  assert.equal(await fs.readFile(path.join(source, dataPath), 'utf8'),
    execFileSync('git', ['-C', source, 'show', `HEAD:${dataPath}`], { encoding: 'utf8' }), 'descriptor callback type and defaults remain unchanged');
  const begin = native.indexOf('    std::pair<size_t, size_t> RideMusicGetTrackOffsetLength_Circus(');
  const end = native.indexOf('    static std::pair<size_t, size_t> RideMusicGetTrackOffsetLength(', begin);
  assert.ok(begin >= 0 && end > begin);
  const bodies = native.slice(begin, end);
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'openrct2-music-test-'));
  for (const [variant, contents] of [['original', original], ['applied', applied]]) {
    await fs.mkdir(path.join(scratch, variant));
    // -I/src/src/openrct2/ride resolves this exact header's relative includes.
    await fs.writeFile(path.join(scratch, variant, 'RideAudio.h'), contents);
  }
  await fs.writeFile(path.join(scratch, 'address.cpp'), `
#include "RideAudio.h"
using Callback = decltype(&OpenRCT2::RideAudio::RideMusicGetTrackOffsetLength_Default);
struct Descriptor { unsigned tag; Callback callback; };
constexpr Descriptor descriptors[] = {
    {17, OpenRCT2::RideAudio::RideMusicGetTrackOffsetLength_Default},
    {18, OpenRCT2::RideAudio::RideMusicGetTrackOffsetLength_Circus},
};
extern "C" const Descriptor* getDescriptor(unsigned circus) { return &descriptors[circus]; }
extern "C" Callback getCallback(unsigned circus) { return descriptors[circus].callback; }
`);
  await fs.writeFile(path.join(scratch, 'fixture.h'), `
#pragma once
#include "RideAudio.h"
struct Ride { size_t music; size_t musicTuneId; };
namespace OpenRCT2 {
struct Track { size_t BytesPerTick; size_t Size; };
struct MusicObject {
    size_t count = 2;
    unsigned queries = 0;
    Track tracks[2]{{1378,12427456},{0xffffffffu,17}};
    size_t GetTrackCount() const { return count; }
    const Track* GetTrack(size_t index) { if(index >= count) __builtin_trap(); queries++; return &tracks[index]; }
};
inline MusicObject musicObject;
struct Manager {
    template<class T> T* GetLoadedObject(size_t id) { return id == 7 ? &musicObject : nullptr; }
};
struct Context { Manager manager; Manager& GetObjectManager() { return manager; } };
inline Context context;
inline Context* GetContext() { return &context; }
}
`);
  await fs.writeFile(path.join(scratch, 'definition.cpp'), `#include "fixture.h"\nnamespace OpenRCT2::RideAudio {\n${bodies}\n}\n`);
  await fs.writeFile(path.join(scratch, 'driver.cpp'), `
#include "fixture.h"
using Callback = decltype(&OpenRCT2::RideAudio::RideMusicGetTrackOffsetLength_Default);
struct Descriptor { unsigned tag; Callback callback; };
extern "C" const Descriptor* getDescriptor(unsigned circus);
extern "C" Callback getCallback(unsigned circus);
extern "C" int runCase(unsigned test) {
    const unsigned scenario = test / 2, circus = test % 2;
    Ride ride{7,0};
    size_t a=1378, b=12427456;
    auto& music = OpenRCT2::musicObject;
    music.count=2; music.queries=0;
    if(scenario==1) { ride.music=8; a=0; b=0; }
    if(scenario==2) { ride.musicTuneId=1; a=0xffffffffu; b=17; }
    if(scenario==3) { ride.musicTuneId=2; a=0; b=0; }
    if(scenario==4) { ride.musicTuneId=255; a=0; b=0; }
    if(scenario==5) { music.count=0; a=0; b=0; }
    if(circus) { a=1378; b=12427456; }
    const auto descriptor=getDescriptor(circus);
    auto [actualA, actualB]=descriptor->callback(ride);
    auto [secondA, secondB]=getCallback(circus)(ride);
    const unsigned expectedQueries=(!circus && (scenario==0 || scenario==2)) ? 2 : 0;
    return descriptor->tag==17+circus && actualA==a && actualB==b && secondA==a && secondB==b && music.queries==expectedQueries;
}
`);
  command('docker', ['run', '--rm', '--pull=never', '--network', 'none', '--read-only', '--tmpfs', '/tmp:rw',
    '--user', `${process.getuid()}:${process.getgid()}`, '-v', `${source}:/src:ro`, '-v', `${scratch}:/proof`,
    '-v', `${path.dirname(fileURLToPath(import.meta.url))}:/tests:ro`, '--entrypoint', '/emsdk/node/22.16.0_64bit/bin/node',
    image, '/tests/test-ride-music-abi.mjs', '--inside']);
  const report = JSON.parse(await fs.readFile(path.join(scratch, 'report.json'), 'utf8'));
  if (process.argv[2]) await fs.writeFile(process.argv[2], JSON.stringify({ ...report, scratch }, null, 2) + '\n');
  console.log(`Ride-music ABI: original placeholder declarations reproduced; applied O0/O3 declarations and 48 normal/ThinLTO native callback cases pass. Fixtures retained at ${scratch}`);
}
