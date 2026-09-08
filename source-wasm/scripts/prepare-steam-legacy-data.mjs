#!/usr/bin/env node
// Extract one coherent owner-supplied Steam build. The destination must be new.
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { crc32, openVpk } from './vpk-reader.mjs';
import { assertAllowedRel } from './source-data-policy.mjs';

const steam = path.resolve(process.env.HL2_STEAM_ROOT || '/home/ted/.steam/debian-installation/steamapps/common/Half-Life 2');
const destination = path.resolve(process.env.HL2_LEGACY_ROOT || '/home/ted/wasm-game-data/source/hl2-steam-legacy-loose');
const appManifest = process.env.HL2_APP_MANIFEST || path.join(steam, '..', '..', 'appmanifest_220.acf');
const repairRoot = process.env.HL2_VPK_REPAIR_ROOT ? path.resolve(process.env.HL2_VPK_REPAIR_ROOT) : null;
const manifest = readFileSync(appManifest, 'utf8');
if (!/"buildid"\s+"12694556"/.test(manifest) || !/"BetaKey"\s+"steam_legacy"/.test(manifest)) {
  throw new Error('owner Steam install must be steam_legacy build 12694556');
}
if (existsSync(destination)) throw new Error(`destination already exists; choose a new HL2_LEGACY_ROOT: ${destination}`);
if (destination === steam || destination.startsWith(`${steam}${path.sep}`)) throw new Error('destination must be outside the Steam install');
// SearchPaths in this build list these packs in descending priority. Extract
// in reverse order, after loose files, so the resulting tree has the same winners.
const packs = [
  'hl2/hl2_sound_vo_english_dir.vpk', 'hl2/hl2_pak_dir.vpk',
  'hl2/hl2_textures_dir.vpk', 'hl2/hl2_sound_misc_dir.vpk',
  'hl2/hl2_misc_dir.vpk', 'platform/platform_misc_dir.vpk'
];
for (const rel of packs) if (!existsSync(path.join(steam, rel))) throw new Error(`missing owner pack: ${rel}`);
mkdirSync(path.dirname(destination), { recursive: true });
const staging = mkdtempSync(path.join(path.dirname(destination), '.hl2-legacy-'));
const excludedDirs = new Set(['bin', 'custom', 'download', 'downloads', 'save', 'screenshots', 'workshop']);
function allowed(rel) {
  if (rel.split('/').some(part => part.startsWith('.') || excludedDirs.has(part.toLowerCase()))) return false;
  if (/\.(vpk|log|mdmp|dmp|dem|sav)$/i.test(rel)) return false;
  if (/\/(?:config|video|videodefaults)\.txt$/i.test(rel) || /\/cfg\/(?:config|autoexec|userconfig)\.cfg$/i.test(rel)) return false;
  try { assertAllowedRel(rel); return true; } catch { return false; }
}
let files = 0;
let packedBytes = 0;
let published = false;
const repairs = [];
function target(rel) {
  const out = path.join(staging, rel);
  mkdirSync(path.dirname(out), { recursive: true });
  return out;
}
function copyLoose(rel) {
  if (!allowed(rel)) return;
  const source = path.join(steam, rel);
  const stat = lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error(`symlink in owner input: ${rel}`);
  if (stat.isDirectory()) {
    for (const name of readdirSync(source).sort()) copyLoose(`${rel}/${name}`);
  } else if (stat.isFile()) {
    copyFileSync(source, target(rel));
    files += 1;
  }
}
try {
  copyLoose('hl2');
  copyLoose('platform');
  for (const rel of [...packs].reverse()) {
    const archive = openVpk(path.join(steam, rel));
    let count = 0;
    try {
      for (const entry of archive.entries) {
        const out = `${rel.split('/')[0]}/${entry.path}`;
        if (!allowed(out)) continue;
        let bytes;
        try { bytes = archive.read(entry); } catch (error) {
          if (error.code !== 'ERR_VPK_CRC' || !repairRoot) throw error;
          const repair = path.join(repairRoot, out);
          if (!existsSync(repair) || !lstatSync(repair).isFile()) throw error;
          bytes = readFileSync(repair);
          if (bytes.length !== entry.preload.length + entry.length || crc32(bytes) !== entry.crc) throw error;
          repairs.push({ path: out, source: repair, size: bytes.length,
            crc32: entry.crc.toString(16).padStart(8, '0'),
            sha256: createHash('sha256').update(bytes).digest('hex') });
          console.log(`${out}: restored from matching owner copy (length and CRC verified)`);
        }
        writeFileSync(target(out), bytes);
        packedBytes += bytes.length;
        count += 1;
      }
    } finally { archive.close(); }
    files += count;
    console.log(`${rel}: ${count} files verified and extracted`);
  }
  for (const rel of [
    'hl2/gameinfo.txt', 'hl2/steam.inf', 'hl2/maps/d1_trainstation_01.bsp',
    'hl2/scripts/surfaceproperties_manifest.txt', 'hl2/scripts/surfaceproperties.txt',
    'hl2/shaders/fxc/vertexlit_and_unlit_generic_vs20.vcs'
  ]) {
    if (!existsSync(path.join(staging, rel))) throw new Error(`incomplete legacy data: ${rel}`);
  }
  const shader = readFileSync(path.join(staging, 'hl2/shaders/fxc/vertexlit_and_unlit_generic_vs20.vcs'));
  if (shader.length < 4 || shader.readUInt32LE(0) !== 6) throw new Error('expected Steam legacy shader version 6');
  writeFileSync(path.join(staging, '.source-wasm-owner.json'), `${JSON.stringify({
    schema: 1, recipe: 'steam-legacy-loose-v1', steamRoot: steam,
    appId: 220, buildId: '12694556', beta: 'steam_legacy',
    packs, packedBytes, crcVerified: true, repairs
  }, null, 2)}\n`);
  renameSync(staging, destination);
  published = true;
  console.log(JSON.stringify({ destination, files, packedBytes, recipe: 'steam-legacy-loose-v1' }, null, 2));
} finally {
  if (!published) rmSync(staging, { recursive: true, force: true });
}
