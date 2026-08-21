const REZ_COPYRIGHT = 'RezMgr Version 1 Copyright (C) 1995 MONOLITH INC.';
const HEADER_BYTES = 131;
const VERSION_OFFSET = 0x7f;

function reject(error) {
  return Object.freeze({ accepted: false, error });
}

function ascii(bytes) {
  return String.fromCharCode(...bytes);
}

export async function validateLithRez({ name, size, policy, read }) {
  const fileName = String(name || '');
  if (!/\.rez$/i.test(fileName)) {
    return reject(`${fileName} is not a .rez archive`);
  }
  if (!Number.isFinite(size) || size < HEADER_BYTES) {
    return reject(`${fileName} is too small to be a RezMgr archive`);
  }
  const header = await read(0, HEADER_BYTES);
  if (!(header instanceof Uint8Array) || header.byteLength < HEADER_BYTES) {
    return reject(`${fileName} header could not be read`);
  }
  const text = ascii(header.subarray(0, 80));
  if (!text.includes(REZ_COPYRIGHT)) {
    return reject(`${fileName} is not a Monolith RezMgr Version 1 archive`);
  }
  const version = header[VERSION_OFFSET] | (header[VERSION_OFFSET + 1] << 8) |
    (header[VERSION_OFFSET + 2] << 16) | (header[VERSION_OFFSET + 3] << 24);
  if (version !== 1) {
    return reject(`${fileName} has RezMgr version ${version}, expected 1`);
  }
  const expected = policy && typeof policy.identity === 'string' ? policy.identity : '';
  if (expected && fileName.toLowerCase() !== expected.toLowerCase()) {
    return reject(`${fileName} does not match required identity ${expected}`);
  }
  return Object.freeze({
    accepted: true,
    identity: fileName.toLowerCase(),
    version: 'rezmgr-1',
    metadata: Object.freeze({ copyright: REZ_COPYRIGHT, rezVersion: version })
  });
}
