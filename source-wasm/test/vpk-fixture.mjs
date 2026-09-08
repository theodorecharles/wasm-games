import { crc32 } from '../scripts/vpk-reader.mjs';

// Minimal real VPK wire format. Payloads remain synthetic and private to tests.
export function makeVpk(entries = [], { version = 2 } = {}) {
  const tree = [], payloads = new Map(), offsets = [], cstring = value => Buffer.from(`${value}\0`);
  let treeLength = 0;
  const push = bytes => { tree.push(bytes); treeLength += bytes.length; };
  for (const entry of entries) {
    const slash = entry.path.lastIndexOf('/');
    const directory = slash < 0 ? ' ' : entry.path.slice(0, slash) || '/';
    const leaf = entry.path.slice(slash + 1), dot = leaf.lastIndexOf('.');
    const extension = dot <= 0 ? ' ' : leaf.slice(dot + 1), name = dot <= 0 ? leaf : leaf.slice(0, dot);
    const bytes = Buffer.from(entry.bytes || ''), preload = bytes.subarray(0, entry.preloadLength || 0);
    const payload = bytes.subarray(preload.length), archive = entry.archive ?? 0x7fff;
    const prior = payloads.get(archive) || Buffer.alloc(entry.padding || 0, 0x7a);
    const metadata = Buffer.alloc(18);
    metadata.writeUInt32LE(entry.crc ?? crc32(bytes), 0);
    metadata.writeUInt16LE(preload.length, 4);
    metadata.writeUInt16LE(archive, 6);
    metadata.writeUInt32LE(prior.length, 8);
    metadata.writeUInt32LE(payload.length, 12);
    metadata.writeUInt16LE(0xffff, 16);
    push(cstring(extension)); push(cstring(directory)); push(cstring(name));
    offsets.push(treeLength);
    push(metadata); push(preload); push(Buffer.from([0, 0]));
    payloads.set(archive, Buffer.concat([prior, payload]));
  }
  push(Buffer.from([0]));
  const header = Buffer.alloc(version === 1 ? 12 : 28), embedded = payloads.get(0x7fff) || Buffer.alloc(0);
  header.writeUInt32LE(0x55aa1234, 0); header.writeUInt32LE(version, 4); header.writeUInt32LE(treeLength, 8);
  if (version === 2) header.writeUInt32LE(embedded.length, 12);
  payloads.delete(0x7fff);
  return { bytes: Buffer.concat([header, ...tree, embedded]), archives: payloads,
    metadataOffsets: offsets.map(offset => header.length + offset), dataOffset: header.length + treeLength };
}
