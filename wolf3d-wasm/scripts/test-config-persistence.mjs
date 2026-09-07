#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stageNativeKeyHeaders } from './native-key-headers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.env.WOLF4SDL_SOURCE_DIR || path.join(root, '.work/wolf4sdl');
const read = file => fs.readFileSync(path.join(source, file), 'utf8');
const main = read('wl_main.cpp'), menu = read('wl_menu.cpp'), play = read('wl_play.cpp');
function extract(text, name) {
  const match = new RegExp('(?:static boolean|static void|void)\\s+' + name + '\\s*\\([^;{}]*\\)\\s*\\{').exec(text);
  assert.ok(match, name); let end = match.index + match[0].length, depth = 1;
  for (; depth && end < text.length; end++) { if (text[end] === '{') depth++; else if (text[end] === '}') depth--; }
  assert.equal(depth, 0); return text.slice(match.index, end);
}
const versionStart = main.indexOf('static const uint32_t WolfWebConfigVersion'); assert.ok(versionStart >= 0);
const version = main.slice(versionStart, main.indexOf('\n#endif', versionStart));
const functions = ['ReadConfig', 'WriteConfig'].map(name => extract(main, name)).join('\n') + '\n' + extract(menu, 'SaveBrowserConfig');
const movement = extract(play, 'WolfWebHasKeyBinding') + '\n' + extract(play, 'PollKeyboardMove');
const score = read('id_us.h').match(/#define\s+MaxHighName[\s\S]*?} HighScore;/)?.[0];
const sounds = read('id_sd.h').match(/typedef enum[\s\S]*?} SDSMode;/)?.[0];
const buttons = read('wl_def.h').match(/enum\s*\{\s*bt_nobutton[\s\S]*?\n};/)?.[0];
assert.ok(score && sounds && buttons);
assert.equal((menu.match(/SaveBrowserConfig\(\);/g) || []).length, 9, 'all nine accepted menu changes must save before tab exit');
for (const pattern of [
  /if \(which >= 0\) SaveBrowserConfig\(\);/,
  /mouseenabled \^= 1;\s*SaveBrowserConfig\(\);/,
  /joystickenabled \^= 1;\s*SaveBrowserConfig\(\);/,
  /buttonscan\[order\[which\]\] = LastScan;\s*SaveBrowserConfig\(\);/,
  /dirscan\[moveorder\[which\]\] = LastScan;\s*SaveBrowserConfig\(\);/,
  /NewViewSize \(newview\);\s*SaveBrowserConfig\(\);/
]) assert.match(menu, pattern);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'wolf-config-io-'));
const report = { at: new Date().toISOString(), scope: 'Exact production config read/write/menu-save and movement functions with real SDK key constants and packed native record types, using temporary POSIX files under host UBSan. Not browser IndexedDB or visual menu acceptance.', results: {} };
try {
  const headers = stageNativeKeyHeaders(temporary); report.sdkHeaderHashes = headers.hashes;
  const types = '#pragma pack(push, 1)\n' + score + '\n#pragma pack(pop)\n' + sounds + '\n' + buttons;
  fs.writeFileSync(path.join(temporary, 'config-native-types.h'), types);
  for (const mode of ['wolf3d', 'spear', 'old-directions', 'no-menu-save']) {
    let declarations = version, implementation = functions;
    if (mode === 'old-directions') declarations = 'static const uint32_t WolfWebConfigVersion = 0x57424331u;\nstatic void WolfWebRestoreDirections(uint32_t) { dirscan[0]=sc_UpArrow; dirscan[1]=sc_RightArrow; dirscan[2]=sc_DownArrow; dirscan[3]=sc_LeftArrow; }';
    if (mode === 'no-menu-save') implementation = implementation.replace(extract(menu, 'SaveBrowserConfig'), 'static void SaveBrowserConfig() {}');
    fs.writeFileSync(path.join(temporary, 'config-production.h'), declarations + '\n' + implementation + '\n' + movement);
    const binary = path.join(temporary, mode), data = path.join(temporary, mode + '-data'); fs.mkdirSync(data);
    const build = spawnSync(process.env.CXX || 'c++', ['-std=c++17', '-O1', '-fsanitize=undefined', '-fno-sanitize-recover=all', '-DWOLF4SDL_WEB',
      ...(mode === 'spear' ? ['-DSPEAR'] : []), '-I', headers.sdk, '-I', temporary, path.join(root, 'tests/config-persistence.cpp'), '-o', binary], { encoding: 'utf8' });
    assert.equal(build.status, 0, build.stderr);
    const run = spawnSync(binary, [data], { encoding: 'utf8', timeout: 10000 }); assert.equal(run.signal, null, run.stderr);
    const cases = run.stdout.trim().split('\n').map(line => JSON.parse(line));
    const failures = cases.filter(item => !item.passed).length;
    assert.equal(run.status, ['wolf3d', 'spear'].includes(mode) ? 0 : 1, run.stderr + run.stdout);
    if (['wolf3d', 'spear'].includes(mode)) assert.equal(failures, 0); else assert.ok(failures > 0);
    report.results[mode] = { cases: cases.length, failures, checks: cases };
  }
  report.productionSha256 = createHash('sha256').update(types + version + functions + movement).digest('hex');
  if (process.env.WOLF_CONFIG_PROOF) fs.writeFileSync(process.env.WOLF_CONFIG_PROOF, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(Object.fromEntries(Object.entries(report.results).map(([mode, value]) => [mode, { cases: value.cases, failures: value.failures }]))));
} finally { fs.rmSync(temporary, { recursive: true }); }
