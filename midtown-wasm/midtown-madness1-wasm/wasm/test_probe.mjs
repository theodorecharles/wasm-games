import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const [, , modulePath, archivePath] = process.argv;
assert(modulePath, 'expected path to generated probe module');

const { default: createMM1AssetProbe } = await import(pathToFileURL(modulePath));
const module = await createMM1AssetProbe();

function inspect(bytes) {
  const pointer = module._malloc(Math.max(bytes.byteLength, 1));
  try {
    module.HEAPU8.set(bytes, pointer);
    const resultPointer = module._mm1_probe_archive(pointer, bytes.byteLength);
    return JSON.parse(module.UTF8ToString(resultPointer));
  } finally {
    module._free(pointer);
  }
}

function syntheticArchive() {
  const names = new TextEncoder().encode('CORE\0AR\0UI\0');
  const payloads = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])];
  const headerBytes = 16;
  const nodeBytes = 12 * payloads.length;
  const payloadOffset = headerBytes + nodeBytes + names.byteLength;
  const bytes = new Uint8Array(payloadOffset + payloads[0].length + payloads[1].length);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, 0x53455241, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, 2, true);
  view.setUint32(12, names.byteLength, true);

  view.setUint32(16, payloadOffset, true);
  view.setUint32(20, payloads[0].length | (5 << 23), true);
  view.setUint32(24, 0, true);

  view.setUint32(28, payloadOffset + payloads[0].length, true);
  view.setUint32(32, payloads[1].length | (5 << 23), true);
  view.setUint32(36, 8 << 14, true);

  bytes.set(names, headerBytes + nodeBytes);
  bytes.set(payloads[0], payloadOffset);
  bytes.set(payloads[1], payloadOffset + payloads[0].length);
  return bytes;
}

const valid = inspect(syntheticArchive());
assert.equal(valid.valid, true);
assert.equal(valid.format, 'AngelRes');
assert.equal(valid.nodeCount, 2);
assert.equal(valid.rootCount, 2);
assert.deepEqual(valid.roots.map((root) => root.name), ['CORE.AR', 'UI.AR']);

const badMagic = syntheticArchive();
badMagic[0] = 0;
assert.deepEqual(inspect(badMagic), { valid: false, error: 'Magic is not ARES' });

const truncated = syntheticArchive().subarray(0, 20);
assert.equal(inspect(truncated).valid, false);

if (archivePath) {
  const archive = new Uint8Array(await readFile(archivePath));
  const report = inspect(archive);
  assert.equal(report.valid, true, `${archivePath}: ${report.error}`);
  assert.ok(report.nodeCount > 0);
  console.log(JSON.stringify(report));
} else {
  console.log('synthetic archive contract: ok');
}
