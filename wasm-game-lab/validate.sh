#!/usr/bin/env bash
set -euo pipefail

lab_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
mode="${1:-static}"
case "$mode" in
  static|--images) ;;
  *) printf 'usage: %s [--images]\n' "$0" >&2; exit 2 ;;
esac

LAB_DIR="$lab_dir" VALIDATE_IMAGES="$([[ "$mode" = --images ]] && printf 1 || printf 0)" node <<'NODE'
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');

const root = process.env.LAB_DIR;
const portfolio = path.dirname(root);
const games = JSON.parse(fs.readFileSync(path.join(root, 'games.json')));
const provenance = JSON.parse(fs.readFileSync(path.join(root, 'icon-provenance.json')));
const imageContractDocument = JSON.parse(fs.readFileSync(path.join(root, 'image-contracts.json')));
const imageContracts = imageContractDocument.services || {};
const errors = [];
const frameworkVersion = '0.9.1';
const frameworkCommit = '68bfbd1dbc0104084c7760e486b7437d4c7bb90e';

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function sha256(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

function resolveSource(value) {
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return path.resolve(root, value);
}

function isLaunchable(game) {
  return game.launchable !== false;
}

function normalizeRepository(value) {
  return String(value || '')
    .trim()
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\.git$/, '');
}

const composeText = cp.execFileSync('docker', ['compose', '-f', path.join(root, 'compose.yaml'), 'config', '--format', 'json'], { encoding: 'utf8' });
const compose = JSON.parse(composeText);
const services = compose.services || {};

const allowedStatuses = new Set(['Live', 'Still in development']);
const ids = new Set();
for (const game of games) {
  assert(!ids.has(game.id), `duplicate game id: ${game.id}`);
  ids.add(game.id);
  assert(allowedStatuses.has(game.status), `${game.id}: unsupported status ${JSON.stringify(game.status)}`);
  assert(game.id === 'wolfet' ? game.status === 'Live' : game.status === 'Still in development', `${game.id}: portfolio status is stale`);
  if (isLaunchable(game)) {
    assert(typeof game.service === 'string' && Boolean(services[game.service]), `${game.id}: compose service ${game.service} is missing`);
    assert(Number.isInteger(game.port), `${game.id}: runnable shortcut must declare an integer port`);
    assert(/^\/(?!\/)/.test(game.path), `${game.id}: path must be origin-relative`);
    assert(!/(localdata|devdata|mode=)/i.test(game.path), `${game.id}: legacy launcher query remains in ${game.path}`);
  } else {
    assert(game.launchable === false, `${game.id}: unavailable runtime must set launchable=false`);
    assert(game.status === 'Still in development', `${game.id}: unavailable runtime must remain in development`);
    assert(typeof game.runtimeNote === 'string' && /no .*runtime image exists yet/i.test(game.runtimeNote),
      `${game.id}: unavailable runtime must explain the missing image`);
    assert(!Object.hasOwn(game, 'service') && !Object.hasOwn(game, 'port') && !Object.hasOwn(game, 'path'),
      `${game.id}: unavailable runtime must not declare a service, port, or path`);
  }
  const icon = path.join(root, 'icons', game.icon);
  assert(fs.existsSync(icon), `${game.id}: icon ${game.icon} is missing`);

  const service = isLaunchable(game) ? services[game.service] : null;
  if (service) {
    const published = (service.ports || []).filter(entry => entry.protocol === 'tcp').map(entry => Number(entry.published));
    assert(published.includes(game.port), `${game.id}: port ${game.port} does not match compose service ${game.service}`);
  }
}
assert(games.length === 43, `expected 43 current portfolio shortcuts, found ${games.length}`);
assert(Object.keys(services).length === 29, `expected 29 current Compose services, found ${Object.keys(services).length}`);
assert(!games.some(game => /counter-strike.*source/i.test(game.title)), 'unsupported Counter-Strike: Source shortcut remains');

