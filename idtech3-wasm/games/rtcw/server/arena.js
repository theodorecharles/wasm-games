'use strict';

const MAP_ROTATION = Object.freeze(['mp_depot']);
const GAMETYPE = 5;
const MATCH_SLOTS = 8;
const TEAMS = Object.freeze(['axis', 'allies']);
const CLASSES = Object.freeze(['soldier', 'medic', 'engineer', 'lieutenant']);
const MANAGED_CONNECT = '127.0.0.1:27960';
const BOT_POLICY = 'omnibot';

function rotation() {
  return MAP_ROTATION.slice();
}

function isDepotOnly(maps) {
  const values = Array.from(maps || []);
  return values.length === 1 && values[0] === 'mp_depot';
}

function nextMap(current) {
  return 'mp_depot';
}

function chooseStartMap(requested) {
  const value = String(requested || '').toLowerCase();
  return value === 'mp_depot' ? 'mp_depot' : 'mp_depot';
}

function desiredBots(humanCount, slots) {
  const max = slots == null ? MATCH_SLOTS : Number(slots);
  const humans = Math.max(0, Number(humanCount) || 0);
  if (!Number.isFinite(max) || max < 0) return 0;
  return Math.max(0, max - humans);
}

function fillPlan(state) {
  const slots = state && state.slots != null ? Number(state.slots) : MATCH_SLOTS;
  const humans = Math.max(0, Number(state && state.humans) || 0);
  const bots = Math.max(0, Number(state && state.bots) || 0);
  const target = desiredBots(humans, slots);
  return Object.freeze({
    humans,
    bots,
    target,
    slots,
    add: Math.max(0, target - bots),
    remove: Math.max(0, bots - target)
  });
}

async function applyFill(state, hooks) {
  if (!hooks || typeof hooks.setLimits !== 'function') {
    throw new Error('applyFill requires Omni-Bot setLimits hook');
  }
  const plan = fillPlan(state);
  if (plan.target !== plan.bots || hooks.force === true) {
    await hooks.setLimits(plan);
  }
  return fillPlan({ ...state, bots: plan.target });
}

function nextBotAssignment(index) {
  const n = Math.max(0, Number(index) || 0);
  return Object.freeze({
    team: TEAMS[n % TEAMS.length],
    className: CLASSES[n % CLASSES.length]
  });
}

function botMinCommand(count) {
  return `bot minbots ${Math.max(0, Number(count) || 0)}`;
}

function botMaxCommand(count) {
  return `bot maxbots ${Math.max(0, Number(count) || 0)}`;
}

function requiredFrameworkFiles() {
  return Object.freeze([
    'omnibot_rtcw.x86_64.so',
    'native/qagame.mp.x86_64.so',
    'rtcw/nav/mp_depot.way',
    'rtcw/nav/mp_depot.gm',
    'rtcw/nav/mp_depot_goals.gm',
    'rtcw/scripts/rtcw_autoexec.gm',
    'global_scripts/server_manager.gm'
  ]);
}

function isOverflowLine(line) {
  return /Server command overflow/i.test(String(line || ''));
}

function isFrameworkLoadedLine(line) {
  return /Omni-Bot.*loaded|OmniBot.*loaded|Bot Interface Initialized|omnibot_rtcw/i.test(String(line || ''));
}

function isOmniBotName(name) {
  return /\[BOT\]/i.test(String(name || ''));
}

function classifyPlayer(player) {
  const value = player || {};
  if (value.bot === true || value.address === 'bot' || isOmniBotName(value.name)) return 'bot';
  return 'human';
}

function rosterFromPlayers(players) {
  const list = Array.from(players || []).map(player => {
    const kind = classifyPlayer(player);
    return Object.freeze({ ...player, kind });
  });
  return Object.freeze({
    players: Object.freeze(list),
    humans: list.filter(player => player.kind === 'human').length,
    bots: list.filter(player => player.kind === 'bot').length
  });
}

function assignmentsCoverTeamsAndClasses(count) {
  const seenTeams = new Set();
  const seenClasses = new Set();
  for (let index = 0; index < count; index += 1) {
    const assignment = nextBotAssignment(index);
    seenTeams.add(assignment.team);
    seenClasses.add(assignment.className);
  }
  return seenTeams.size === TEAMS.length && seenClasses.size === CLASSES.length;
}

function joinKeepsRuntime(showRuntimeCalls) {
  return !Array.from(showRuntimeCalls || []).includes('launcher');
}

module.exports = Object.freeze({
  MAP_ROTATION,
  GAMETYPE,
  MATCH_SLOTS,
  TEAMS,
  CLASSES,
  MANAGED_CONNECT,
  BOT_POLICY,
  rotation,
  isDepotOnly,
  nextMap,
  chooseStartMap,
  desiredBots,
  fillPlan,
  applyFill,
  nextBotAssignment,
  botMinCommand,
  botMaxCommand,
  requiredFrameworkFiles,
  isOverflowLine,
  isFrameworkLoadedLine,
  isOmniBotName,
  classifyPlayer,
  rosterFromPlayers,
  assignmentsCoverTeamsAndClasses,
  joinKeepsRuntime
});
