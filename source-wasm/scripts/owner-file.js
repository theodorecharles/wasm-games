'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { pipeline, finished } = require('node:stream/promises');
const MAX_BASE64_BYTES = 1024 * 1024;
const MAX_BASE64_READERS = 8;
const MAX_OWNER_TRANSFERS = 32;
let base64Readers = 0;
let ownerTransfers = 0;

function rangeFor(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || !size) throw Error('Invalid range');
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw Error('Invalid range');
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) throw Error('Invalid range');
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

async function serveOwnerFile(request, response, filename, headers) {
  if (ownerTransfers >= MAX_OWNER_TRANSFERS) {
    response.writeHead(429, headers({ 'Content-Length': 0, 'Retry-After': '1', 'Cache-Control': 'no-store' }));
    response.end(); return;
  }
  ownerTransfers++;
  try { return await transferOwnerFile(request, response, filename, headers); }
  finally { ownerTransfers--; }
}

async function transferOwnerFile(request, response, filename, headers) {
  const file = await fsp.open(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let ownsBase64Slot = false;
  try {
    const stat = await file.stat();
    if (!stat.isFile()) { response.writeHead(404, headers()); response.end(); return; }
    const etag = `"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
    const modified = stat.mtime.toUTCString();
    const ifRange = request.headers['if-range'];
    const canRange = !ifRange || ifRange === etag || ifRange === modified;
    let selected;
    try { selected = rangeFor(canRange ? request.headers.range : '', stat.size); }
    catch { response.writeHead(416, headers({ 'Content-Range': `bytes */${stat.size}`, 'Content-Length': 0 })); response.end(); return; }
    const { start, end } = selected || { start: 0, end: stat.size - 1 };
    const length = Math.max(0, end - start + 1);
    const base64 = new URL(request.url, 'http://localhost').searchParams.get('b64') === '1';
    if (base64 && (!selected || length > MAX_BASE64_BYTES)) {
      response.writeHead(413, headers({ 'Content-Length': 0, 'Cache-Control': 'no-store' })); response.end(); return;
    }
    const responseHeaders = headers({
      'Accept-Ranges': 'bytes',
      // Encoded chunks intentionally return 200 for the sync-XHR bridge, not
      // a byte-range representation. Never cache one chunk as the entire URL.
      'Cache-Control': base64 ? 'no-store' : 'private, max-age=3600',
      ETag: etag, 'Last-Modified': modified,
      'Content-Length': base64 ? 4 * Math.ceil(length / 3) : length,
      'Content-Type': base64 ? 'text/plain; charset=us-ascii' : 'application/octet-stream',
      ...(!base64 && selected ? { 'Content-Range': `bytes ${start}-${end}/${stat.size}` } : {})
    });
    const status = base64 ? 200 : selected ? 206 : 200;
    if (request.method === 'HEAD' || !length) { response.writeHead(status, responseHeaders); response.end(); return; }
    if (base64) {
      if (base64Readers >= MAX_BASE64_READERS) { response.writeHead(429, headers({ 'Content-Length': 0, 'Retry-After': '1' })); response.end(); return; }
      base64Readers++; ownsBase64Slot = true;
      const bytes = Buffer.alloc(length);
      let offset = 0;
      while (offset < length) {
        if (response.destroyed) return;
        const { bytesRead } = await file.read(bytes, offset, length - offset, start + offset);
        if (!bytesRead) throw Error('Owner file changed during read');
        offset += bytesRead;
      }
      if (response.destroyed) return;
      response.writeHead(status, responseHeaders);
      response.end(bytes.toString('base64'));
      // Keep the slot until the response drains or the client disconnects;
      // slow clients must not accumulate an unbounded queue of encoded chunks.
      try { await finished(response, { cleanup: true }); }
      catch (error) { if (!response.destroyed) throw error; }
      return;
    }
    const stream = fs.createReadStream(filename, { fd: file.fd, autoClose: false, start, end });
    const aborted = () => stream.destroy();
    response.once('close', aborted);
    response.writeHead(status, responseHeaders);
    try { await pipeline(stream, response); }
    catch (error) { if (!response.destroyed) throw error; }
    finally { response.off('close', aborted); }
  } finally {
    if (ownsBase64Slot) base64Readers--;
    await file.close();
  }
}
module.exports = { rangeFor, serveOwnerFile, MAX_BASE64_BYTES, MAX_BASE64_READERS, MAX_OWNER_TRANSFERS };
