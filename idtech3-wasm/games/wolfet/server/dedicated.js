'use strict';

const { spawn, execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { MATCH_SLOTS } = require('./botfill');
const gameMode = require('./mode');

const ROOT = path.join(__dirname, '..');
const DATA_ROOT = path.resolve(process.env.ETJS_DATA_ROOT || ROOT);
const RUNTIME_ROOT = path.join(DATA_ROOT, 'runtime');
const RUNTIME_ETMAIN = path.join(RUNTIME_ROOT, 'etmain');
const SERVER_MOD = path.join(RUNTIME_ROOT, 'legacy', 'qagame.mp.x86_64.so');
const ETJS_PAK = path.join(RUNTIME_ROOT, 'legacy', 'etjs.pk3');
const OMNIBOT_CFG = path.join(RUNTIME_ROOT, 'omni-bot-user', 'omni-bot.cfg');
const EMBEDDED = process.env.ETJS_EMBEDDED_DED === '1';
const EMBEDDED_BIN = process.env.ETJS_DED_BIN || path.join(ROOT, 'bin', 'etlded');
const OMNIBOT_ENABLED = process.env.ETJS_OMNIBOT !== '0';
const IMAGE = process.env.ETJS_DED_IMAGE ||
  'etlegacy/server@sha256:e8810511b59a70cd66ddf36951cbb873333c4081d236241343e19ee4a0a30d63';
const CONTAINER = process.env.ETJS_DED_CONTAINER || 'etjs-dedicated';
const RCON_FILE = path.join(RUNTIME_ROOT, '.rcon-password');
const DATA_FETCHER = path.join(ROOT, 'scripts', 'fetch-game-data.sh');
const CUSTOM_MAPS_DIR = path.join(DATA_ROOT, 'custom_maps');
const OBJECTIVE_ROTATION_FILE = path.join(RUNTIME_ETMAIN, 'objectiverotate.cfg');
const LAST_START_MAP_FILE = path.join(RUNTIME_ROOT, '.last-start-map');
const BASE_OBJECTIVE_MAPS = Object.freeze([
  'oasis', 'battery', 'goldrush', 'radar', 'railgun', 'fueldump'
]);
const RESERVED_ETMAIN_PAKS = new Set(['pak0.pk3', 'pak1.pk3', 'pak2.pk3', 'mp_bin.pk3']);
let activeCustomAssets = [];
let activeObjectiveMaps = BASE_OBJECTIVE_MAPS.slice();

/** Host UDP port the website / proxy / status queries talk to. */
const HOST_UDP_PORT = Number(process.env.ETJS_DED_PORT || 27961);
/** Container-internal dedicated port. */
const CONTAINER_UDP_PORT = 27960;
let embeddedProcess = null;

function readOrCreateRconPassword() {
  if (process.env.ETJS_RCON) {
    return process.env.ETJS_RCON;
  }

  try {
    const existing = fs.readFileSync(RCON_FILE, 'utf8').trim();
    if (existing.length >= 16) {
      return existing;
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  fs.mkdirSync(path.dirname(RCON_FILE), { recursive: true });
  const generated = crypto.randomBytes(24).toString('hex');
  try {
    fs.writeFileSync(RCON_FILE, generated + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    return generated;
  } catch (err) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
    const raced = fs.readFileSync(RCON_FILE, 'utf8').trim();
    if (raced.length < 16) {
      throw new Error('invalid RCON password file: ' + RCON_FILE);
    }
    return raced;
  }
}

const RCON_PASSWORD = readOrCreateRconPassword();
const SERVER_MOD_HASH = fs.existsSync(SERVER_MOD)
  ? crypto.createHash('sha256').update(fs.readFileSync(SERVER_MOD)).digest('hex')
  : 'missing';
const ETJS_PAK_HASH = fs.existsSync(ETJS_PAK)
  ? crypto.createHash('sha256').update(fs.readFileSync(ETJS_PAK)).digest('hex')
  : 'missing';
const CONFIG_LABEL = crypto.createHash('sha256')
  .update(IMAGE + '\0' + RCON_PASSWORD + '\0' + SERVER_MOD_HASH + '\0' + ETJS_PAK_HASH +
    '\0' + MATCH_SLOTS + '\0' + gameMode.MODE)
  .digest('hex');

const DEFAULT_ARGS = [
  '+set', 'fs_homepath', EMBEDDED ? RUNTIME_ROOT : '/legacy/homepath',
  '+set', 'dedicated', '1',
  '+set', 'sv_advert', '0',
  '+set', 'net_port', String(EMBEDDED ? HOST_UDP_PORT : CONTAINER_UDP_PORT),
  /* Keep one connection transition slot above the maintained population so a
   * human can join before the supervisor removes the bot they replace. */
  '+set', 'sv_maxclients', String(MATCH_SLOTS + 1),
  '+set', 'sv_privateclients', '0',
  '+set', 'sv_hostname', 'wolfet-wasm Shared Match',
  '+set', 'sv_pure', '0',
  '+set', 'sv_tempbantime', '0',
  '+set', 'sv_allowDownload', '1',
  '+set', 'g_friendlyFire', '0',
  '+set', 'g_gametype', '2',
  '+set', 'g_heavyWeaponRestriction', '100',
  '+set', 'g_etjsArcade', gameMode.ARCADE ? '1' : '0',
  '+set', 'g_speed', String(gameMode.GAME_SPEED),
  '+set', 'g_bluelimbotime', '1000',
  '+set', 'g_redlimbotime', '1000',
  /* Automatically enter the reinforcement queue after death. Without this,
   * ET keeps displaying the one-second wave while waiting for a manual tapout. */
  '+set', 'g_forcerespawn', '1',
  '+set', 'omnibot_enable', OMNIBOT_ENABLED ? '1' : '0',
  '+set', 'omnibot_path', EMBEDDED ? '/legacy/server/legacy/omni-bot' : './legacy/omni-bot',
  '+set', 'omnibot_flags', '0',
  '+set', 'g_xpSaver', '15',
  '+set', 'g_xpSaverMaxAge', '604800',
  '+set', 'rconpassword', RCON_PASSWORD,
  '+set', 'logfile', '2',
  '+set', 'com_hunkMegs', '128'
];

const POST_MAP_ARGS = [
  /* legacy's defaultpublic config is loaded during map init and resets speed. */
  '+set', 'g_etjsArcade', gameMode.ARCADE ? '1' : '0',
  '+set', 'g_speed', String(gameMode.GAME_SPEED),
  '+set', 'g_friendlyFire', '0',
  '+set', 'g_forcerespawn', '1'
];

function assertOfficialPaks() {
  const required = ['pak0.pk3', 'pak1.pk3', 'pak2.pk3'];
  const missing = required.filter((name) => !fs.existsSync(path.join(RUNTIME_ETMAIN, name)));
  if (missing.length) {
    throw new Error('official ET paks missing from ' + RUNTIME_ETMAIN + ': ' + missing.join(', '));
  }
}

function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead > 0) {
        hash.update(buffer.subarray(0, bytesRead));
      }
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function isInside(parent, candidate) {
  const rel = path.relative(path.resolve(parent), path.resolve(candidate));
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}

function mapsInPk3(pk3Path) {
  let listing;
  try {
    listing = execFileSync('unzip', ['-Z1', pk3Path], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024
    });
  } catch (err) {
    throw new Error('cannot read custom map PK3 ' + path.basename(pk3Path) + ': ' + err.message);
  }
  const maps = [];
  String(listing).split(/\r?\n/).forEach((entry) => {
    const match = /^maps\/([A-Za-z0-9_-]+)\.bsp$/i.exec(entry.trim());
    if (match) {
      maps.push(match[1]);
    }
  });
  return maps;
}

function rotationForMaps(mapNames) {
  const seen = new Set();
  const maps = [];
  (mapNames || []).forEach((mapName) => {
    const map = String(mapName || '').trim();
    const key = map.toLowerCase();
    if (/^[A-Za-z0-9_-]+$/.test(map) && !seen.has(key)) {
      seen.add(key);
      maps.push(map);
    }
  });
  const lines = maps.map((map, index) => {
    const current = index + 1;
    const next = current === maps.length ? 1 : current + 1;
    return 'set d' + current + ' "set g_gametype 2 ; map ' + map +
      ' ; set nextmap vstr d' + next + '"';
  });
  /* This fallback is replaced by the selected dN command at server start. */
  lines.push('set nextmap "vstr d' + (maps.length > 1 ? 2 : 1) + '"');
  return { maps: maps, text: lines.join('\n') + '\n' };
}

function objectiveRotation(customMaps) {
  return rotationForMaps(BASE_OBJECTIVE_MAPS.concat(customMaps || []));
}

function writeFileIfChanged(filePath, contents) {
  try {
    if (fs.readFileSync(filePath, 'utf8') === contents) {
      return;
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = filePath + '.tmp-' + process.pid;
  fs.writeFileSync(temp, contents, { encoding: 'utf8', mode: 0o644 });
  fs.renameSync(temp, filePath);
}

/**
 * Mount operator-provided PK3s into etmain, discover maps/*.bsp entries, and
 * append those maps to the stock Objective rotation. Supporting PK3s without a
 * BSP are still published so browsers receive all dependencies.
 */
function prepareCustomMaps(options) {
  const opts = options || {};
  const customMapsDir = path.resolve(opts.customMapsDir || CUSTOM_MAPS_DIR);
  const etmainDir = path.resolve(opts.etmainDir || RUNTIME_ETMAIN);
  const rotationFile = path.resolve(opts.rotationFile || path.join(etmainDir, 'objectiverotate.cfg'));
  fs.mkdirSync(customMapsDir, { recursive: true });
  fs.mkdirSync(etmainDir, { recursive: true });

  const names = fs.readdirSync(customMapsDir)
    .filter((name) => /^[A-Za-z0-9][A-Za-z0-9_.-]*\.pk3$/i.test(name))
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  const activeDestinations = new Set();
  const assets = [];
  const customMapNames = [];

  names.forEach((name) => {
    if (RESERVED_ETMAIN_PAKS.has(name.toLowerCase())) {
      throw new Error('custom map PK3 uses a reserved filename: ' + name);
    }
    const source = path.join(customMapsDir, name);
    const sourceStat = fs.statSync(source);
    if (!sourceStat.isFile()) {
      return;
    }
    const destination = path.join(etmainDir, name);
    activeDestinations.add(destination);
    try {
      const existing = fs.lstatSync(destination);
      if (!existing.isSymbolicLink()) {
        throw new Error('custom map destination already exists and is not managed: ' + destination);
      }
      const target = path.resolve(etmainDir, fs.readlinkSync(destination));
      if (target !== source) {
        if (!isInside(customMapsDir, target)) {
          throw new Error('refusing to replace unmanaged symlink: ' + destination);
        }
        fs.unlinkSync(destination);
        fs.symlinkSync(path.relative(etmainDir, source), destination);
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        fs.symlinkSync(path.relative(etmainDir, source), destination);
      } else {
        throw err;
      }
    }

    const hash = hashFile(source);
    assets.push({
      parent: '/etmain',
      name: name,
      filePath: destination,
      bytes: sourceStat.size,
      hash: hash
    });
    mapsInPk3(source).forEach((mapName) => customMapNames.push(mapName));
  });

  fs.readdirSync(etmainDir).forEach((name) => {
    const destination = path.join(etmainDir, name);
    let stat;
    try {
      stat = fs.lstatSync(destination);
    } catch (err) {
      return;
    }
    if (!stat.isSymbolicLink()) {
      return;
    }
    const target = path.resolve(etmainDir, fs.readlinkSync(destination));
    if (isInside(customMapsDir, target) && !activeDestinations.has(destination)) {
      fs.unlinkSync(destination);
    }
  });

  const rotation = objectiveRotation(customMapNames);
  writeFileIfChanged(rotationFile, rotation.text);
  const result = { assets: assets, maps: rotation.maps, rotationFile: rotationFile };
  if (!options) {
    activeCustomAssets = assets;
    activeObjectiveMaps = rotation.maps;
  }
  return result;
}

function customGameAssets() {
  return activeCustomAssets.slice();
}

function objectiveMaps() {
  return activeObjectiveMaps.slice();
}

/** Remove a custom map that made the dedicated process fail during startup. */
function disableObjectiveMap(mapName) {
  const key = String(mapName || '').toLowerCase();
  if (!key || BASE_OBJECTIVE_MAPS.some((name) => name.toLowerCase() === key)) {
    return false;
  }
  const remaining = activeObjectiveMaps.filter((name) => name.toLowerCase() !== key);
  if (remaining.length === activeObjectiveMaps.length || !remaining.length) {
    return false;
  }
  const rotation = rotationForMaps(remaining);
  writeFileIfChanged(OBJECTIVE_ROTATION_FILE, rotation.text);
  activeObjectiveMaps = rotation.maps;
  return true;
}

/** Pick a rotation map without immediately repeating the previous start. */
function chooseStartMap(options) {
  const opts = options || {};
  const maps = (opts.maps || objectiveMaps()).slice();
  const stateFile = opts.stateFile || LAST_START_MAP_FILE;
  const randomInt = opts.randomInt || crypto.randomInt;
  if (!maps.length) {
    throw new Error('cannot start dedicated server without an Objective map');
  }

  let previous = '';
  try {
    previous = fs.readFileSync(stateFile, 'utf8').trim().toLowerCase();
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
  const choices = maps.length > 1
    ? maps.filter((map) => map.toLowerCase() !== previous)
    : maps;
  const selected = choices[randomInt(choices.length)];
  writeFileIfChanged(stateFile, selected + '\n');
  return selected;
}

function launchArgs(startMap) {
  const maps = objectiveMaps();
  const requested = String(startMap || maps[0] || '').toLowerCase();
  let index = maps.findIndex((map) => map.toLowerCase() === requested);
  if (index < 0) {
    index = 0;
  }
  return DEFAULT_ARGS.concat([
    '+exec', 'objectiverotate.cfg',
    '+vstr', 'd' + (index + 1)
  ], POST_MAP_ARGS);
}

/**
 * Validate/provision the host's ignored game-data cache. The fetch script uses
 * pinned SHA-256 sums and only contacts Splash Damage when an official file is
 * missing or invalid. Browsers never use that upstream URL; they download the
 * resulting files from this ETJS host under /etmain and /legacy.
 */
function ensureGameData() {
  execFileSync('sh', [DATA_FETCHER], {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit'
  });
  assertOfficialPaks();
  return prepareCustomMaps();
}

function assertServerMod() {
  if (!fs.existsSync(SERVER_MOD)) {
    throw new Error('ETJS server game module missing; run: npm run build:server-mod');
  }
  if (!fs.existsSync(ETJS_PAK)) {
    throw new Error('ETJS data pak missing; run: npm run build:pak');
  }
}

function dockerAvailable() {
  if (EMBEDDED) {
    return true;
  }
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore' });
    return true;
  } catch (err) {
    return false;
  }
}

function containerRunning() {
  if (EMBEDDED) {
    return !!embeddedProcess && embeddedProcess.exitCode === null && !embeddedProcess.killed;
  }
  try {
    const out = execFileSync('docker', ['inspect', '-f', '{{.State.Running}}', CONTAINER], {
      encoding: 'utf8'
    }).trim();
    return out === 'true';
  } catch (err) {
    return false;
  }
}

function containerConfigured() {
  if (EMBEDDED) {
    return containerRunning();
  }
  try {
    const out = execFileSync('docker', [
      'inspect', '-f', '{{ index .Config.Labels "net.etjs.config" }}', CONTAINER
    ], { encoding: 'utf8' }).trim();
    return out === CONFIG_LABEL;
  } catch (err) {
    return false;
  }
}

function stopDedicated() {
  if (EMBEDDED) {
    if (embeddedProcess && embeddedProcess.exitCode === null) {
      embeddedProcess.kill('SIGTERM');
    }
    return;
  }
  try {
    execFileSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' });
  } catch (err) {
    /* not running */
  }
}

function waitForDedicatedStopped(timeoutMs) {
  if (!EMBEDDED || !embeddedProcess || embeddedProcess.exitCode !== null) {
    return Promise.resolve();
  }
  const child = embeddedProcess;
  return new Promise((resolve, reject) => {
    let timer = null;
    const done = () => {
      if (timer) {
        clearTimeout(timer);
      }
      resolve();
    };
    child.once('exit', done);
    timer = setTimeout(() => {
      child.removeListener('exit', done);
      try { child.kill('SIGKILL'); } catch (err) { /* already exited */ }
      reject(new Error('dedicated server did not stop within ' + (timeoutMs || 10000) + 'ms'));
    }, timeoutMs || 10000);
  });
}

/**
 * Start the one shared dedicated match (etlegacy + official paks + Omni-Bot).
 * Returns a handle with .kill().
 */
function startDedicated(opts) {
  assertOfficialPaks();
  assertServerMod();
  if (EMBEDDED && !fs.existsSync(EMBEDDED_BIN)) {
    throw new Error('embedded ET: Legacy server missing: ' + EMBEDDED_BIN);
  }
  if (!dockerAvailable()) {
    throw new Error('docker is required to start etlegacy/server');
  }

  const extra = (opts && opts.args) || [];
  const argsForGame = launchArgs(opts && opts.map).concat(extra);
  if (EMBEDDED) {
    if (embeddedProcess && embeddedProcess.exitCode === null) {
      throw new Error('embedded dedicated server is already running or stopping');
    }
    const child = spawn(EMBEDDED_BIN, argsForGame, {
      cwd: RUNTIME_ROOT,
      stdio: ['ignore', 'inherit', 'inherit']
    });
    embeddedProcess = child;
    child.on('exit', () => {
      if (embeddedProcess === child) {
        embeddedProcess = null;
      }
    });
    return {
      container: null,
      hostPort: HOST_UDP_PORT,
      kill: stopDedicated
    };
  }

  stopDedicated();

  const args = [
    'run',
    '--name', CONTAINER,
    '--rm',
    '-d',
    '--label', 'net.etjs.config=' + CONFIG_LABEL,
    '-v', RUNTIME_ETMAIN + ':/legacy/server/etmain',
    '-v', OMNIBOT_CFG + ':/legacy/server/legacy/omni-bot/et/user/omni-bot.cfg',
    '-v', path.join(RUNTIME_ROOT, 'legacy') + ':/legacy/homepath/legacy',
    '--user', '0',
    '-p', HOST_UDP_PORT + ':' + CONTAINER_UDP_PORT + '/udp',
    '-w', '/legacy/server',
    '--entrypoint', './etlded',
    IMAGE
  ].concat(argsForGame);

  execFileSync('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  return {
    container: CONTAINER,
    hostPort: HOST_UDP_PORT,
    kill: stopDedicated
  };
}

function followLogs(logStream) {
  const child = spawn('docker', ['logs', '-f', CONTAINER], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (logStream) {
    child.stdout.pipe(logStream, { end: false });
    child.stderr.pipe(logStream, { end: false });
  }
  return child;
}

module.exports = {
  ROOT: ROOT,
  DATA_ROOT: DATA_ROOT,
  RUNTIME_ROOT: RUNTIME_ROOT,
  RUNTIME_ETMAIN: RUNTIME_ETMAIN,
  SERVER_MOD: SERVER_MOD,
  ETJS_PAK: ETJS_PAK,
  CUSTOM_MAPS_DIR: CUSTOM_MAPS_DIR,
  OBJECTIVE_ROTATION_FILE: OBJECTIVE_ROTATION_FILE,
  LAST_START_MAP_FILE: LAST_START_MAP_FILE,
  BASE_OBJECTIVE_MAPS: BASE_OBJECTIVE_MAPS,
  IMAGE: IMAGE,
  CONTAINER: CONTAINER,
  HOST_UDP_PORT: HOST_UDP_PORT,
  CONTAINER_UDP_PORT: CONTAINER_UDP_PORT,
  RCON_PASSWORD: RCON_PASSWORD,
  RCON_FILE: RCON_FILE,
  DATA_FETCHER: DATA_FETCHER,
  EMBEDDED: EMBEDDED,
  EMBEDDED_BIN: EMBEDDED_BIN,
  OMNIBOT_ENABLED: OMNIBOT_ENABLED,
  CONFIG_LABEL: CONFIG_LABEL,
  SERVER_MOD_HASH: SERVER_MOD_HASH,
  ETJS_PAK_HASH: ETJS_PAK_HASH,
  DEFAULT_ARGS: DEFAULT_ARGS,
  POST_MAP_ARGS: POST_MAP_ARGS,
  MATCH_SLOTS: MATCH_SLOTS,
  MODE: gameMode.MODE,
  ARCADE_MODE: gameMode.ARCADE,
  assertOfficialPaks: assertOfficialPaks,
  ensureGameData: ensureGameData,
  mapsInPk3: mapsInPk3,
  objectiveRotation: objectiveRotation,
  prepareCustomMaps: prepareCustomMaps,
  customGameAssets: customGameAssets,
  objectiveMaps: objectiveMaps,
  disableObjectiveMap: disableObjectiveMap,
  chooseStartMap: chooseStartMap,
  launchArgs: launchArgs,
  assertServerMod: assertServerMod,
  dockerAvailable: dockerAvailable,
  containerRunning: containerRunning,
  containerConfigured: containerConfigured,
  startDedicated: startDedicated,
  stopDedicated: stopDedicated,
  waitForDedicatedStopped: waitForDedicatedStopped,
  followLogs: followLogs
};
