import { spawn } from 'node:child_process';
import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const roots = Object.freeze({
  rct2: Object.freeze(['Data', 'ObjData', 'Scenarios', 'Tracks']),
  rct1: Object.freeze(['Data', 'Scenarios', 'Tracks'])
});

function fail(message) {
  const error = new Error(message);
  error.statusCode = 422;
  throw error;
}

async function exists(filename) {
  return (await stat(filename).catch(() => null))?.isFile() === true;
}

async function runInnoextract(executable, outputDirectory) {
  await mkdir(outputDirectory, { recursive: true });
  await new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/innoextract', [
      '--extract', '--silent', '--exclude-temp', '--output-dir', outputDirectory, executable
    ], { cwd: path.dirname(executable), stdio: ['ignore', 'ignore', 'pipe'] });
    let errorText = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('GOG installer extraction exceeded ten minutes.'));
    }, 600000);
    child.stderr.on('data', chunk => { errorText += chunk.toString('utf8').slice(0, 4096); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`GOG installer extraction failed${errorText.trim() ? `: ${errorText.trim()}` : '.'}`));
    });
  });
}

async function locateInstall(root, executableName) {
  const queue = [root];
  while (queue.length) {
    const directory = queue.shift();
    if (await exists(path.join(directory, executableName))) return directory;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.isSymbolicLink()) queue.push(path.join(directory, entry.name));
    }
  }
  return null;
}

async function regularFiles(root, prefix) {
  const results = [];
  async function visit(directory, relative) {
    const entries = (await readdir(directory, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory() && !entry.isSymbolicLink()) await visit(target, name);
      else if (entry.isFile()) results.push({ source: target, name });
    }
  }
  await visit(root, prefix || '');
  return results;
}

function encodedCaseName(name) {
  const slash = name.lastIndexOf('/');
  const directory = slash < 0 ? '' : name.slice(0, slash);
  const basename = slash < 0 ? name : name.slice(slash + 1);
  const encoded = Buffer.from(basename, 'utf8').toString('hex');
  return `${directory}/__case__/${encoded}`.replace(/^\//, '');
}

async function copySelectedTree(sourceRoot, outputDirectory, kind) {
  const selected = [];
  for (const directory of roots[kind]) {
    const source = path.join(sourceRoot, directory);
    const details = await stat(source).catch(() => null);
    if (!details?.isDirectory()) {
      if (kind === 'rct1' && directory === 'Tracks') continue;
      fail(`${kind.toUpperCase()} installer is missing ${directory}.`);
    }
    const destinationPrefix = kind === 'rct1' ? `RCT1/${directory}` : directory;
    selected.push(...await regularFiles(source, destinationPrefix));
  }
  const folded = new Map();
  for (const file of selected) {
    const key = file.name.toLowerCase();
    const siblings = folded.get(key) || [];
    siblings.push(file);
    folded.set(key, siblings);
  }
  for (const siblings of folded.values()) {
    siblings.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    siblings.forEach((file, index) => { if (index) file.name = encodedCaseName(file.name); });
  }
  for (const file of selected) {
    const destination = path.join(outputDirectory, ...file.name.split('/'));
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(file.source, destination);
  }
  return selected.length;
}

export async function transformOpenRctInstallers({ files, outputDirectory }) {
  if (!Array.isArray(files) || !files.some(file => /\.exe$/i.test(file.name))) return { transformed: false };
  const setupFiles = files.filter(file => /(^|\/)setup_.*\.exe$/i.test(file.name));
  if (!setupFiles.length || setupFiles.length > 2) {
    fail('Select the RCT2 GOG setup executable and its companion .bin file; the RCT1 setup pair is optional.');
  }
  for (const setup of setupFiles) {
    const stem = setup.name.replace(/\.exe$/i, '');
    if (!files.some(file => file.name.toLowerCase() === `${stem}-1.bin`.toLowerCase())) {
      fail(`Missing companion file ${stem}-1.bin.`);
    }
  }

  let rct2Root = null;
  let rct1Root = null;
  for (const [index, setup] of setupFiles.entries()) {
    const extracted = path.join(outputDirectory, `.extract-${index}`);
    await runInnoextract(setup.path, extracted);
    const rct2 = await locateInstall(extracted, 'RCT2.EXE');
    const rct1 = await locateInstall(extracted, 'RCT.EXE');
    if (rct2) {
      if (rct2Root) fail('More than one RCT2 installer was selected.');
      rct2Root = rct2;
    } else if (rct1) {
      if (rct1Root) fail('More than one RCT1 installer was selected.');
      rct1Root = rct1;
    } else {
      fail(`${setup.name} is not an RCT1 or RCT2 GOG installer.`);
    }
  }
  if (!rct2Root) fail('The RCT2 GOG installer is required.');

  const rct2Files = await copySelectedTree(rct2Root, outputDirectory, 'rct2');
  const rct1Files = rct1Root ? await copySelectedTree(rct1Root, outputDirectory, 'rct1') : 0;
  await Promise.all(setupFiles.map((_, index) =>
    rm(path.join(outputDirectory, `.extract-${index}`), { recursive: true, force: true })));

  return {
    transformed: true,
    label: rct1Files ? 'RollerCoaster Tycoon 1 + 2' : 'RollerCoaster Tycoon 2',
    metadata: { rct1: rct1Files > 0, rct2Files, rct1Files }
  };
}

export default transformOpenRctInstallers;
