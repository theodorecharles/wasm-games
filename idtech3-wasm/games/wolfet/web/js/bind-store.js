/**
 * Persist ET control bindings in localStorage.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.ETJSBinds = api;
  } else if (root) {
    root.ETJSBinds = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var STORAGE_KEY = 'etjs.binds';

  function storageOf(storage) {
    if (storage) {
      return storage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
    throw new Error('localStorage is not available');
  }

  function loadBinds(storage) {
    try {
      return storageOf(storage).getItem(STORAGE_KEY);
    } catch (err) {
      return null;
    }
  }

  function saveBinds(text, storage) {
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('bind config is required');
    }
    storageOf(storage).setItem(STORAGE_KEY, text);
    return text;
  }

  /**
   * Start with the complete shipped controls, then apply the player's saved
   * binds.  Old ETJS builds persisted partial configs; replacing the whole
   * default block with one of those silently removed stock keys such as T
   * (chat) and V (quick messages). Only bindings are persisted here: ETJS
   * owns the browser renderer profile, so an old native etconfig cannot
   * silently restore low-resolution graphics.
   */
  function mergeAutoexec(defaultLines, stored) {
    var lines = Array.isArray(defaultLines) ? defaultLines.slice() : [];
    if (!stored || !String(stored).trim()) {
      return lines;
    }
    var savedLines = String(stored).split(/\r?\n/).filter(function (line) {
      return /^\s*bind\s+/i.test(line);
    });
    return lines.concat(savedLines);
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    loadBinds: loadBinds,
    saveBinds: saveBinds,
    mergeAutoexec: mergeAutoexec
  };
});
