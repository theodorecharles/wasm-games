'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
const sourceRoot = path.resolve(
  process.env.DOS_DATA_ROOT || process.env.JILL_DATA_ROOT || '/home/ted/Development/dos/DOS'
);
const policyDate = '2026-08-14';

const definitions = Object.freeze({
  jill1: Object.freeze({
    directory: 'JILL', executable: 'JILL.EXE', namespace: 'dosbox-jill-jill1', version: `owner-data-${policyDate}-v1`,
    exclude: /^(?:CATALOG\.EXE|HELPME(?:\.DOC|\.EXE)|FILE_ID\.DIZ|EPIC\.ANS|LICENSE\.DOC|ORDER(?:-[A-Z]+)?\.DOC|PRINTME\.BAT|SYSOP\.DOC|VENDOR\.DOC|README\.TXT|JILL1\.CFG|JN1SAVE.*)$/i
  }),
  jill2: Object.freeze({
    directory: 'JILL2', executable: 'JILL2.EXE', namespace: 'dosbox-jill-jill2', version: `owner-data-${policyDate}-v1`,
    exclude: /^(?:CATALOG\.EXE|HELPME(?:\.DOC|\.EXE)|FILE_ID\.DIZ|EPIC\.ANS|LICENSE\.DOC|ORDER(?:-[A-Z]+)?\.DOC|PRINTME\.BAT|SYSOP\.DOC|VENDOR\.DOC|README\.TXT|JILL2\.CFG|JN2SAVE.*)$/i
  }),
  jill3: Object.freeze({
    directory: 'JILL3', executable: 'JILL3.EXE', namespace: 'dosbox-jill-jill3', version: `owner-data-${policyDate}-v1`,
    exclude: /^(?:CATALOG\.EXE|HELPME(?:\.DOC|\.EXE)|FILE_ID\.DIZ|EPIC\.ANS|LICENSE\.DOC|ORDER(?:-[A-Z]+)?\.DOC|PRINTME\.BAT|SYSOP\.DOC|VENDOR\.DOC|README\.TXT|JILL3\.CFG|JN3SAVE.*)$/i
  }),
  jazz: Object.freeze({
    directory: 'JAZZ', executable: 'JAZZ.EXE', version: `owner-data-${policyDate}-v1`,
    exclude: /^(?:CONFIG\.000|EPIC\.ANS|FILE_ID\.DIZ|HELPME(?:\.DOC|\.EXE)|JAZZ\.PIF|LICENSE\.DOC|MANUAL\.DOC|ORDER(?:_[A-Z]+)?\.DOC|SETUP\.EXE|SYSOP\.DOC|VENDOR\.DOC)$/i
  }),
  duke1: Object.freeze({
    directory: 'DUKE1', executable: 'DN1.EXE', version: `owner-data-${policyDate}-v1`,
    exclude: /^(?:CATALOG\.EXE|DUKE1\.BAT|FOREIGN\.DOC|HIGHS\.DN1|KEYS\.DN1|MY_DEMO\.DN1|PRINTME\.EXE|SAVEDT\.DN1|SPEED\.DN1|USERDEMO\.DN1)$/i
  }),
  duke2: Object.freeze({
    directory: 'DUKE2', executable: 'NUKEM2.EXE', version: `owner-data-${policyDate}-v1`,
    exclude: /^(?:DN2HELP\.EXE|DN2HINT\.EXE|NUKEM2\.-(?:GT|NM|V1))$/i
  }),
  gta: Object.freeze({
    directory: 'GTA', executable: 'GTA.BAT', version: `owner-data-${policyDate}-v1`, preservePaths: true,
    commands: ['cycles max', 'GTA.BAT'],
    exclude: /^(?:[FGI]?HELPME\.(?:DOC|TXT)|[FGI]?README\.(?:DOC|TXT)|GTA\.PIF|GTADOS\/(?:DIG\.INI|MEMCHECK\.LOG))$/i
  }),
  nfs: Object.freeze({
    directory: 'NFS', sourceEnvironment: 'NFS_DATA_ROOT', executable: 'TNFS.EXE',
    version: `owner-data-${policyDate}-v1`, preservePaths: true,
    commands: ['cycles max', 'TNFS.EXE SB'],
    sourceArchive: Object.freeze({
      name: 'Need For Speed (1995)(Pioneer Productions).zip',
      sha256: 'f3a204c48dd39a5735690a45729683a10c00336abfb80b620d74c9213d25ed5a'
    }),
    exclude: /^(?:FILE_ID\.DIZ|INSTALL\.BAT|NFS\.BAT|NFSSB\.BAT|GAMEDATA\/CONFIG\/(?:CONFIG\.DAT|JOYSTICK\.CFG|TMP\.TRI))$/i
  }),
  simcity2000: Object.freeze({
    directory: 'SC2000', sourceEnvironment: 'SC2000_DATA_ROOT', executable: 'SC2000.EXE',
    version: `owner-data-${policyDate}-v1`, preservePaths: true,
    commands: ['cycles max', 'SC2000.EXE'],
    sourceArchive: Object.freeze({
      name: 'Sim City 2000 (1993)(Maxis Software Inc)(Rev).zip',
      sha256: 'c759d7255fbb3c234ed88f01d6ffbd17661f953b6601f8db1607ccd84320d5b4'
    }),
    exclude: /^(?:VESA\/|INFO\.EXE|INSTALL\..*|MAXIS\.CIM|MW_ATIUP\.EXE|PATCH\.EXE|POSTCARD\.CIM|README\.TXT|VDETECT\.EXE|VRF_DLL\.EXE)/i
  })
});

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function filesBeneath(directory, relative = '') {
  return fs.readdirSync(path.join(directory, relative), { withFileTypes: true }).flatMap(entry => {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) return filesBeneath(directory, child);
    if (entry.isFile()) return [child.split(path.sep).join('/')];
    return [];
  });
}

