'use strict';

const DEFAULT_IDLE_TIMEOUT_SECONDS = 15 * 60;

function parseBoolean(value, fallback, name) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
    return false;
  }
  throw new Error((name || 'boolean value') + ' must be true or false');
}

function parseIdleTimeout(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return DEFAULT_IDLE_TIMEOUT_SECONDS;
  }
  const match = /^(\d+)(s|m|h)?$/i.exec(String(value).trim());
  if (!match) {
    throw new Error('IDLE_TIMEOUT must be seconds or a duration such as 15m or 2h');
  }
  const multiplier = !match[2] || match[2].toLowerCase() === 's'
    ? 1
    : (match[2].toLowerCase() === 'm' ? 60 : 3600);
  const seconds = Number(match[1]) * multiplier;
  if (!Number.isSafeInteger(seconds) || seconds < 10 || seconds > 7 * 24 * 60 * 60) {
    throw new Error('IDLE_TIMEOUT must be between 10 seconds and 7 days');
  }
  return seconds;
}

const KEEP_ALIVE = parseBoolean(
  process.env.KEEP_ALIVE === undefined
    ? (process.env.keep_alive === undefined ? process.env.ETJS_KEEP_ALIVE : process.env.keep_alive)
    : process.env.KEEP_ALIVE,
  false,
  'KEEP_ALIVE'
);
const IDLE_TIMEOUT_SECONDS = parseIdleTimeout(
  process.env.IDLE_TIMEOUT === undefined
    ? (process.env.idle_timeout === undefined ? process.env.ETJS_IDLE_TIMEOUT : process.env.idle_timeout)
    : process.env.IDLE_TIMEOUT
);

function createLifecycle(options) {
  const opts = options || {};
  const keepAlive = opts.keepAlive === undefined ? KEEP_ALIVE : !!opts.keepAlive;
  const idleTimeoutMs = opts.idleTimeoutMs || IDLE_TIMEOUT_SECONDS * 1000;
  const intervalMs = opts.intervalMs || Math.min(5000, Math.max(1000, Math.floor(idleTimeoutMs / 4)));
  const now = opts.now || Date.now;
  const log = opts.log || function () {};
  let state = 'sleeping';
  let map = null;
  let humans = 0;
  let lastHumanAt = now();
  let startPromise = null;
  let stopPromise = null;
  let timer = null;

  function processIsRunning() {
    return !opts.isRunning || opts.isRunning();
  }

  function status() {
    return {
      state: state,
      map: map,
      humans: humans,
      keepAlive: keepAlive,
      idleTimeoutSeconds: Math.round(idleTimeoutMs / 1000),
      idleSeconds: state === 'running' && humans === 0
        ? Math.max(0, Math.floor((now() - lastHumanAt) / 1000))
        : 0
    };
  }

  async function wake(reason) {
    if (stopPromise) {
      await stopPromise;
    }
    if (state === 'running' && !processIsRunning()) {
      await sleep('process exited');
    }
    if (state === 'running' && processIsRunning()) {
      return status();
    }
    if (startPromise) {
      return startPromise;
    }

    state = 'starting';
    log('waking dedicated server' + (reason ? ' (' + reason + ')' : ''));
    startPromise = Promise.resolve().then(opts.start).then((result) => {
      state = 'running';
      map = result && result.map ? result.map : null;
      humans = 0;
      lastHumanAt = now();
      log('dedicated server awake' + (map ? ' on ' + map : ''));
      return status();
    }).catch((err) => {
      state = 'sleeping';
      map = null;
      throw err;
    }).finally(() => {
      startPromise = null;
    });
    return startPromise;
  }

  function observeHumans(count) {
    humans = Math.max(0, Number(count) || 0);
    if (humans > 0) {
      lastHumanAt = now();
    }
  }

  async function sleep(reason) {
    if (startPromise) {
      await startPromise;
    }
    if (state === 'sleeping' && !processIsRunning()) {
      return status();
    }
    if (stopPromise) {
      return stopPromise;
    }
    state = 'stopping';
    log('stopping dedicated server' + (reason ? ' (' + reason + ')' : ''));
    stopPromise = Promise.resolve().then(opts.stop).then(() => {
      state = 'sleeping';
      map = null;
      humans = 0;
      log('dedicated server is sleeping');
      return status();
    }).finally(() => {
      stopPromise = null;
    });
    return stopPromise;
  }

  async function checkIdle() {
    if (keepAlive || state !== 'running') {
      return false;
    }
    if (!processIsRunning()) {
      await sleep('process exited');
      return true;
    }
    if (humans > 0) {
      lastHumanAt = now();
      return false;
    }
    if (humans === 0 && now() - lastHumanAt >= idleTimeoutMs) {
      await sleep('no human players for ' + Math.round(idleTimeoutMs / 1000) + 's');
      return true;
    }
    return false;
  }

  function startMonitoring() {
    if (!timer) {
      timer = setInterval(() => {
        checkIdle().catch((err) => log('idle monitor: ' + err.message));
      }, intervalMs);
      if (timer.unref) {
        timer.unref();
      }
    }
  }

  async function shutdown() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (state !== 'sleeping' || processIsRunning()) {
      await sleep('host shutdown');
    }
  }

  return {
    wake: wake,
    sleep: sleep,
    checkIdle: checkIdle,
    observeHumans: observeHumans,
    startMonitoring: startMonitoring,
    shutdown: shutdown,
    status: status
  };
}

module.exports = {
  DEFAULT_IDLE_TIMEOUT_SECONDS: DEFAULT_IDLE_TIMEOUT_SECONDS,
  KEEP_ALIVE: KEEP_ALIVE,
  IDLE_TIMEOUT_SECONDS: IDLE_TIMEOUT_SECONDS,
  parseBoolean: parseBoolean,
  parseIdleTimeout: parseIdleTimeout,
  createLifecycle: createLifecycle
};
