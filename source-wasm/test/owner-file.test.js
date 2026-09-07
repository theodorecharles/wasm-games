'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Writable } = require('node:stream');
const { setImmediate: tick } = require('node:timers/promises');
const { rangeFor, MAX_BASE64_BYTES } = require('../scripts/owner-file');

test('owner ranges handle closed, open, suffix, clipped and invalid requests', () => {
  assert.equal(rangeFor(undefined, 10), null);
  for (const [header, expected] of [
    ['bytes=0-0', [0, 0]], ['bytes=2-5', [2, 5]], ['bytes=8-', [8, 9]],
    ['bytes=-3', [7, 9]], ['bytes=-99', [0, 9]], ['bytes=2-99', [2, 9]],
  ]) assert.deepEqual(Object.values(rangeFor(header, 10)), expected, header);
  for (const header of ['bytes=-', 'bytes=-0', 'bytes=10-', 'bytes=4-2',
    'bytes=0-1,4-5', 'bytes=0-1junk', 'bytes=1.5-2', 'bytes=-1-2',
    'items=0-1', 'bytes=0-9007199254740992', 'bytes=-9007199254740992']) {
    assert.throws(() => rangeFor(header, 10), /Invalid range/, header);
  }
  assert.throws(() => rangeFor('bytes=0-', 0), /Invalid range/);
});

class Response extends Writable {
  constructor(stalled = false) { super(); this.stalled = stalled; this.chunks = []; }
  writeHead(status, headers) { this.status = status; this.headers = headers; }
  _write(chunk, _encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    if (this.stalled) this.release = callback;
    else callback();
  }
  body() { return Buffer.concat(this.chunks); }
}

// Evaluate the real helper with deterministic file I/O, so limits and aborts
// do not depend on a machine being slow enough to overlap eight disk reads.
function fixture(options = {}) {
  const state = { opens: 0, closes: 0, allocations: [], reads: 0, ...options };
  const mockFiles = {
    async open(_filename, flags) {
      assert.ok(flags & fs.constants.O_NOFOLLOW);
      state.opens++;
      if (state.openWait) await state.openWait;
      return {
        async stat() {
          return { isFile: () => true, size: state.size ?? 2 * MAX_BASE64_BYTES,
            mtimeMs: 1700000000000, mtime: new Date(1700000000000) };
        },
        async read(bytes, offset, length, position) {
          state.reads++;
          if (state.wait) await state.wait;
          if (state.fail) throw new Error('fixture read failure');
          const bytesRead = Math.min(length, state.shortRead ?? length);
          for (let i = 0; i < bytesRead; i++) bytes[offset + i] = (position + i) & 255;
          return { bytesRead };
        },
        async close() { state.closes++; }
      };
    }
  };
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../scripts/owner-file.js'), 'utf8');
  vm.runInNewContext(source, {
    module, URL,
    require: name => name === 'node:fs/promises' ? mockFiles : require(name),
    Buffer: new Proxy(Buffer, { get(target, key) {
      if (key === 'alloc') return length => { state.allocations.push(length); return Buffer.alloc(length); };
      return Reflect.get(target, key);
    } }),
  }, { filename: 'owner-file.js' });
  return {
    state,
    maxReaders: module.exports.MAX_BASE64_READERS,
    maxTransfers: module.exports.MAX_OWNER_TRANSFERS,
    serve(response, { range = 'bytes=0-7', method = 'GET', ifRange } = {}) {
      return module.exports.serveOwnerFile({ method, url: '/owner/test.bin?b64=1',
        headers: { range, 'if-range': ifRange } }, response, '/fixture', value => value);
    }
  };
}

async function until(check) {
  for (let i = 0; i < 100; i++) { if (check()) return; await tick(); }
  assert.ok(check(), 'fixture did not reach the expected async boundary');
}

