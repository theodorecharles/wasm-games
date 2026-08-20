'use strict';

const DEFAULT_MODE = 'arcade';
const MODES = Object.freeze(['vanilla', 'arcade']);

function parseMode(value) {
  const mode = value == null || String(value).trim() === ''
    ? DEFAULT_MODE
    : String(value).trim().toLowerCase();
  if (!MODES.includes(mode)) {
    throw new Error('RTCW_MODE must be either vanilla or arcade');
  }
  return mode;
}

const MODE = parseMode(process.env.RTCW_MODE);
const ARCADE = MODE === 'arcade';

module.exports = Object.freeze({
  DEFAULT_MODE,
  MODES,
  MODE,
  ARCADE,
  GAME_SPEED: ARCADE ? 400 : 320,
  parseMode
});
