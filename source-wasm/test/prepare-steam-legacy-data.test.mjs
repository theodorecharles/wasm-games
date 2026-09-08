import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeVpk } from './vpk-fixture.mjs';

const script = fileURLToPath(new URL('../scripts/prepare-steam-legacy-data.mjs', import.meta.url));
const packs = ['hl2/hl2_sound_vo_english_dir.vpk', 'hl2/hl2_pak_dir.vpk', 'hl2/hl2_textures_dir.vpk',
  'hl2/hl2_sound_misc_dir.vpk', 'hl2/hl2_misc_dir.vpk', 'platform/platform_misc_dir.vpk'];
const required = [
  { path: 'gameinfo.txt', bytes: 'GameInfo fixture' },
  { path: 'steam.inf', bytes: 'ClientVersion=fixture' },
  { path: 'maps/d1_trainstation_01.bsp', bytes: 'synthetic BSP payload', preloadLength: 4, archive: 2, padding: 7 },
  { path: 'scripts/surfaceproperties_manifest.txt', bytes: 'surface manifest' },
  { path: 'scripts/surfaceproperties.txt', bytes: 'surface properties' },
  { path: 'shaders/fxc/vertexlit_and_unlit_generic_vs20.vcs', bytes: Buffer.from([6, 0, 0, 0, 1, 2, 3, 4]) }
];
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'hl2-legacy-extract-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const steam = path.join(root, 'steam'), destination = path.join(root, 'published'), manifest = path.join(root, 'appmanifest_220.acf');
  mkdirSync(path.join(steam, 'hl2'), { recursive: true }); mkdirSync(path.join(steam, 'platform'));
  writeFileSync(manifest, '"AppState" { "appid" "220" "buildid" "12694556" "UserConfig" { "BetaKey" "steam_legacy" } }');
  const writePack = (rel, entries) => {
    const archive = makeVpk(entries), full = path.join(steam, rel);
    writeFileSync(full, archive.bytes);
    for (const [index, bytes] of archive.archives) writeFileSync(full.replace(/_dir\.vpk$/, `_${String(index).padStart(3, '0')}.vpk`), bytes);
  };
  for (const rel of packs) writePack(rel, rel === 'hl2/hl2_misc_dir.vpk' ? required : []);
  const loose = (rel, bytes) => { const full = path.join(steam, rel); mkdirSync(path.dirname(full), { recursive: true }); writeFileSync(full, bytes); };
  const run = (extra = {}) => spawnSync(process.execPath, [script], {
    env: { ...process.env, HL2_STEAM_ROOT: steam, HL2_LEGACY_ROOT: destination, HL2_APP_MANIFEST: manifest,
      HL2_VPK_REPAIR_ROOT: '', ...extra },
    encoding: 'utf8', timeout: 10000
  });
  return { root, steam, destination, manifest, writePack, loose, run };
}
function rejected(f, result, expected) {
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, expected);
  assert.equal(existsSync(f.destination), false, 'a failed extraction must never publish its destination');
  assert.deepEqual(readdirSync(f.root).filter(name => name.startsWith('.hl2-legacy-')), [], 'failed private staging must be removed');
}

