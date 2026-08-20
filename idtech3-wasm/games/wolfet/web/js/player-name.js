/**
 * Player name persistence + in-game name args.
 * Loaded by the site (browser) and by tests (Node). No Node-only exports.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.ETJSName = api;
  } else if (root) {
    root.ETJSName = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var STORAGE_KEY = 'etjs.playerName';
  var DEFAULT_NAME = 'ETPlayer';
  var MAX_LEN = 32;

  function storageOf(storage) {
    if (storage) {
      return storage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
    throw new Error('localStorage is not available');
  }

  function normalizeName(name) {
    if (typeof name !== 'string') {
      return '';
    }
    return name.replace(/[\u0000-\u001f\\\"%;]/g, '').trim().slice(0, MAX_LEN);
  }

  function loadPlayerName(storage) {
    var raw;
    try {
      raw = storageOf(storage).getItem(STORAGE_KEY);
    } catch (err) {
      return null;
    }
    var name = normalizeName(raw || '');
    return name || null;
  }

  function savePlayerName(name, storage) {
    var n = normalizeName(name);
    if (!n) {
      throw new Error('player name is required');
    }
    storageOf(storage).setItem(STORAGE_KEY, n);
    return n;
  }

  /**
   * Engine command-line tokens that set the in-game player name.
   */
  function nameToGameArgs(name) {
    var n = normalizeName(name) || DEFAULT_NAME;
    return ['+set', 'name', n];
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_NAME: DEFAULT_NAME,
    normalizeName: normalizeName,
    loadPlayerName: loadPlayerName,
    savePlayerName: savePlayerName,
    nameToGameArgs: nameToGameArgs
  };
});