const expectedPortfolioEntries = {
  jill1: { variant: 'jill1', service: 'dosbox', port: 8016, path: '/?game=jill1' },
  jill2: { variant: 'jill2', service: 'dosbox', port: 8016, path: '/?game=jill2' },
  jill3: { variant: 'jill3', service: 'dosbox', port: 8016, path: '/?game=jill3' },
  jazz: { variant: 'jazz', service: 'jazz', port: 8020, path: '/' },
  duke1: { variant: 'duke1', service: 'duke1', port: 8021, path: '/' },
  duke2: { variant: 'duke2', service: 'duke2', port: 8022, path: '/' },
  gta: { variant: 'gta', service: 'gta', port: 8023, path: '/' },
  nfs: { variant: 'nfs', service: 'nfs', port: 8024, path: '/' },
  simcity2000: { variant: 'simcity2000', service: 'simcity2000', port: 8025, path: '/' },
  openrct2: { family: 'openrct2-wasm', variant: 'openrct2', service: 'openrct2', port: 8026, path: '/', icon: 'openrct2.ico' },
  spear: { variant: 'spear', service: 'spear', port: 8012, path: '/' },
  prey: { variant: 'prey', service: 'prey', port: 8087, path: '/' },
  nes: { family: 'emulation-wasm', variant: 'nes', icon: 'nes.svg', launchable: false },
  snes: { family: 'emulation-wasm', variant: 'snes', icon: 'snes.svg', launchable: false },
  ps1: { family: 'emulation-wasm', variant: 'ps1', icon: 'ps1.svg', launchable: false },
  ps2: { family: 'emulation-wasm', variant: 'ps2', icon: 'ps2.svg', launchable: false }
};
for (const [id, expected] of Object.entries(expectedPortfolioEntries)) {
  const game = games.find(entry => entry.id === id);
  assert(Boolean(game), `${id}: expected portfolio shortcut is missing`);
  if (!game) continue;
  for (const [key, value] of Object.entries(expected)) {
    assert(game[key] === value, `${id}: ${key} is ${JSON.stringify(game[key])}, expected ${JSON.stringify(value)}`);
  }
  assert(game.status === 'Still in development', `${id}: exact development status is missing`);
}

const expectedServicePorts = {
  blood: 8007,
  duke3d: 18007,
  idtech1: 8010,
  wolf3d: 8011,
  spear: 8012,
  cod2: 8014,
  dosbox: 8016,
  goldsource: 8017,
  source: 8019,
  jazz: 8020,
  duke1: 8021,
  duke2: 8022,
  gta: 8023,
  nfs: 8024,
  simcity2000: 8025,
  openrct2: 8026,
  quake1: 8081,
  quake2: 8082,
  quake3: 8083,
  quake4: 8084,
  'quake4-mp': 18084,
  'rtcw-sp': 8085,
  'rtcw-mp': 18085,
  doom3: 8086,
  'doom3-mp': 18086,
  roe: 18087,
  prey: 8087,
  wolfet: 8088
};
for (const [serviceName, expectedPort] of Object.entries(expectedServicePorts)) {
  const service = services[serviceName];
  assert(Boolean(service), `${serviceName}: expected service is missing`);
  if (!service) continue;
  const publishedTcpPorts = (service.ports || [])
    .filter(entry => entry.protocol === 'tcp')
    .map(entry => Number(entry.published));
  assert(publishedTcpPorts.length === 1 && publishedTcpPorts[0] === expectedPort,
    `${serviceName}: exact TCP port must be ${expectedPort}`);
}

