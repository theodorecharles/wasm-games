function reject(error) {
  return Object.freeze({ accepted: false, error });
}

function ascii(bytes) {
  return String.fromCharCode(...bytes);
}

function lowerExtension(name) {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

function cleanRelativeMediaName(value) {
  const name = String(value || '').replaceAll('\\', '/');
  if (!name || name.startsWith('/') || /^[a-z]:/i.test(name) || name.includes('\0')) return null;
  const pieces = name.split('/');
  if (pieces.some(piece => !piece || piece === '.' || piece === '..')) return null;
  return pieces.join('/');
}

function mediaLabel(name) {
  const basename = String(name || '').replaceAll('\\', '/').split('/').pop() || 'Media';
  return basename.replace(/\.[^.]+$/, '') || basename;
}

async function optionalFingerprint(request) {
  return request.policy?.digest === false ? null : request.digest('SHA-256');
}

async function validateNes({ name, size, policy, read, digest }) {
  const extension = lowerExtension(name);
  if (!['nes', 'unf', 'unif', 'fds'].includes(extension)) return reject('unsupported NES media extension');
  if (!Number.isSafeInteger(size) || size < 16 || size > 64 * 1024 * 1024) return reject('NES media size is outside the supported envelope');
  const header = await read(0, Math.min(16, size));
  const signature = ascii(header.subarray(0, 4));
  if (extension === 'nes' && signature !== 'NES\x1a') return reject('iNES header is missing');
  if ((extension === 'unf' || extension === 'unif') && signature !== 'UNIF') return reject('UNIF header is missing');
  if (extension === 'fds' && signature !== 'FDS\x1a' && size % 65500 !== 0) return reject('FDS image structure is not recognized');
  return Object.freeze({ accepted: true, identity: 'nes-media', fingerprint: await optionalFingerprint({ policy, digest }) });
}

function uint16le(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function plausibleSnesHeader(bytes) {
  if (bytes.length < 32) return false;
  const title = bytes.subarray(0, 21);
  const printable = Array.from(title).filter(byte => byte === 0 || (byte >= 0x20 && byte <= 0x7e)).length;
  const complement = uint16le(bytes, 28);
  const checksum = uint16le(bytes, 30);
  return printable >= 17 && ((complement ^ checksum) === 0xffff || (complement === 0 && checksum === 0));
}

async function validateSnes({ name, size, policy, read, digest }) {
  const extension = lowerExtension(name);
  if (!['sfc', 'smc'].includes(extension)) return reject('unsupported SNES media extension');
  if (!Number.isSafeInteger(size) || size < 32 * 1024 || size > 32 * 1024 * 1024 + 512) return reject('SNES media size is outside the supported envelope');
  const copierHeader = size % 1024 === 512 ? 512 : 0;
  const offsets = [0x7fc0, 0xffc0, 0x40ffc0].map(offset => offset + copierHeader).filter(offset => offset + 32 <= size);
  let headerFound = false;
  for (const offset of offsets) {
    if (plausibleSnesHeader(await read(offset, 32))) {
      headerFound = true;
      break;
    }
  }
  if (!headerFound) return reject('SNES internal header is not recognized');
  return Object.freeze({
    accepted: true, identity: 'snes-media',
    fingerprint: await optionalFingerprint({ policy, digest }), metadata: { copierHeader }
  });
}

async function validateCue({ name, size, policy, read, digest }) {
  if (lowerExtension(name) !== 'cue') return reject('expected a CUE sheet');
  if (!Number.isSafeInteger(size) || size < 16 || size > 1024 * 1024) return reject('CUE sheet size is outside the supported envelope');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(await read(0, size));
  const references = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*FILE\s+(?:"([^"]+)"|(\S+))\s+(BINARY|MOTOROLA|WAVE|MP3|AIFF)\s*$/i);
    if (match) references.push(cleanRelativeMediaName(match[1] || match[2]));
  }
  if (!references.length || references.some(reference => !reference)) return reject('CUE sheet has no safe track references');
  if (!/^\s*TRACK\s+\d+\s+(?:AUDIO|MODE\d\/\d+)/im.test(text)) return reject('CUE sheet has no track declaration');
  return Object.freeze({
    accepted: true,
    identity: 'cue-sheet',
    fingerprint: await optionalFingerprint({ policy, digest }),
    metadata: { references: [...new Set(references)] }
  });
}

async function validateDiscTrack({ name, size, policy, digest }) {
  if (!['bin', 'img'].includes(lowerExtension(name))) return reject('unsupported disc-track extension');
  if (!Number.isSafeInteger(size) || size < 2048 || size > 1024 * 1024 * 1024) return reject('disc-track size is outside the supported envelope');
  if (size % 2048 !== 0 && size % 2352 !== 0) return reject('disc-track sector alignment is not recognized');
  return Object.freeze({ accepted: true, identity: 'disc-track', fingerprint: await optionalFingerprint({ policy, digest }) });
}

