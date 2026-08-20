'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const botfill = require(path.join(__dirname, '..', 'server', 'botfill'));
const supervisor = require(path.join(__dirname, '..', 'server', 'supervisor'));
const { desiredBots, fillPlan, applyFill, MATCH_SLOTS, parseMatchSlots } = botfill;

describe('shipped bot fill policy', () => {
  it('fills to 12 bots when the match is empty', () => {
    assert.equal(MATCH_SLOTS, 12);
    assert.equal(desiredBots(0), 12);
    assert.deepEqual(fillPlan({ humans: 0, bots: 0 }).target, 12);
    assert.equal(fillPlan({ humans: 0, bots: 0 }).add, 12);
  });

  it('accepts configurable match populations and rejects invalid values', () => {
    assert.equal(parseMatchSlots(), 12);
    assert.equal(parseMatchSlots('2'), 2);
    assert.equal(parseMatchSlots('24'), 24);
    assert.equal(parseMatchSlots('63'), 63);
    assert.throws(() => parseMatchSlots('1'), /ETJS_SLOTS/);
    assert.throws(() => parseMatchSlots('64'), /ETJS_SLOTS/);
    assert.throws(() => parseMatchSlots('twelve'), /ETJS_SLOTS/);
  });

  it('uses bots = max(0, 12 - H) for each human count', () => {
    for (let h = 0; h <= 14; h++) {
      const expected = Math.max(0, 12 - h);
      assert.equal(desiredBots(h), expected, 'humans=' + h);
    }
  });

  it('a human join reduces the bot target by exactly 1', () => {
    for (let h = 0; h < 12; h++) {
      const before = desiredBots(h);
      const after = desiredBots(h + 1);
      assert.equal(after, before - 1, 'join at humans=' + h);
    }
  });

  it('a human leave raises the bot target by exactly 1', () => {
    for (let h = 1; h <= 12; h++) {
      const before = desiredBots(h);
      const after = desiredBots(h - 1);
      assert.equal(after, before + 1, 'leave at humans=' + h);
    }
  });

  it('applyFill adds and removes through the shipped hooks so join/leave changes bots by 1', () => {
    const state = { humans: 0, bots: 0, slots: 12 };
    const hooks = {
      addBot: function (s) { s.bots += 1; },
      removeBot: function (s) { s.bots = Math.max(0, s.bots - 1); }
    };

    let plan = applyFill(state, hooks);
    assert.equal(state.bots, 12);
    assert.equal(plan.target, 12);
    assert.equal(plan.add, 0);
    assert.equal(plan.remove, 0);

    state.humans += 1;
    plan = applyFill(state, hooks);
    assert.equal(state.bots, 11);
    assert.equal(plan.target, 11);
    assert.equal(plan.remove, 0);

    state.humans += 1;
    plan = applyFill(state, hooks);
    assert.equal(state.bots, 10);

    state.humans -= 1;
    plan = applyFill(state, hooks);
    assert.equal(state.bots, 11);

    state.humans = 12;
    plan = applyFill(state, hooks);
    assert.equal(state.bots, 0);
    assert.equal(plan.target, 0);
  });

  it('never schedules a negative bot count', () => {
    assert.equal(desiredBots(20), 0);
    const plan = fillPlan({ humans: 20, bots: 3 });
    assert.equal(plan.target, 0);
    assert.equal(plan.remove, 3);
    assert.equal(plan.add, 0);
  });

  it('kicks an Omni-Bot by its exact colored name', () => {
    assert.equal(supervisor.botKickCommand('^o[BOT]^7Cledus'),
      'bot kickbot ^o[BOT]^7Cledus');
  });

  it('leaves team balance to humans taking bot slots, not Omni-Bot refill', () => {
    const cfg = require('fs').readFileSync(
      path.join(__dirname, '..', 'runtime', 'omni-bot-user', 'omni-bot.cfg'),
      'utf8'
    );
    assert.match(cfg, /BalanceTeams\s+=\s+0/);
    assert.match(supervisor.GAMEPLAY_CVARS.join('\n'), /bot balanceteams 0/);
  });
});