const manifests = {
  'idtech1-wasm': ['../idtech1-wasm/web/wasm-game.json'],
  'idtech2-wasm': ['../idtech2-wasm/web/wasm-game.json'],
  'idtech3-wasm': [
    '../idtech3-wasm/games/quake3/site/wasm-game.json',
    '../idtech3-wasm/games/rtcw/site/wasm-game.json',
    '../idtech3-wasm/.sources/wolfet-wasm/web/wasm-game.json'
  ],
  'idtech4-wasm': ['../idtech4-wasm/site/wasm-game.json'],
  'build-wasm': ['../build-wasm/web/wasm-game.json'],
  'dosbox-wasm': ['../dosbox-wasm/web/wasm-game.json'],
  'goldsource-wasm': ['../goldsource-wasm/web/wasm-game.json'],
  'source-wasm': ['../source-wasm/web/wasm-game.json'],
  'cod2-wasm': ['../cod2-wasm/site/wasm-game.json'],
  'emulation-wasm': ['../emulation-wasm/web/wasm-game.json'],
  'openrct2-wasm': ['../openrct2-wasm/web/wasm-game.json'],
  'wolf3d-wasm': ['../wolf3d-wasm/web/wasm-game.json']
};
const effectiveVariants = new Map();
for (const [family, manifestRelatives] of Object.entries(manifests)) {
  const variants = new Map();
  for (const manifestRelative of manifestRelatives) {
    const manifestPath = path.resolve(root, manifestRelative);
    assert(fs.existsSync(manifestPath), `${family}: canonical manifest is missing: ${manifestRelative}`);
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath));
    const declarations = manifest.variants && Object.keys(manifest.variants).length
      ? Object.entries(manifest.variants)
      : [[manifest.id, {}]];
    for (const [variant, declaration] of declarations) {
      assert(!variants.has(variant), `${family}: duplicate canonical variant ${variant}`);
      const effective = {
        controller: Object.hasOwn(declaration, 'controller') ? declaration.controller : manifest.controller,
        persistence: Object.hasOwn(declaration, 'persistence') ? declaration.persistence : manifest.persistence,
        runtimeReady: Object.hasOwn(declaration, 'runtimeReady') ? declaration.runtimeReady : manifest.runtimeReady
      };
      variants.set(variant, effective);
      effectiveVariants.set(`${family}:${variant}`, effective);
    }
  }
  for (const game of games.filter(entry => entry.family === family)) {
    assert(variants.has(game.variant), `${game.id}: ${game.variant} is not declared by ${family}`);
  }
}
for (const game of games) assert(Boolean(manifests[game.family]), `${game.id}: unknown family ${game.family}`);

const allowedControllerModes = new Set(['disabled', 'wasdMouse', 'custom']);
const persistenceRoots = new Map();
for (const game of games) {
  const effective = effectiveVariants.get(`${game.family}:${game.variant}`);
  if (!effective) continue;
  assert(effective.controller && typeof effective.controller === 'object' && !Array.isArray(effective.controller),
    `${game.id}: effective variant has no explicit controller contract`);
  if (effective.controller && typeof effective.controller === 'object') {
    assert(allowedControllerModes.has(effective.controller.mode),
      `${game.id}: effective controller mode ${JSON.stringify(effective.controller.mode)} is invalid`);
  }
  const persistence = effective.persistence;
  assert(persistence === false || (persistence && typeof persistence === 'object' && !Array.isArray(persistence)),
    `${game.id}: effective variant has no explicit persistence contract`);
  if (persistence && typeof persistence === 'object' && !Array.isArray(persistence)) {
    const resolvedRoot = String(persistence.root || '').replaceAll('{variant}', game.variant);
    assert(/^\/(?!\/)/.test(resolvedRoot) && !resolvedRoot.split('/').includes('..'),
      `${game.id}: effective persistence root is invalid: ${JSON.stringify(resolvedRoot)}`);
    const previous = persistenceRoots.get(resolvedRoot);
    assert(!previous, `${game.id}: effective persistence root ${resolvedRoot} collides with ${previous}`);
    if (!previous) persistenceRoots.set(resolvedRoot, game.id);
  }
  assert(isLaunchable(game) ? effective.runtimeReady !== false : effective.runtimeReady === false,
    `${game.id}: runtimeReady does not match its launcher availability`);
}