function safeKey(relative) {
  return relative.toLowerCase().replaceAll('/', '--').replace(/[^a-z0-9._-]+/g, '_');
}

const variants = {};
for (const [variant, definition] of Object.entries(definitions)) {
  const configuredSource = definition.sourceEnvironment && process.env[definition.sourceEnvironment];
  const directory = configuredSource ? path.resolve(configuredSource) : path.join(sourceRoot, definition.directory);
  if (!fs.statSync(directory).isDirectory()) throw new Error(`Missing ${directory}`);
  const names = filesBeneath(directory).filter(name => !definition.exclude.test(name))
    .sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base' }));
  if (!names.some(name => name.toLowerCase() === definition.executable.toLowerCase())) {
    throw new Error(`Missing ${definition.executable}`);
  }
  const commands = ['mount c /game', 'c:', ...(definition.commands || [definition.executable])];
  variants[variant] = {
    namespace: definition.namespace || `dosbox-${variant}`,
    version: definition.version,
    executable: definition.executable,
    preservePaths: definition.preservePaths === true,
    dosboxArguments: ['-machine', 'svga_s3'],
    commands,
    ...(definition.sourceArchive ? { sourceArchive: definition.sourceArchive } : {}),
    files: names.map(relative => {
      const full = path.join(directory, relative);
      const name = path.posix.basename(relative);
      return {
        key: safeKey(relative),
        name,
        names: [name],
        path: `${variant}/${relative}`,
        ...(relative.includes('/') ? { mountName: relative } : {}),
        size: fs.statSync(full).size,
        sha256: sha256(full)
      };
    })
  };
}

const manifest = {
  namespace: 'dosbox-family',
  version: `owner-data-${policyDate}-v3`,
  variants
};
fs.writeFileSync(path.join(repo, 'web', 'wasm-game-data.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote exact DOS owner-data policy with ${Object.values(variants).reduce((sum, entry) => sum + entry.files.length, 0)} files.`);
