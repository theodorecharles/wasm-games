/**
 * Persist official pk3 bytes so a later visit does not re-download.
 * Uses IndexedDB in the browser (pak0 is far past localStorage quota).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.ETJSPk3 = api;
  } else if (root) {
    root.ETJSPk3 = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function memoryBackend() {
    var map = Object.create(null);
    return {
      get: function (name) {
        return Promise.resolve(Object.prototype.hasOwnProperty.call(map, name) ? map[name] : null);
      },
      put: function (name, bytes) {
        map[name] = bytes;
        return Promise.resolve();
      }
    };
  }

  function idbBackend(dbName, storeName) {
    dbName = dbName || 'etjs-pk3';
    storeName = storeName || 'paks';
    function openDb() {
      return new Promise(function (resolve, reject) {
        if (typeof indexedDB === 'undefined') {
          reject(new Error('indexedDB is not available'));
          return;
        }
        var req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = function () {
          if (!req.result.objectStoreNames.contains(storeName)) {
            req.result.createObjectStore(storeName);
          }
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error || new Error('idb open failed')); };
      });
    }
    return {
      get: function (name) {
        return openDb().then(function (db) {
          return new Promise(function (resolve, reject) {
            var tx = db.transaction(storeName, 'readonly');
            var req = tx.objectStore(storeName).get(name);
            req.onsuccess = function () { resolve(req.result || null); };
            req.onerror = function () { reject(req.error); };
          });
        });
      },
      put: function (name, bytes) {
        return openDb().then(function (db) {
          return new Promise(function (resolve, reject) {
            var tx = db.transaction(storeName, 'readwrite');
            var req = tx.objectStore(storeName).put(bytes, name);
            req.onsuccess = function () { resolve(); };
            req.onerror = function () { reject(req.error); };
          });
        });
      }
    };
  }

  function createPk3Cache(opts) {
    var backend = (opts && opts.backend) || memoryBackend();
    var downloads = 0;

    function get(name) {
      return backend.get(name);
    }

    function put(name, bytes) {
      return backend.put(name, bytes);
    }

    /**
     * Return cached bytes if present. Otherwise call fetchFn() once, store, return.
     * fetchFn must resolve to an ArrayBuffer or Uint8Array.
     */
    function getOrFetch(name, fetchFn, validateFn) {
      return get(name).then(function (hit) {
        if (hit && (!validateFn || validateFn(hit))) {
          return { bytes: hit, cached: true };
        }
        downloads += 1;
        return Promise.resolve(fetchFn()).then(function (raw) {
          var bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
          return put(name, bytes).then(function () {
            return { bytes: bytes, cached: false };
          });
        });
      });
    }

    return {
      get: get,
      put: put,
      getOrFetch: getOrFetch,
      downloadCount: function () { return downloads; }
    };
  }

  return {
    memoryBackend: memoryBackend,
    idbBackend: idbBackend,
    createPk3Cache: createPk3Cache
  };
});
