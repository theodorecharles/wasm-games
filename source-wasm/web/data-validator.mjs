const VPK_MAGIC = Object.freeze([0x34, 0x12, 0xaa, 0x55]);
const GAMEINFO_MAGIC = '"GameInf';
const STEAM_INF_MAGIC = 'PatchVer';

function reject(error) {
  return Object.freeze({ accepted: false, error });
}

function ascii(bytes, start = 0, end = bytes.length) {
  let text = '';
  for (let i = start; i < end && i < bytes.length; i += 1) {
    text += String.fromCharCode(bytes[i]);
  }
  return text;
}

function magicEquals(bytes, expected) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < expected.length) return false;
  return expected.every((value, index) => bytes[index] === value);
}

export async function validateSourceOwnerFile({ name, size, policy, read }) {
  const fileName = String(name || '');
  const kind = policy && typeof policy.kind === 'string' ? policy.kind : '';
  if (/glshaders\.cfg$/i.test(fileName) || /\.(dll|exe|so|dylib|asi)(?:$|[_-]\d+$)/i.test(fileName)) {
    return reject(`${fileName} is blocked owner data`);
  }
  if (!Number.isFinite(size) || size < 1) {
    return reject(`${fileName} is empty`);
  }
  const headerSize = Math.min(16, size);
  const header = await read(0, headerSize);
  if (!(header instanceof Uint8Array) || header.byteLength < headerSize) {
    return reject(`${fileName} header could not be read`);
  }

  if (kind === 'vpk-dir' || /_dir\.vpk$/i.test(fileName)) {
    if (size < 12) return reject(`${fileName} is too small to be a VPK directory`);
    if (!magicEquals(header, VPK_MAGIC)) {
      return reject(`${fileName} is not a Source VPK archive`);
    }
    return Object.freeze({
      accepted: true,
      identity: fileName.toLowerCase(),
      version: 'vpk-dir',
      metadata: Object.freeze({ magic: '0x55aa1234' })
    });
  }

  if (kind === 'vpk-data' || /_\d{3}\.vpk$/i.test(fileName)) {
    if (size < 4) return reject(`${fileName} is too small to be a VPK data archive`);
    return Object.freeze({
      accepted: true,
      identity: fileName.toLowerCase(),
      version: 'vpk-data',
      metadata: Object.freeze({ kind: 'vpk-data' })
    });
  }

  if (kind === 'gameinfo' || /gameinfo\.txt$/i.test(fileName)) {
    if (!ascii(header, 0, 8).startsWith(GAMEINFO_MAGIC)) {
      return reject(`${fileName} is not a GameInfo file`);
    }
    return Object.freeze({
      accepted: true,
      identity: 'gameinfo.txt',
      version: 'gameinfo',
      metadata: Object.freeze({ kind: 'gameinfo' })
    });
  }

  if (kind === 'steam-inf' || /steam\.inf$/i.test(fileName)) {
    if (!ascii(header, 0, 8).startsWith(STEAM_INF_MAGIC)) {
      return reject(`${fileName} is not a steam.inf file`);
    }
    return Object.freeze({
      accepted: true,
      identity: 'steam.inf',
      version: 'steam-inf',
      metadata: Object.freeze({ kind: 'steam-inf' })
    });
  }

  return Object.freeze({
    accepted: true,
    identity: fileName.toLowerCase(),
    version: 'source-owner',
    metadata: Object.freeze({ kind: kind || 'file' })
  });
}

export { VPK_MAGIC, GAMEINFO_MAGIC, STEAM_INF_MAGIC };
export default validateSourceOwnerFile;
