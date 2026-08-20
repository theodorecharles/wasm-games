'use strict';

const DEFAULT_MATCH_SLOTS = 12;
const MIN_MATCH_SLOTS = 2;
const MAX_MATCH_SLOTS = 63;

function parseMatchSlots(value) {
  if (value == null || String(value).trim() === '') {
    return DEFAULT_MATCH_SLOTS;
  }
  const slots = Number(value);
  if (!Number.isInteger(slots) || slots < MIN_MATCH_SLOTS || slots > MAX_MATCH_SLOTS) {
    throw new Error('ETJS_SLOTS must be an integer from ' + MIN_MATCH_SLOTS + ' to ' + MAX_MATCH_SLOTS);
  }
  return slots;
}

/** Human + bot population maintained in the one shared match. */
const MATCH_SLOTS = parseMatchSlots(process.env.ETJS_SLOTS);

/**
 * How many bots the dedicated match should run for H connected humans.
 * Shipped policy: bots = max(0, 12 - H).
 */
function desiredBots(humanCount, slots) {
  const max = slots == null ? MATCH_SLOTS : Number(slots);
  const humans = Math.max(0, Number(humanCount) || 0);
  if (!Number.isFinite(max) || max < 0) {
    return 0;
  }
  return Math.max(0, max - humans);
}

/**
 * Diff the live roster against the fill policy.
 * A human join (humans + 1) reduces target bots by 1; a leave raises it by 1.
 */
function fillPlan(state) {
  const slots = state && state.slots != null ? Number(state.slots) : MATCH_SLOTS;
  const humans = Math.max(0, Number(state && state.humans) || 0);
  const bots = Math.max(0, Number(state && state.bots) || 0);
  const target = desiredBots(humans, slots);
  return {
    humans: humans,
    bots: bots,
    target: target,
    slots: slots,
    add: Math.max(0, target - bots),
    remove: Math.max(0, bots - target)
  };
}

/**
 * Drive add/remove hooks until the roster matches desiredBots(humans).
 * hooks.addBot(state) / hooks.removeBot(state) mutate `state` (or its backing store).
 */
function applyFill(state, hooks) {
  if (!hooks || typeof hooks.addBot !== 'function' || typeof hooks.removeBot !== 'function') {
    throw new Error('applyFill requires addBot and removeBot hooks');
  }
  const plan = fillPlan(state);
  for (let i = 0; i < plan.add; i++) {
    hooks.addBot(state, i);
  }
  for (let i = 0; i < plan.remove; i++) {
    hooks.removeBot(state, i);
  }
  return fillPlan(state);
}

module.exports = {
  DEFAULT_MATCH_SLOTS: DEFAULT_MATCH_SLOTS,
  MIN_MATCH_SLOTS: MIN_MATCH_SLOTS,
  MAX_MATCH_SLOTS: MAX_MATCH_SLOTS,
  MATCH_SLOTS: MATCH_SLOTS,
  parseMatchSlots: parseMatchSlots,
  desiredBots: desiredBots,
  fillPlan: fillPlan,
  applyFill: applyFill
};
