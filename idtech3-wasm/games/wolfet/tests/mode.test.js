'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const gameMode = require('../server/mode');

describe('deployment game modes', () => {
  it('defaults to arcade and accepts the two documented values', () => {
    assert.equal(gameMode.DEFAULT_MODE, 'arcade');
    assert.equal(gameMode.MODE, 'arcade');
    assert.equal(gameMode.ARCADE, true);
    assert.equal(gameMode.GAME_SPEED, 400);
    assert.equal(gameMode.parseMode(), 'arcade');
    assert.equal(gameMode.parseMode('ARCADE'), 'arcade');
    assert.equal(gameMode.parseMode('vanilla'), 'vanilla');
  });

  it('rejects ambiguous mode names', () => {
    assert.throws(() => gameMode.parseMode('fast'), /ETJS_MODE/);
    assert.throws(() => gameMode.parseMode('classic'), /ETJS_MODE/);
  });
});
