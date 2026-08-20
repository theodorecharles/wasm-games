const HOT_DIRECTORIES = new Set([
  'ObjData',
  'Scenarios',
  'Tracks',
  'RCT1/Scenarios',
  'RCT1/Tracks'
]);

export function shouldCacheDirectory(directory) {
  return HOT_DIRECTORIES.has(String(directory || ''));
}

export function createWorkerFsHotCache(workerFs, onCache) {
  if (!workerFs?.stream_ops || typeof workerFs.stream_ops.read !== 'function') {
    throw new Error('OpenRCT2 hot cache requires WORKERFS stream operations.');
  }

  const hotNodes = new WeakSet();
  const cachedBytes = new WeakMap();
  const originalRead = workerFs.stream_ops.read;
  const stats = { files: 0, bytes: 0 };

  workerFs.stream_ops.read = function readCachedWorkerFile(stream, buffer, offset, length, position) {
    const node = stream?.node;
    if (!node || !hotNodes.has(node)) {
      return originalRead.call(this, stream, buffer, offset, length, position);
    }
    if (position >= node.size) return 0;

    let bytes = cachedBytes.get(node);
    if (!bytes) {
      if (!workerFs.reader || !(node.contents instanceof Blob)) {
        throw new Error(`Unable to cache WORKERFS file ${node.name || '<unnamed>'}.`);
      }
      bytes = new Uint8Array(workerFs.reader.readAsArrayBuffer(node.contents));
      if (bytes.byteLength !== node.size) {
        throw new Error(`WORKERFS cache size mismatch for ${node.name || '<unnamed>'}.`);
      }
      cachedBytes.set(node, bytes);
      // Once the complete immutable file is resident, release this node's Blob
      // reference. The cache remains outside the Wasm heap and avoids a second
      // full-size MEMFS copy.
      node.contents = null;
      stats.files++;
      stats.bytes += bytes.byteLength;
      onCache?.({ ...stats, name: node.name || '', size: bytes.byteLength });
    }

    const count = Math.min(length, bytes.byteLength - position);
    buffer.set(bytes.subarray(position, position + count), offset);
    return count;
  };

  function markTree(node) {
    if (!node) return;
    if (node.contents instanceof Blob) {
      hotNodes.add(node);
      return;
    }
    if (node.contents && typeof node.contents === 'object') {
      for (const child of Object.values(node.contents)) markTree(child);
    }
  }

  return Object.freeze({ markTree, stats: () => ({ ...stats }) });
}
