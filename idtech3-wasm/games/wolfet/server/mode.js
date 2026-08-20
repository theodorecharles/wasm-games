'use strict';

const DEFAULT_MODE = 'arcade';
const MODES = Object.freeze(['vanilla', 'arcade']);

function parseMode(value) {
  const mode = value == null || String(value).trim() === ''
    ? DEFAULT_MODE
    : String(value).trim().toLowerCase();
  if (!MODES.includes(mode)) {
    throw new Error('ETJS_MODE must be either vanilla or arcade');
  }
  return mode;
}

const MODE = parseMode(process.env.ETJS_MODE);
const ARCADE = MODE === 'arcade';

module.exports = {
  DEFAULT_MODE: DEFAULT_MODE,
  MODES: MODES,
  MODE: MODE,
  ARCADE: ARCADE,
  GAME_SPEED: ARCADE ? 400 : 320,
  parseMode: parseMode
};
