import assert from 'node:assert/strict';
import { createWorkerFsHotCache, shouldCacheDirectory } from '../web/openrct2-hot-cache.mjs';

assert.equal(shouldCacheDirectory('ObjData'), true);
assert.equal(shouldCacheDirectory('Scenarios'), true);
assert.equal(shouldCacheDirectory('Tracks'), true);
assert.equal(shouldCacheDirectory('RCT1/Scenarios'), true);
assert.equal(shouldCacheDirectory('Data'), false);
assert.equal(shouldCacheDirectory('RCT1/Data'), false);

let blobReads = 0;
class TestBlob {
  constructor(bytes) {
    this.bytes = Uint8Array.from(bytes);
    this.size = this.bytes.byteLength;
  }
}
const originalBlob = globalThis.Blob;
globalThis.Blob = TestBlob;

try {
  const workerFs = {
    reader: {
      readAsArrayBuffer(blob) {
        blobReads++;
        return blob.bytes.buffer.slice(blob.bytes.byteOffset, blob.bytes.byteOffset + blob.bytes.byteLength);
      }
    },
    stream_ops: {
      read(stream, buffer, offset, length, position) {
        const source = stream.node.contents.bytes;
        const count = Math.min(length, source.byteLength - position);
        buffer.set(source.subarray(position, position + count), offset);
        return count;
      }
    }
  };
  const hotFile = { name: 'hot.dat', size: 6, contents: new TestBlob([1, 2, 3, 4, 5, 6]) };
  const coldFile = { name: 'cold.dat', size: 3, contents: new TestBlob([7, 8, 9]) };
  const cacheEvents = [];
  const cache = createWorkerFsHotCache(workerFs, detail => cacheEvents.push(detail));
  cache.markTree({ contents: { hotFile } });

  const first = new Uint8Array(3);
  assert.equal(workerFs.stream_ops.read({ node: hotFile }, first, 0, 3, 1), 3);
  assert.deepEqual(Array.from(first), [2, 3, 4]);
  assert.equal(blobReads, 1);
  assert.equal(hotFile.contents, null, 'The cached node must release its Blob reference.');

  const second = new Uint8Array(2);
  assert.equal(workerFs.stream_ops.read({ node: hotFile }, second, 0, 2, 4), 2);
  assert.deepEqual(Array.from(second), [5, 6]);
  assert.equal(blobReads, 1, 'Repeated reads must reuse the resident bytes.');
  assert.deepEqual(cache.stats(), { files: 1, bytes: 6 });
  assert.equal(cacheEvents.length, 1);

  const cold = new Uint8Array(2);
  assert.equal(workerFs.stream_ops.read({ node: coldFile }, cold, 0, 2, 0), 2);
  assert.deepEqual(Array.from(cold), [7, 8]);
  assert.equal(coldFile.contents instanceof TestBlob, true, 'Cold files must remain Blob-backed.');
} finally {
  globalThis.Blob = originalBlob;
}

console.log('OpenRCT2 WORKERFS hot-cache contract passed');