test('base64 range boundary, partial reads, no-store and HEAD without allocation', async () => {
  const f = fixture({ shortRead: 3 });
  const response = new Response();
  await f.serve(response);
  assert.equal(response.status, 200);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(response.headers['Content-Length'], 12);
  assert.equal(response.headers['Content-Range'], undefined);
  assert.deepEqual([...Buffer.from(response.body().toString(), 'base64')], [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(f.state.reads, 3, 'short reads are completed, never silently padded');
  assert.deepEqual(f.state.allocations, [8]);
  const head = new Response();
  await f.serve(head, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers['Content-Length'], 12);
  assert.equal(head.body().length, 0);
  assert.deepEqual(f.state.allocations, [8]);
  f.state.shortRead = undefined;
  await f.serve(new Response(), { range: `bytes=0-${MAX_BASE64_BYTES - 1}` });
  assert.equal(f.state.allocations.at(-1), MAX_BASE64_BYTES);
  assert.equal(f.state.opens, f.state.closes);
});

test('unbounded, oversized, malformed and stale encoded requests fail before allocation', async () => {
  const f = fixture();
  for (const [options, status] of [
    [{ range: '' }, 413], [{ range: 'bytes=0-' }, 413],
    [{ range: `bytes=0-${MAX_BASE64_BYTES}` }, 413],
    [{ range: 'bytes=0-1,4-5' }, 416], [{ range: 'bytes=-0' }, 416],
    [{ range: 'bytes=0-7', ifRange: '"old"' }, 413],
  ]) {
    const response = new Response();
    await f.serve(response, options);
    assert.equal(response.status, status);
    assert.equal(response.body().length, 0);
  }
  assert.equal(f.state.reads, 0);
  assert.deepEqual(f.state.allocations, []);
  assert.equal(f.state.opens, f.state.closes);
});

test('encoded concurrency stays bounded until slow responses drain or abort', async () => {
  const f = fixture();
  const responses = Array.from({ length: f.maxReaders }, () => new Response(true));
  const jobs = responses.map(response => f.serve(response));
  try {
    await until(() => responses.every(response => response.release));
    const overflow = new Response();
    await f.serve(overflow);
    assert.equal(overflow.status, 429);
    assert.equal(overflow.headers['Retry-After'], '1');
    assert.equal(f.state.allocations.length, f.maxReaders);
    responses[0].release();
    await jobs[0];
    const next = new Response();
    await f.serve(next);
    assert.equal(next.status, 200, 'a drained response releases its slot');
  } finally {
    for (const response of responses) response.destroy();
    await Promise.all(jobs);
  }
  const retry = new Response();
  await f.serve(retry);
  assert.equal(retry.status, 200, 'aborted responses release their slots');
  assert.equal(f.state.opens, f.state.closes, 'every opened descriptor closes');
});

test('read failure, early EOF and disconnect during reading close files and release slots', async () => {
  const f = fixture({ fail: true });
  await assert.rejects(f.serve(new Response()), /fixture read failure/);
  f.state.fail = false; f.state.shortRead = 0;
  await assert.rejects(f.serve(new Response()), /changed during read/);
  f.state.shortRead = undefined;
  let resume;
  f.state.wait = new Promise(resolve => { resume = resolve; });
  const response = new Response();
  const previousReads = f.state.reads;
  const pending = f.serve(response);
  await until(() => f.state.reads > previousReads);
  response.destroy(); resume();
  await pending;
  assert.equal(response.status, undefined, 'do not write headers after disconnect');
  assert.equal(response.body().length, 0);
  f.state.wait = undefined;
  await f.serve(new Response());
  assert.equal(f.state.opens, f.state.closes);
});

test('all transfers are admitted before opening files, including stalled metadata reads', async () => {
  let resume;
  const f = fixture({ openWait: new Promise(resolve => { resume = resolve; }) });
  const responses = Array.from({ length: f.maxTransfers }, () => new Response());
  const pending = responses.map(response => f.serve(response, { method: 'HEAD' }));
  try {
    await until(() => f.state.opens === f.maxTransfers);
    const overflow = new Response();
    await f.serve(overflow, { method: 'HEAD' });
    assert.equal(overflow.status, 429);
    assert.equal(f.state.opens, f.maxTransfers, 'overload never opens another descriptor');
  } finally { resume(); await Promise.all(pending); }
  assert.ok(responses.every(response => response.status === 200));
  assert.equal(f.state.opens, f.state.closes);
  const retry = new Response();
  await f.serve(retry, { method: 'HEAD' });
  assert.equal(retry.status, 200);
  assert.deepEqual(f.state.allocations, []);
});
