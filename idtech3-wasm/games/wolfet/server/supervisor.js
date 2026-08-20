'use strict';

const { fillPlan, applyFill, MATCH_SLOTS } = require('./botfill');
const { queryStatus } = require('./status');
const { sendRcon } = require('./rcon');
const gameMode = require('./mode');

const TEAMS = ['axis', 'allies'];
const CLASSES = ['soldier', 'medic', 'engineer', 'fieldops', 'covertops'];
const GAMEPLAY_CVARS = [
  'set g_etjsArcade ' + (gameMode.ARCADE ? '1' : '0'),
  'set g_speed ' + gameMode.GAME_SPEED,
  'set g_friendlyFire 0',
  'set g_forcerespawn 1',
  'set g_bluelimbotime 1000',
  'set g_redlimbotime 1000',
  /* Supervisor owns fill. Omni-Bot must not immediately re-add a bot after
   * a human takes that slot or after we kick down to target. */
  'bot balanceteams 0'
];

function isLikelyHuman(player) {
  return player.kind === 'human';
}

/**
 * Omni-Bot reports ping 0. After a protocol connect, humans can also be
 * ping 0 until they send snapshots — callers may pass extra human names.
 */
function rosterFromStatus(status, humanNames) {
  const named = new Set((humanNames || []).map((n) => String(n).toLowerCase()));
  let humans = 0;
  let bots = 0;
  (status.players || []).forEach((p) => {
    const n = String(p.name || '');
    if (/\[BOT\]/i.test(n) || p.kind === 'bot') {
      bots += 1;
    } else if (named.has(n.toLowerCase()) || p.kind === 'human') {
      humans += 1;
    } else {
      bots += 1;
    }
  });
  return { humans: humans, bots: bots, slots: MATCH_SLOTS };
}

function botKickCommand(name) {
  /* Omni-Bot matches its exact BotTable name, including ^o[BOT]^7. Its command
   * dispatcher treats quote marks literally, so send the colorized name raw;
   * stripping colors or adding quotes produces a non-match and repeated RCON. */
  const exactName = String(name || '').replace(/[\r\n"]/g, '').trim();
  return exactName ? 'bot kickbot ' + exactName : 'bot kickbot';
}

function makeRconHooks(rconOpts, log, botNames) {
  let addIndex = 0;
  const names = (botNames || []).slice();
  return {
    addBot: async function () {
      const team = TEAMS[addIndex % TEAMS.length];
      const cls = CLASSES[addIndex % CLASSES.length];
      addIndex += 1;
      const cmd = 'bot addbot ' + team + ' ' + cls;
      if (log) {
        log('botfill add: ' + cmd);
      }
      try {
        await sendRcon(cmd, rconOpts);
      } catch (err) {
        if (log) {
          log('botfill add failed: ' + err.message);
        }
      }
    },
    removeBot: async function () {
      const raw = names.pop();
      const cmd = botKickCommand(raw);
      if (log) {
        log('botfill remove: ' + cmd);
      }
      try {
        await sendRcon(cmd, rconOpts);
      } catch (err) {
        if (log) {
          log('botfill remove failed: ' + err.message);
        }
      }
    }
  };
}

async function reconcile(opts) {
  const status = await queryStatus({
    host: opts.host,
    port: opts.port,
    timeoutMs: opts.timeoutMs
  });
  const state = rosterFromStatus(status, opts.humanNames);
  const plan = opts.manageBots === false
    ? { humans: state.humans, bots: state.bots, target: state.bots,
        slots: state.slots, add: 0, remove: 0 }
    : fillPlan(state);
  const botNames = (status.players || [])
    .filter((p) => p.kind === 'bot' && /\[BOT\]/i.test(String(p.name || '')))
    .map((p) => p.name);
  const hooks = makeRconHooks({
    host: opts.host,
    port: opts.port,
    password: opts.password
  }, opts.log, botNames);

  /* ETLegacy's map config runs after command-line +sets and restores stock
   * movement/friendly-fire values. Reassert the ETJS rules after map init and
   * on later rotations. RCON accepts one console command per packet. */
  for (let i = 0; i < GAMEPLAY_CVARS.length; i++) {
    try {
      await sendRcon(GAMEPLAY_CVARS[i], {
        host: opts.host,
        port: opts.port,
        password: opts.password
      });
    } catch (err) {
      if (opts.log) {
        opts.log('gameplay cvar enforcement failed: ' + err.message);
      }
    }
  }
  for (let i = 0; i < plan.add; i++) {
    await hooks.addBot();
  }
  for (let i = 0; i < plan.remove; i++) {
    await hooks.removeBot();
  }
  return { status: status, state: state, plan: plan };
}

function startSupervisor(opts) {
  const intervalMs = (opts && opts.intervalMs) || 4000;
  let timer = null;
  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running) {
      return;
    }
    running = true;
    try {
      const result = await reconcile(opts);
      if (opts.onTick) {
        opts.onTick(result);
      }
    } catch (err) {
      if (opts.log) {
        opts.log('bot supervisor: ' + err.message);
      }
    } finally {
      running = false;
    }
  };

  timer = setInterval(tick, intervalMs);
  tick();

  return {
    stop: () => {
      stopped = true;
      if (timer) {
        clearInterval(timer);
      }
    }
  };
}

module.exports = {
  rosterFromStatus: rosterFromStatus,
  reconcile: reconcile,
  startSupervisor: startSupervisor,
  applyFill: applyFill,
  TEAMS: TEAMS,
  CLASSES: CLASSES,
  GAMEPLAY_CVARS: GAMEPLAY_CVARS,
  botKickCommand: botKickCommand
};