test('complete six-pack CLI fixture preserves payloads and applies pack priority over loose files', t => {
  const f = fixture(t);
  f.loose('hl2/priority.txt', 'loose is lowest');
  f.loose('hl2/loose-only.txt', 'keep loose file');
  for (let i = 0; i < packs.length; i += 1) {
    f.writePack(packs[i], [
      ...(packs[i] === 'hl2/hl2_misc_dir.vpk' ? required : []),
      { path: 'priority.txt', bytes: `pack ${i}`, preloadLength: 2, archive: i, padding: 3 }
    ]);
  }
  const result = f.run(); assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(readFileSync(path.join(f.destination, 'hl2/priority.txt'), 'utf8'), 'pack 0');
  assert.equal(readFileSync(path.join(f.destination, 'platform/priority.txt'), 'utf8'), 'pack 5');
  assert.equal(readFileSync(path.join(f.destination, 'hl2/loose-only.txt'), 'utf8'), 'keep loose file');
  assert.equal(readFileSync(path.join(f.steam, 'hl2/priority.txt'), 'utf8'), 'loose is lowest');
  for (const entry of required) assert.deepEqual(readFileSync(path.join(f.destination, 'hl2', entry.path)), Buffer.from(entry.bytes));
  const proof = JSON.parse(readFileSync(path.join(f.destination, '.source-wasm-owner.json')));
  assert.equal(proof.recipe, 'steam-legacy-loose-v1'); assert.equal(proof.crcVerified, true);
  assert.equal(proof.buildId, '12694556'); assert.deepEqual(proof.packs, packs);
  assert.deepEqual(readdirSync(f.root).filter(name => name.startsWith('.hl2-legacy-')), []);
});
test('private configs, saves, logs, native binaries, hidden files and archives are excluded', t => {
  const f = fixture(t), excluded = [
    'hl2/.private.txt', 'hl2/bin/engine.dll', 'hl2/custom/content.txt', 'hl2/save/slot.sav',
    'hl2/screenshots/photo.png', 'hl2/workshop/item.txt', 'hl2/cfg/config.cfg', 'hl2/cfg/autoexec.cfg',
    'hl2/config.txt', 'hl2/video.txt', 'hl2/videodefaults.txt', 'hl2/console.log', 'hl2/glshaders.cfg'
  ];
  for (const rel of excluded) f.loose(rel, 'private fixture');
  f.writePack('hl2/hl2_pak_dir.vpk', [{ path: 'bin/engine.dll', bytes: 'native fixture' }, { path: 'cfg/default.cfg', bytes: 'required default' }]);
  const result = f.run(); assert.equal(result.status, 0, result.stderr);
  for (const rel of [...excluded, ...packs]) assert.equal(existsSync(path.join(f.destination, rel)), false, rel);
  assert.equal(readFileSync(path.join(f.destination, 'hl2/cfg/default.cfg'), 'utf8'), 'required default');
});
test('packed and loose TGA interface assets are retained while screenshot folders remain private', t => {
  const f = fixture(t), packed = Buffer.from([0, 0, 2, 0, 255, 128, 64]), loose = Buffer.from([0, 0, 2, 0, 32, 64, 96]);
  f.writePack('platform/platform_misc_dir.vpk', [
    { path: 'resource/icon.tga', bytes: packed, preloadLength: 3, archive: 1 },
    { path: 'screenshots/private.tga', bytes: 'private screenshot' }
  ]);
  f.loose('hl2/materials/ui/cursor.tga', loose);
  f.loose('hl2/screenshots/private.tga', 'private screenshot');
  const result = f.run(); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(path.join(f.destination, 'platform/resource/icon.tga')), packed);
  assert.deepEqual(readFileSync(path.join(f.destination, 'hl2/materials/ui/cursor.tga')), loose);
  for (const rel of ['hl2/screenshots/private.tga', 'platform/screenshots/private.tga']) {
    assert.equal(existsSync(path.join(f.destination, rel)), false, rel);
  }
});
test('existing destinations remain untouched and a destination inside Steam is refused', t => {
  for (const kind of ['directory', 'file', 'symlink']) {
    const f = fixture(t);
    if (kind === 'directory') { mkdirSync(f.destination); writeFileSync(path.join(f.destination, 'sentinel.txt'), 'preserve'); }
    if (kind === 'file') writeFileSync(f.destination, 'preserve');
    if (kind === 'symlink') symlinkSync(f.steam, f.destination);
    const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /destination already exists/);
    if (kind === 'directory') assert.equal(readFileSync(path.join(f.destination, 'sentinel.txt'), 'utf8'), 'preserve');
    if (kind === 'file') assert.equal(readFileSync(f.destination, 'utf8'), 'preserve');
  }
  const f = fixture(t), inside = path.join(f.steam, 'new-output');
  rejected(f, f.run({ HL2_LEGACY_ROOT: inside }), /outside the Steam install/);
  assert.equal(existsSync(inside), false);
});
test('wrong build or branch and missing source packs fail before staging', t => {
  for (const invalid of ['"buildid" "12694555" "BetaKey" "steam_legacy"', '"buildid" "12694556" "BetaKey" "public"']) {
    const f = fixture(t); writeFileSync(f.manifest, invalid); rejected(f, f.run(), /steam_legacy build 12694556/);
  }
  const f = fixture(t); rmSync(path.join(f.steam, packs[0])); rejected(f, f.run(), /missing owner pack/);
});
test('late CRC, archive truncation and unsafe paths abandon all staged output', t => {
  const crc = fixture(t); crc.writePack(packs[0], [{ path: 'sound/last.wav', bytes: 'bad audio', crc: 1 }]);
  rejected(crc, crc.run(), /CRC mismatch/);
  const truncated = fixture(t); truncated.writePack(packs[0], [{ path: 'sound/last.wav', bytes: 'full audio', archive: 1 }]);
  writeFileSync(path.join(truncated.steam, 'hl2/hl2_sound_vo_english_001.vpk'), 'short');
  rejected(truncated, truncated.run(), /truncated VPK archive/);
  const unsafe = fixture(t); unsafe.writePack(packs[0], [{ path: '../escape.txt', bytes: 'escape' }]);
  rejected(unsafe, unsafe.run(), /unsafe VPK path/); assert.equal(existsSync(path.join(unsafe.root, 'escape.txt')), false);
});
test('missing required map and wrong shader bytecode version prevent publication', t => {
  const missing = fixture(t); missing.writePack('hl2/hl2_misc_dir.vpk', required.filter(entry => !entry.path.endsWith('.bsp')));
  rejected(missing, missing.run(), /incomplete legacy data/);
  const shader = fixture(t); shader.writePack('hl2/hl2_misc_dir.vpk', required.map(entry => entry.path.endsWith('.vcs')
    ? { ...entry, bytes: Buffer.from([5, 0, 0, 0]) } : entry));
  rejected(shader, shader.run(), /shader.*(?:version|6)|version.*(?:shader|6)/i);
});
test('loose file and archive symlinks cannot copy outside owner files into publication', t => {
  for (const kind of ['loose', 'directory-archive', 'numbered-archive']) {
    const f = fixture(t), outside = path.join(f.root, 'outside.bin'); writeFileSync(outside, 'outside fixture');
    if (kind === 'loose') symlinkSync(outside, path.join(f.steam, 'hl2/foreign.txt'));
    if (kind === 'directory-archive') {
      rmSync(path.join(f.steam, packs[0])); symlinkSync(path.join(f.steam, packs[1]), path.join(f.steam, packs[0]));
    }
    if (kind === 'numbered-archive') {
      f.writePack(packs[0], [{ path: 'foreign.txt', bytes: 'outside fixture', archive: 1 }]);
      const full = path.join(f.steam, 'hl2/hl2_sound_vo_english_001.vpk'); rmSync(full); symlinkSync(outside, full);
    }
    rejected(f, f.run(), /symlink|regular file|symbolic/i);
    assert.equal(readFileSync(outside, 'utf8'), 'outside fixture');
  }
});