async function validatePs1Firmware({ size }) {
  if (size !== 512 * 1024) return reject('PlayStation firmware must be 512 KiB');
  return Object.freeze({ accepted: true, identity: 'ps1-firmware' });
}

async function validatePs2Iso({ name, size, policy, read, digest }) {
  if (lowerExtension(name) !== 'iso') return reject('expected a PlayStation 2 ISO image');
  if (!Number.isSafeInteger(size) || size < 16 * 2048 + 7 || size > 16 * 1024 * 1024 * 1024) return reject('ISO size is outside the supported envelope');
  const descriptor = await read(16 * 2048, 7);
  if (descriptor[0] !== 1 || ascii(descriptor.subarray(1, 6)) !== 'CD001') return reject('ISO 9660 primary volume descriptor is missing');
  return Object.freeze({ accepted: true, identity: 'ps2-iso', fingerprint: await optionalFingerprint({ policy, digest }) });
}

export async function validateConsoleMedia(request) {
  switch (String(request.policy?.kind || '')) {
    case 'nes-media': return validateNes(request);
    case 'snes-media': return validateSnes(request);
    case 'cue-sheet': return validateCue(request);
    case 'disc-track': return validateDiscTrack(request);
    case 'ps1-firmware': return validatePs1Firmware(request);
    case 'ps2-iso': return validatePs2Iso(request);
    default: return reject('unsupported console media policy');
  }
}

function singleFileRequest(file, kind) {
  return Object.freeze({
    name: file.name,
    size: file.size,
    policy: Object.freeze({ kind, digest: false }),
    read: file.read,
    digest: file.digest
  });
}

function acceptedBundle(primary, label, system, format, fileCount, identity) {
  return Object.freeze({
    accepted: true,
    primary,
    label,
    identity,
    version: '1',
    metadata: Object.freeze({ system, format, fileCount })
  });
}

export async function validateConsoleMediaBundle({ files, policy, file }) {
  const system = String(policy?.system || '');
  if (!Array.isArray(files) || !files.length) return reject('media bundle is empty');
  if (system === 'nes' || system === 'snes') {
    if (files.length !== 1) return reject(`${system.toUpperCase()} media entries must contain exactly one file`);
    const kind = `${system}-media`;
    const result = await validateConsoleMedia(singleFileRequest(files[0], kind));
    if (!result.accepted) return result;
    return acceptedBundle(
      files[0].name, mediaLabel(files[0].name), system, lowerExtension(files[0].name), 1, result.identity
    );
  }

  if (system === 'ps1') {
    const byFoldedName = new Map(files.map(entry => [entry.name.toLowerCase(), entry]));
    const cueFiles = files.filter(entry => lowerExtension(entry.name) === 'cue');
    if (cueFiles.length !== 1) return reject('a PlayStation track bundle must contain exactly one CUE sheet');
    const cue = cueFiles[0];
    const cueResult = await validateConsoleMedia(singleFileRequest(cue, 'cue-sheet'));
    if (!cueResult.accepted) return cueResult;
    const directory = cue.name.includes('/') ? cue.name.slice(0, cue.name.lastIndexOf('/') + 1) : '';
    const references = cueResult.metadata.references.map(reference => `${directory}${reference}`);
    const foldedReferences = new Set(references.map(name => name.toLowerCase()));
    if (foldedReferences.size !== references.length) return reject('CUE sheet contains duplicate track references');
    for (const reference of references) {
      const track = file(reference) || byFoldedName.get(reference.toLowerCase());
      if (!track) return reject(`CUE sheet references a missing track: ${reference}`);
      const result = await validateConsoleMedia(singleFileRequest(track, 'disc-track'));
      if (!result.accepted) return reject(`${reference}: ${result.error}`);
    }
    const permitted = new Set([cue.name.toLowerCase(), ...foldedReferences]);
    const unexpected = files.find(entry => !permitted.has(entry.name.toLowerCase()));
    if (unexpected) return reject(`PlayStation bundle contains an unreferenced file: ${unexpected.name}`);
    return acceptedBundle(cue.name, mediaLabel(cue.name), system, 'cue', files.length, 'ps1-disc');
  }

  if (system === 'ps2') {
    if (files.length !== 1) return reject('PlayStation 2 media entries must contain exactly one ISO');
    const result = await validateConsoleMedia(singleFileRequest(files[0], 'ps2-iso'));
    if (!result.accepted) return result;
    return acceptedBundle(files[0].name, mediaLabel(files[0].name), system, 'iso', 1, result.identity);
  }
  return reject('unsupported console media-library system');
}

export default validateConsoleMedia;
