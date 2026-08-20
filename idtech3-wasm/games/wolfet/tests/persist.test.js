'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const binds = require(path.join(ROOT, 'web', 'js', 'bind-store.js'));
const pk3 = require(path.join(ROOT, 'web', 'js', 'pk3-cache.js'));
const download = require(path.join(ROOT, 'web', 'js', 'pk3-download.js'));

function memoryStorage() {
  const data = Object.create(null);
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; }
  };
}

describe('binding persist in localStorage', () => {
  it('saves a bind dump and reads it back', () => {
    const storage = memoryStorage();
    binds.saveBinds('bind w +forward\nbind MOUSE1 +attack\n', storage);
    assert.match(binds.loadBinds(storage), /bind w \+forward/);
    assert.match(binds.loadBinds(storage), /MOUSE1 \+attack/);
  });

  it('mergeAutoexec prefers the stored binds over default bind lines', () => {
    const defaults = [
      'set rate 25000', 'unbindall', 'bind w +forward',
      'bind f +activate', 'bind t messagemode', 'bind v mp_quickmessage',
      'set r_picmip 0'
    ];
    const stored = 'unbindall\nbind w +back\nbind e +leanright\nbind MOUSE1 +attack\nset r_picmip 3';
    const merged = binds.mergeAutoexec(defaults, stored);
    assert.ok(merged.includes('set rate 25000'));
    assert.equal(merged.filter((l) => /^\s*unbindall\b/i.test(l)).length, 1);
    assert.ok(merged.indexOf('bind w +back') > merged.indexOf('bind w +forward'));
    assert.ok(merged.includes('bind t messagemode'));
    assert.ok(merged.includes('bind v mp_quickmessage'));
    assert.ok(merged.includes('bind f +activate'));
    assert.ok(merged.some((l) => /bind e \+leanright/.test(l)));
    assert.ok(merged.some((l) => /MOUSE1 \+attack/.test(l)));
    assert.ok(!merged.includes('set r_picmip 3'));
  });
});

describe('pk3 persist get-after-put (no re-download)', () => {
  it('second getOrFetch for the same pak does not call fetch again', async () => {
    const cache = pk3.createPk3Cache({ backend: pk3.memoryBackend() });
    const payload = new Uint8Array([1, 2, 3, 4]);
    let fetches = 0;
    const fetchFn = function () {
      fetches += 1;
      return payload;
    };
    const first = await cache.getOrFetch('pak0.pk3', fetchFn);
    assert.equal(first.cached, false);
    assert.equal(fetches, 1);
    const second = await cache.getOrFetch('pak0.pk3', fetchFn);
    assert.equal(second.cached, true);
    assert.equal(fetches, 1);
    assert.equal(cache.downloadCount(), 1);
    assert.deepEqual(Array.from(second.bytes), [1, 2, 3, 4]);
  });

  it('fetches a new copy when a content-addressed pak cache key changes', async () => {
    const cache = pk3.createPk3Cache({ backend: pk3.memoryBackend() });
    let fetches = 0;
    const fetchFn = function () {
      fetches += 1;
      return new Uint8Array([fetches]);
    };
    await cache.getOrFetch('etjs.pk3@sha256:old', fetchFn);
    const oldHit = await cache.getOrFetch('etjs.pk3@sha256:old', fetchFn);
    const newVersion = await cache.getOrFetch('etjs.pk3@sha256:new', fetchFn);
    assert.equal(oldHit.cached, true);
    assert.equal(newVersion.cached, false);
    assert.equal(fetches, 2);
    assert.deepEqual(Array.from(newVersion.bytes), [2]);
  });

  it('repairs a cached pak whose byte length is invalid', async () => {
    const backend = pk3.memoryBackend();
    const cache = pk3.createPk3Cache({ backend: backend });
    const key = 'pak0.pk3@sha256:valid';
    let fetches = 0;
    await backend.put(key, new Uint8Array([1, 2]));
    const result = await cache.getOrFetch(key, function () {
      fetches += 1;
      return new Uint8Array([1, 2, 3, 4]);
    }, function (bytes) {
      return bytes.byteLength === 4;
    });
    assert.equal(result.cached, false);
    assert.equal(fetches, 1);
    assert.deepEqual(Array.from(await backend.get(key)), [1, 2, 3, 4]);
  });
});

describe('bounded PK3 transfer', () => {
  it('assembles a large file from ordered byte ranges with progress', async () => {
    const source = Uint8Array.from({ length: 10 }, (_, i) => i + 1);
    const ranges = [];
    const progress = [];
    const fakeFetch = async function (url, opts) {
      const match = /bytes=(\d+)-(\d+)/.exec(opts.headers.Range);
      const start = Number(match[1]);
      const end = Number(match[2]);
      ranges.push([start, end]);
      const part = source.slice(start, end + 1);
      return { ok: true, status: 206, arrayBuffer: async () => part.buffer };
    };
    const result = await download.fetchPakBytes(
      { name: 'large.pk3', url: '/large.pk3?v=abc', bytes: source.length },
      (done, total) => progress.push([done, total]), fakeFetch, 4
    );
    assert.deepEqual(ranges, [[0, 3], [4, 7], [8, 9]]);
    assert.deepEqual(Array.from(result), Array.from(source));
    assert.deepEqual(progress.at(-1), [10, 10]);
  });

  it('rejects a truncated response instead of caching it', async () => {
    const fakeFetch = async function () {
      const part = new Uint8Array([1, 2, 3]);
      return { ok: true, status: 200, arrayBuffer: async () => part.buffer };
    };
    await assert.rejects(
      download.fetchPakBytes({ name: 'bad.pk3', url: '/bad.pk3', bytes: 4 }, null, fakeFetch, 16),
      /size mismatch/
    );
  });
});
