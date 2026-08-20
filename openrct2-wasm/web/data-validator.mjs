function reject(error) {
  return Object.freeze({ accepted: false, error });
}

const requiredDirectories = Object.freeze(['Data', 'ObjData', 'Scenarios', 'Tracks']);
const rct1Directories = Object.freeze(['RCT1/Data', 'RCT1/Scenarios', 'RCT1/Tracks']);
const encodedCasePath = /^((?:RCT1\/)?(?:Data|ObjData|Scenarios|Tracks))\/__case__\/([0-9a-f]+)$/;

function decodedName(name) {
  const value = String(name || '').replaceAll('\\', '/');
  const match = value.match(encodedCasePath);
  if (!match) return value;
  if (match[2].length % 2 !== 0) return null;
  try {
    const bytes = Uint8Array.from(match[2].match(/../g) || [], pair => Number.parseInt(pair, 16));
    const basename = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!basename || basename === '.' || basename === '..' || basename.includes('/') || basename.includes('\\')) return null;
    return `${match[1]}/${basename}`;
  } catch (_) {
    return null;
  }
}

function uint32le(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

export async function validateRct2Installation({ files }) {
  if (!Array.isArray(files) || !files.length) return reject('the installation bundle is empty');

  const decoded = new Map();
  for (const file of files) {
    const name = decodedName(file.name);
    if (!name) return reject(`invalid case-preservation path: ${file.name}`);
    if (![...requiredDirectories, ...rct1Directories].some(directory => name.startsWith(`${directory}/`))) {
      return reject(`unexpected installation path: ${name}`);
    }
    if (decoded.has(name)) return reject(`duplicate installation path: ${name}`);
    decoded.set(name, file);
  }

  for (const directory of requiredDirectories) {
    if (![...decoded.keys()].some(name => name.startsWith(`${directory}/`))) {
      return reject(`missing ${directory} directory`);
    }
  }

  const g1 = decoded.get('Data/g1.dat');
  const ch = decoded.get('Data/ch.dat');
  if (!g1 || g1.size < 1024 * 1024) return reject('Data/g1.dat is missing or too small');
  if (!ch || ch.size < 64 * 1024) return reject('Data/ch.dat is missing or too small');

  const g1Header = await g1.read(0, 8);
  if (g1Header.length !== 8) return reject('Data/g1.dat header is truncated');
  const spriteCount = uint32le(g1Header, 0);
  const dataOffset = uint32le(g1Header, 4);
  if (spriteCount < 1000 || spriteCount > 100000 || dataOffset < 8 || dataOffset >= g1.size) {
    return reject('Data/g1.dat header is not recognized');
  }

  const chHeader = await ch.read(0, 8);
  if (chHeader.length !== 8 || chHeader.every(byte => byte === 0)) {
    return reject('Data/ch.dat header is not recognized');
  }

  const hasRct1 = [...decoded.keys()].some(name => name.startsWith('RCT1/'));
  if (hasRct1) {
    const csg1 = decoded.get('RCT1/Data/csg1.dat') || decoded.get('RCT1/Data/CSG1.DAT');
    const csg1i = decoded.get('RCT1/Data/csg1i.dat') || decoded.get('RCT1/Data/CSG1I.DAT');
    if (!csg1 || csg1.size < 1024 * 1024 || !csg1i || csg1i.size < 64 * 1024) {
      return reject('RCT1/Data is missing csg1.dat or csg1i.dat');
    }
  }

  return Object.freeze({
    accepted: true,
    primary: g1.name,
    label: hasRct1 ? 'RollerCoaster Tycoon 1 + 2' : 'RollerCoaster Tycoon 2',
    identity: 'rct2-installation',
    version: 'directory-tree-v2',
    metadata: Object.freeze({ format: 'openrct-directory-tree', fileCount: files.length, rct1: hasRct1 })
  });
}

export default validateRct2Installation;
