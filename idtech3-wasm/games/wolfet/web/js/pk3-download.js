/**
 * Same-origin, bounded-response PK3 downloader. Large files are assembled into
 * one destination buffer from HTTP byte ranges so proxies never need to carry
 * a single 100+ MiB response.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.ETJSPk3Download = api;
  } else if (root) {
    root.ETJSPk3Download = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var RANGE_CHUNK = 16 * 1024 * 1024;

  function fetchPakBytes(file, onProgress, fetchFn, chunkSize) {
    fetchFn = fetchFn || fetch;
    chunkSize = chunkSize || RANGE_CHUNK;

    function checkedBuffer(res, expected) {
      if (!res.ok) {
        throw new Error('failed to fetch ' + file.url + ' (' + res.status + ')');
      }
      return res.arrayBuffer().then(function (buf) {
        if (expected && buf.byteLength !== expected) {
          throw new Error('size mismatch for ' + file.name + ': expected ' + expected + ', got ' + buf.byteLength);
        }
        return buf;
      });
    }

    if (file.bytes > chunkSize) {
      var output = new Uint8Array(file.bytes);
      var offset = 0;
      function nextRange() {
        if (offset >= file.bytes) {
          return output;
        }
        var end = Math.min(offset + chunkSize, file.bytes) - 1;
        var expected = end - offset + 1;
        return fetchFn(file.url, { headers: { Range: 'bytes=' + offset + '-' + end } }).then(function (res) {
          /* A direct origin may ignore Range. Accept one exact full response;
           * proxied ETJS hosts return 206 chunks, keeping each below 16 MiB. */
          if (res.status === 200 && offset === 0) {
            return checkedBuffer(res, file.bytes).then(function (full) {
              if (onProgress) {
                onProgress(full.byteLength, full.byteLength);
              }
              return new Uint8Array(full);
            });
          }
          if (res.status !== 206) {
            throw new Error('range fetch failed for ' + file.url + ' (' + res.status + ')');
          }
          return checkedBuffer(res, expected).then(function (part) {
            output.set(new Uint8Array(part), offset);
            offset += expected;
            if (onProgress) {
              onProgress(offset, file.bytes);
            }
            return nextRange();
          });
        });
      }
      return Promise.resolve().then(nextRange);
    }

    return fetchFn(file.url).then(function (res) {
      return checkedBuffer(res, file.bytes).then(function (buf) {
        if (onProgress) {
          onProgress(buf.byteLength, buf.byteLength);
        }
        return buf;
      });
    });
  }

  return {
    RANGE_CHUNK: RANGE_CHUNK,
    fetchPakBytes: fetchPakBytes
  };
});
