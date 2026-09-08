import { closeSync, fstatSync, lstatSync, openSync, readFileSync, readSync } from 'node:fs';
import path from 'node:path';

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit += 1) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
  return n >>> 0;
});

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

function safePath(value) {
  if (!value || value.includes('\\') || value.includes(':') || value.startsWith('/')
    || value.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`unsafe VPK path: ${value}`);
  }
  return value;
}

export function parseVpkDirectory(bytes) {
  if (bytes.length < 12 || bytes.readUInt32LE(0) !== 0x55aa1234) throw new Error('invalid VPK header');
  const version = bytes.readUInt32LE(4);
  if (version !== 1 && version !== 2) throw new Error(`unsupported VPK version ${version}`);
  const headerSize = version === 1 ? 12 : 28;
  if (bytes.length < headerSize) throw new Error('truncated VPK header');
  const treeEnd = headerSize + bytes.readUInt32LE(8);
  if (treeEnd > bytes.length) throw new Error('truncated VPK directory');
  const dataEnd = version === 2 ? treeEnd + bytes.readUInt32LE(12) : bytes.length;
  if (dataEnd > bytes.length) throw new Error('truncated VPK embedded data');
  let offset = headerSize;
  function string() {
    const end = bytes.indexOf(0, offset);
    if (end < offset || end >= treeEnd) throw new Error('unterminated VPK directory string');
    const result = bytes.toString('utf8', offset, end);
    offset = end + 1;
    return result;
  }
  const entries = [];
  const seen = new Set();
  for (let ext = string(); ext; ext = string()) {
    for (let directory = string(); directory; directory = string()) {
      for (let name = string(); name; name = string()) {
        if (offset + 18 > treeEnd) throw new Error('truncated VPK entry');
        const entry = {
          path: safePath(`${directory === ' ' ? '' : `${directory}/`}${name}${ext === ' ' ? '' : `.${ext}`}`),
          crc: bytes.readUInt32LE(offset),
          archive: bytes.readUInt16LE(offset + 6),
          offset: bytes.readUInt32LE(offset + 8),
          length: bytes.readUInt32LE(offset + 12)
        };
        const preloadLength = bytes.readUInt16LE(offset + 4);
        if (bytes.readUInt16LE(offset + 16) !== 0xffff) throw new Error(`invalid VPK terminator: ${entry.path}`);
        offset += 18;
        if (offset + preloadLength > treeEnd) throw new Error(`truncated VPK preload: ${entry.path}`);
        entry.preload = bytes.subarray(offset, offset + preloadLength);
        offset += preloadLength;
        if (seen.has(entry.path.toLowerCase())) throw new Error(`duplicate VPK path: ${entry.path}`);
        seen.add(entry.path.toLowerCase());
        if (entry.archive === 0x7fff && treeEnd + entry.offset + entry.length > dataEnd) {
          throw new Error(`truncated VPK embedded entry: ${entry.path}`);
        }
        entries.push(entry);
      }
    }
  }
  if (offset !== treeEnd) throw new Error('unexpected trailing VPK directory bytes');
  return { entries, dataOffset: treeEnd };
}

export function openVpk(directoryPath) {
  if (!directoryPath.endsWith('_dir.vpk')) throw new Error('expected a _dir.vpk path');
  if (!lstatSync(directoryPath).isFile()) throw new Error(`VPK input must be a regular file: ${directoryPath}`);
  const bytes = readFileSync(directoryPath);
  const { entries, dataOffset } = parseVpkDirectory(bytes);
  const handles = new Map();
  return {
    entries,
    read(entry) {
      let data;
      if (entry.archive === 0x7fff) {
        data = bytes.subarray(dataOffset + entry.offset, dataOffset + entry.offset + entry.length);
      } else if (!entry.length) {
        data = Buffer.alloc(0);
      } else {
        const archivePath = directoryPath.replace(/_dir\.vpk$/, `_${String(entry.archive).padStart(3, '0')}.vpk`);
        let handle = handles.get(archivePath);
        if (!handle) {
          if (!lstatSync(archivePath).isFile()) throw new Error(`VPK input must be a regular file: ${archivePath}`);
          const fd = openSync(archivePath, 'r');
          handle = { fd, size: fstatSync(fd).size };
          handles.set(archivePath, handle);
        }
        if (entry.offset + entry.length > handle.size) throw new Error(`truncated VPK archive: ${path.basename(archivePath)}: ${entry.path}`);
        data = Buffer.allocUnsafe(entry.length);
        let done = 0;
        while (done < data.length) {
          const count = readSync(handle.fd, data, done, data.length - done, entry.offset + done);
          if (!count) throw new Error(`short VPK read: ${entry.path}`);
          done += count;
        }
      }
      const result = Buffer.concat([entry.preload, data]);
      if (crc32(result) !== entry.crc) {
        const error = new Error(`VPK CRC mismatch: ${entry.path}`);
        error.code = 'ERR_VPK_CRC';
        throw error;
      }
      return result;
    },
    close() { for (const { fd } of handles.values()) closeSync(fd); handles.clear(); }
  };
}