const gameServices = new Set(games.filter(isLaunchable).map(game => game.service));
const contractServices = new Set(Object.keys(imageContracts));
assert(contractServices.size === 28, `expected 28 image contracts, found ${contractServices.size}`);
for (const serviceName of gameServices) assert(contractServices.has(serviceName), `${serviceName}: image contract is missing`);
for (const serviceName of contractServices) assert(gameServices.has(serviceName), `${serviceName}: image contract has no portfolio shortcut`);
for (const [serviceName, contract] of Object.entries(imageContracts)) {
  const service = services[serviceName];
  assert(Boolean(service), `${serviceName}: contracted Compose service is missing`);
  if (!service) continue;
  assert(service.image === contract.image, `${serviceName}: Compose image ${service.image} does not match canonical ${contract.image}`);
  const sourcePath = resolveSource(contract.source);
  assert(fs.existsSync(sourcePath), `${serviceName}: canonical source repository is missing: ${contract.source}`);
  if (fs.existsSync(sourcePath)) {
    let origin = '';
    try {
      origin = cp.execFileSync('git', ['-C', sourcePath, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
    } catch (_) {
      errors.push(`${serviceName}: cannot read canonical source origin: ${contract.source}`);
    }
    assert(normalizeRepository(origin) === normalizeRepository(contract.repository),
      `${serviceName}: source origin ${origin || 'unknown'} does not match ${contract.repository}`);
    if (contract.revision) {
      let revision = '';
      try {
        revision = cp.execFileSync('git', ['-C', sourcePath, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      } catch (_) {}
      let acceptedRevision = revision === contract.revision;
      if (!acceptedRevision) {
        try {
          cp.execFileSync('git', ['-C', sourcePath, 'merge-base', '--is-ancestor', contract.revision, revision]);
          acceptedRevision = true;
        } catch (_) {}
      }
      assert(acceptedRevision,
        `${serviceName}: source revision ${revision || 'unknown'} does not contain accepted revision ${contract.revision}`);
    }
  }
}
assert(imageContractDocument.framework && imageContractDocument.framework.version === frameworkVersion,
  `image contracts must pin framework ${frameworkVersion}`);
assert(imageContractDocument.framework && imageContractDocument.framework.commit === frameworkCommit,
  `image contracts must pin framework commit ${frameworkCommit}`);
const frameworkPath = path.join(portfolio, 'wasm-game-framework');
let taggedFrameworkCommit = '';
try {
  taggedFrameworkCommit = cp.execFileSync('git', ['-C', frameworkPath, 'rev-parse', `v${frameworkVersion}^{commit}`], { encoding: 'utf8' }).trim();
} catch (_) {}
assert(taggedFrameworkCommit === frameworkCommit,
  `local framework tag v${frameworkVersion} does not resolve to ${frameworkCommit}`);
for (const contract of Object.values(imageContracts)) {
  const expected = contract.framework || imageContractDocument.framework;
  let resolved = '';
  try {
    resolved = cp.execFileSync('git', ['-C', frameworkPath, 'rev-parse', `v${expected.version}^{commit}`], { encoding: 'utf8' }).trim();
  } catch (_) {}
  assert(resolved === expected.commit,
    `local framework tag v${expected.version} does not resolve to ${expected.commit}`);
}

const provenanceByFile = new Map();
for (const entry of provenance) {
  assert(!provenanceByFile.has(entry.file), `duplicate icon provenance: ${entry.file}`);
  provenanceByFile.set(entry.file, entry);
  const iconPath = path.join(root, 'icons', entry.file);
  assert(fs.existsSync(iconPath), `inventoried icon is missing: ${entry.file}`);
  if (!fs.existsSync(iconPath)) continue;
  assert(sha256(iconPath) === entry.sha256, `${entry.file}: icon digest changed`);
  const sourcePath = resolveSource(entry.source);
  assert(fs.existsSync(sourcePath), `${entry.file}: provenance source is unavailable: ${entry.source}`);
  if (fs.existsSync(sourcePath)) assert(sha256(sourcePath) === entry.sha256, `${entry.file}: source digest does not match inventory`);
}
for (const icon of fs.readdirSync(path.join(root, 'icons')).sort()) {
  assert(provenanceByFile.has(icon), `icon lacks provenance: ${icon}`);
}
for (const game of games) {
  const entry = provenanceByFile.get(game.icon);
  assert(entry && entry.classification !== 'retired wrong placeholder', `${game.id}: portal references retired placeholder ${game.icon}`);
}

for (const [name, service] of Object.entries(services)) {
  for (const port of service.ports || []) assert(port.host_ip === '127.0.0.1', `${name}: published port is not loopback-only`);
  if (name === 'portal') continue;
  const volumes = service.volumes || [];
  assert(volumes.some(volume => volume.target === '/data' || volume.target.startsWith('/data/')), `${name}: no persistent /data bind exists`);
  for (const volume of volumes) assert(volume.target === '/data' || volume.target.startsWith('/data/'), `${name}: unexpected downstream bind ${volume.target}`);
}

if (process.env.VALIDATE_IMAGES === '1') {
  for (const [serviceName, contract] of Object.entries(imageContracts)) {
    const service = services[serviceName];
    if (!service) { errors.push(`${serviceName}: missing from compose`); continue; }
    let inspect;
    try {
      inspect = JSON.parse(cp.execFileSync('docker', ['image', 'inspect', service.image], { encoding: 'utf8' }))[0];
    } catch (_) {
      errors.push(`${serviceName}: image is not present: ${service.image}`);
      continue;
    }
    if (contract.imageId) {
      assert(inspect.Id === contract.imageId,
        `${serviceName}: ${service.image} image ID ${inspect.Id || 'unknown'} is not ${contract.imageId}`);
    }
    const env = new Map((inspect.Config.Env || []).map(value => {
      const index = value.indexOf('=');
      return [value.slice(0, index), value.slice(index + 1)];
    }));
    const sourcePath = resolveSource(contract.source);
    let expectedRevision = contract.revision || '';
    if (!expectedRevision && fs.existsSync(sourcePath)) {
      try {
        expectedRevision = cp.execFileSync('git', ['-C', sourcePath, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      } catch (_) {
        errors.push(`${serviceName}: cannot resolve source revision for image verification`);
      }
    }
    assert(Boolean(expectedRevision), `${serviceName}: image contract has no resolvable source revision`);
    const imageRevision = inspect.Config.Labels && inspect.Config.Labels['org.opencontainers.image.revision'];
    if (expectedRevision && imageRevision) {
      assert(imageRevision === expectedRevision,
        `${serviceName}: ${service.image} source revision ${imageRevision} is not ${expectedRevision}`);
    }
    if (contract.revision) {
      assert(imageRevision === expectedRevision,
        `${serviceName}: accepted downstream image must label source revision ${expectedRevision}`);
    }
    const expectedFramework = contract.framework || imageContractDocument.framework;
    assert(expectedFramework && typeof expectedFramework.version === 'string' && typeof expectedFramework.commit === 'string',
      `${serviceName}: exact framework contract is missing`);
    if (contract.metadata === 'framework-lock') {
      let lock = null;
      try {
        lock = contract.revision
          ? JSON.parse(cp.execFileSync('git', ['-C', sourcePath, 'show', `${contract.revision}:framework-lock.json`], { encoding: 'utf8' }))
          : JSON.parse(fs.readFileSync(resolveSource(contract.lockSource)));
      } catch (_) {
        errors.push(`${serviceName}: accepted framework lock cannot be read`);
      }
      if (lock) {
        const lockedFramework = lock.framework || lock;
        assert(lockedFramework.version === expectedFramework.version,
          `${serviceName}: framework lock version is not ${expectedFramework.version}`);
        assert(lockedFramework.commit === expectedFramework.commit,
          `${serviceName}: framework lock commit is not ${expectedFramework.commit}`);
      }
      assert(inspect.Architecture === 'amd64', `${serviceName}: accepted downstream image must be amd64`);
      continue;
    }
    assert(env.get('WASM_GAME_FRAMEWORK_VERSION') === expectedFramework.version,
      `${serviceName}: ${service.image} embeds framework ${env.get('WASM_GAME_FRAMEWORK_VERSION') || 'unknown'}, expected ${expectedFramework.version}`);
    assert(inspect.Config.Labels && inspect.Config.Labels['io.wasm-game-framework.version'] === expectedFramework.version,
      `${serviceName}: ${service.image} framework OCI label is not ${expectedFramework.version}`);
    if (contract.variant) assert(env.get('WASM_GAME_VARIANT') === contract.variant,
      `${serviceName}: ${service.image} variant ${env.get('WASM_GAME_VARIANT') || 'unknown'}, expected ${contract.variant}`);
  }
}

if (errors.length) {
  for (const error of errors) console.error(`FAIL: ${error}`);
  process.exit(1);
}
console.log(`validated ${games.length} shortcuts (${gameServices.size} runnable endpoints), ${Object.keys(services).length} Compose services, ${contractServices.size} runtime image contracts, and ${provenance.length} inventoried icons${process.env.VALIDATE_IMAGES === '1' ? ' against local images' : ''}`);
NODE