function damagedVoice(t) {
  const f = fixture(t), repair = path.join(f.root, 'repair'), relative = 'hl2/sound/voice.wav';
  mkdirSync(path.join(repair, 'hl2/sound'), { recursive: true });
  f.writePack(packs[0], [{ path: 'sound/voice.wav', bytes: '12X456789', preloadLength: 2, archive: 1, crc: 0xcbf43926 }]);
  return { ...f, repair, relative, replacement: path.join(repair, relative) };
}
test('opt-in repair accepts only full bytes matching original entry length and CRC and records provenance', t => {
  const f = damagedVoice(t), originalArchive = path.join(f.steam, 'hl2/hl2_sound_vo_english_001.vpk');
  const before = readFileSync(originalArchive); writeFileSync(f.replacement, '123456789');
  const result = f.run({ HL2_VPK_REPAIR_ROOT: f.repair }); assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(path.join(f.destination, f.relative), 'utf8'), '123456789');
  assert.deepEqual(readFileSync(originalArchive), before, 'repair must not rewrite the supplied VPK');
  const proof = JSON.parse(readFileSync(path.join(f.destination, '.source-wasm-owner.json')));
  assert.deepEqual(proof.repairs, [{ path: f.relative, source: f.replacement, size: 9, crc32: 'cbf43926',
    sha256: createHash('sha256').update('123456789').digest('hex') }]);
  assert.equal(proof.crcVerified, true);
});
test('repair is explicitly opt-in and wrong CRC, wrong length, missing and linked replacements fail closed', t => {
  const disabled = damagedVoice(t); writeFileSync(disabled.replacement, '123456789');
  rejected(disabled, disabled.run(), /CRC mismatch/);
  for (const kind of ['wrong-crc', 'wrong-length', 'missing', 'symlink']) {
    const f = damagedVoice(t);
    if (kind === 'wrong-crc') writeFileSync(f.replacement, '987654321');
    if (kind === 'wrong-length') {
      f.writePack(packs[0], [{ path: 'sound/voice.wav', bytes: '123456789', crc: 0 }]);
      writeFileSync(f.replacement, ''); // Correct expected CRC 0, but wrong declared entry length.
    }
    if (kind === 'symlink') {
      const outside = path.join(f.root, 'good-copy.wav'); writeFileSync(outside, '123456789'); symlinkSync(outside, f.replacement);
    }
    rejected(f, f.run({ HL2_VPK_REPAIR_ROOT: f.repair }), /CRC mismatch/);
  }
});
test('repair does not hide archive truncation or replace a valid VPK entry', t => {
  const truncated = damagedVoice(t); writeFileSync(truncated.replacement, '123456789');
  writeFileSync(path.join(truncated.steam, 'hl2/hl2_sound_vo_english_001.vpk'), 'short');
  rejected(truncated, truncated.run({ HL2_VPK_REPAIR_ROOT: truncated.repair }), /truncated VPK archive/);
  const valid = damagedVoice(t); writeFileSync(valid.replacement, 'wrong repair');
  valid.writePack(packs[0], [{ path: 'sound/voice.wav', bytes: '123456789', crc: 0xcbf43926 }]);
  const result = valid.run({ HL2_VPK_REPAIR_ROOT: valid.repair }); assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(path.join(valid.destination, valid.relative), 'utf8'), '123456789');
  assert.deepEqual(JSON.parse(readFileSync(path.join(valid.destination, '.source-wasm-owner.json'))).repairs, []);
});
