import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const image = 'ghcr.io/openrct2/openrct2-build@sha256:0e1daa8e3f5a1c6951179aeab5c5de471ea705cb5f756bfb6e0ae5162b7e67be';
const editor = 'CMakeFiles/openrct2.dir/src/openrct2-ui/windows/EditorInventionsList.cpp.o';
const symbol = '_ZN8OpenRCT29RideAudio37RideMusicGetTrackOffsetLength_DefaultERK4Ride';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const run = (binary, args, options = {}) => spawnSync(binary, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });

if (process.argv[2] === '--inside') {
  const records = [];
  let previousCommand;
  for (const variant of ['original', 'applied']) {
    const build = `${variant === 'original' ? '/baseline' : '/src'}/build-framework`;
    const commands = run('ninja', ['-t', 'commands', 'openrct2.js'], { cwd: build });
    assert.equal(commands.status, 0, commands.stderr);
    const command = commands.stdout.trim().split('\n').at(-1);
    assert.ok(command.startsWith(': && ') && command.endsWith(' && :'), 'known CMake link wrapper');
    assert.equal(command.split(' -o openrct2.js ').length, 2, 'one native output');
    assert.equal(command.split(editor).length, 2, 'one actual editor object');
    if (previousCommand) assert.equal(command, previousCommand, 'both complete object sets use identical link arguments');
    previousCommand = command;
    const object = path.join(build, editor);
    const ir = run('/emsdk/upstream/bin/clang++', ['--target=wasm32-unknown-emscripten', '-S', '-emit-llvm', '-x', 'ir', object, '-o', '-']);
    assert.equal(ir.status, 0, ir.stderr);
    const declaration = ir.stdout.split('\n').find(line => line.startsWith('declare ') && line.includes(symbol));
    assert.ok(declaration);
    if (variant === 'original') assert.match(declaration, /ERK4Ride\(\)$/);
    else assert.match(declaration, /ERK4Ride\(ptr .*sret\(.*pair.*\).*?, ptr /);
    const output = `/proof/${variant}/openrct2.js`;
    const linkCommand = command.replace(' -o openrct2.js ', ` -Wl,--fatal-warnings -o ${output} `);
    const result = run('/bin/sh', ['-c', linkCommand], { cwd: build });
    if (variant === 'original') {
      assert.notEqual(result.status, 0, 'complete pre-fix objects must fail the full fatal-warning link');
      assert.match(result.stderr, /function signature mismatch: _ZN8OpenRCT29RideAudio37RideMusicGetTrackOffsetLength_DefaultERK4Ride/);
      assert.match(result.stderr, /\(\) -> void/);
      assert.match(result.stderr, /\(i32, i32\) -> void/);
    } else {
      assert.equal(result.status, 0, result.stderr);
      assert.doesNotMatch(result.stderr, /warning:|error:/i, 'full native link is warning-free');
    }
    records.push({ variant, build, declaration, objectSha256: hash(await fs.readFile(object)),
      linkCommand, status: result.status, stdout: result.stdout, stderr: result.stderr });
  }
  const artifacts = [];
  for (const name of ['openrct2.js', 'openrct2.wasm', 'openrct2.data']) {
    const existing = await fs.readFile(`/src/build-framework/${name}`);
    const relinked = await fs.readFile(`/proof/applied/${name}`);
    let outputMetadataOnly = false;
    if (name === 'openrct2.js') {
      // Emscripten records the requested output directory in the local package
      // label and two dependency labels, not the remote package URL. Check
      // these exact three occurrences; all other generated JS must match.
      const text = relinked.toString();
      assert.equal(text.split('var PACKAGE_NAME="/proof/applied/openrct2.data"').length, 2);
      assert.equal(text.split('"datafile_/proof/applied/openrct2.data"').length, 3);
      const normalized = text.replace('var PACKAGE_NAME="/proof/applied/openrct2.data"', 'var PACKAGE_NAME="openrct2.data"')
        .replaceAll('"datafile_/proof/applied/openrct2.data"', '"datafile_openrct2.data"');
      assert.equal(normalized, existing.toString(), 'only isolated output metadata differs in JS');
      outputMetadataOnly = true;
    } else assert.equal(hash(relinked), hash(existing), `strict link preserves built ${name}`);
    artifacts.push({ name, bytes: existing.length, sha256: hash(existing), relinkedSha256: hash(relinked), outputMetadataOnly });
  }
  await fs.writeFile('/proof/report.json', JSON.stringify({ checkedAt: new Date().toISOString(), toolchain: image, records, artifacts,
    scope: 'Complete pre-fix/repaired native object sets from source trees differing only in the header completion guard, using identical full-link arguments and fatal warnings. A single old-object substitution did not reproduce the warning and is not used as the negative control. Generated outputs are isolated. This proves the link defect, not a gameplay crash or audible playback.' }, null, 2) + '\n');
} else {
  assert.ok(process.argv[2], 'supply a separately built complete pre-fix source tree');
  const baseline = path.resolve(process.argv[2]);
  const game = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const source = process.env.OPENRCT2_SOURCE_DIR || path.resolve(game, '../../.work/openrct2');
  async function inventory(root, relative = 'src') {
    const result = [];
    for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
      const name = path.join(relative, entry.name);
      if (entry.isDirectory()) result.push(...await inventory(root, name));
      else if (entry.isFile()) result.push([name, hash(await fs.readFile(path.join(root, name)))]);
      else assert.fail(`unexpected source entry: ${name}`);
    }
    return result.sort(([a], [b]) => a.localeCompare(b));
  }
  const before = await inventory(baseline), after = await inventory(source);
  assert.deepEqual(before.map(([name]) => name), after.map(([name]) => name));
  assert.deepEqual(after.filter((entry, index) => entry[1] !== before[index][1]).map(([name]) => name),
    ['src/openrct2/ride/RideAudio.h'], 'only callback return-type completion differs in native sources');
  assert.deepEqual(await fs.readFile(path.join(baseline, 'emscripten/deps.js')), await fs.readFile(path.join(source, 'emscripten/deps.js')));
  const runtimeAssets = process.env.OPENRCT2_RUNTIME_ASSETS || '/usr/share/openrct2';
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'openrct2-music-link-'));
  for (const variant of ['original', 'applied']) await fs.mkdir(path.join(scratch, variant));
  // As with the normal build, Emscripten may fetch its hash-pinned ports into
  // this disposable container's cache. Source, owner data and live services
  // are not written; both comparison links share the same resulting cache.
  const result = run('docker', ['run', '--rm', '--pull=never',
    '-v', `${source}:/src:ro`, '-v', `${baseline}:/baseline:ro`, '-v', `${scratch}:/proof`, '-v', `${runtimeAssets}:/runtime-assets:ro`,
    '-v', `${path.dirname(fileURLToPath(import.meta.url))}:/tests:ro`, '-w', '/src/build-framework',
    '--entrypoint', '/emsdk/node/22.16.0_64bit/bin/node', image, '/tests/test-ride-music-link.mjs', '--inside']);
  assert.equal(result.status, 0, `${result.stderr}\nScratch: ${scratch}`);
  const report = JSON.parse(await fs.readFile(path.join(scratch, 'report.json'), 'utf8'));
  if (process.argv[3]) await fs.writeFile(process.argv[3], JSON.stringify({ ...report, scratch }, null, 2) + '\n');
  console.log(`Ride-music strict full link: complete original objects reproduce fatal signature mismatch; applied objects link cleanly, preserve exact Wasm/data and change only three isolated output labels in JS. Evidence retained at ${scratch}`);
}
