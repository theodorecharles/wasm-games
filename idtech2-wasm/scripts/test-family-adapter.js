#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../web/game-adapter.js'), 'utf8');

async function exercise(variant, expectedScript) {
  const calls = [];
  const child = {
    async init(context) { calls.push(['init', context.variant]); },
    async start(context) { calls.push(['start', context.variant]); return `started-${context.variant}`; },
    readEngineState(context) { calls.push(['state', context.variant]); return 'gameplay'; },
    readCaptureIntent(context) { calls.push(['intent', context.variant]); return true; },
    resize(detail, context) { calls.push(['resize', detail.width, context.variant]); },
    captureLost(detail, context) { calls.push(['captureLost', detail.reason, context.variant]); },
    inputCaptureChanged(captured, context) { calls.push(['capture', captured, context.variant]); },
    controllerFrame(detail, context) { calls.push(['controllerFrame', detail.actions.attack, context.variant]); },
    controllerChanged(detail, context) { calls.push(['controllerChanged', detail.activeIndex, context.variant]); },
    pointerMove(detail, event, context) { calls.push(['move', detail.x, event.type, context.variant]); },
    pointerButton(detail, event, context) { calls.push(['button', detail.button, event.type, context.variant]); },
    preferencesChanged(values, context) { calls.push(['preferences', values.profile, context.variant]); },
    contextLost(event, context) { calls.push(['contextLost', event.type, context.variant]); },
    contextRestored(event, context) { calls.push(['contextRestored', event.type, context.variant]); }
  };
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  sandbox.document = {
    createElement(type) { assert.equal(type, 'script'); return {}; },
    head: {
      appendChild(script) {
        assert.equal(script.src, expectedScript);
        sandbox.WasmGameAdapter = child;
        queueMicrotask(script.onload);
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'game-adapter.js' });
  const family = sandbox.WasmGameAdapter;
  const context = { variant };
  await family.init(context);
  assert.equal(sandbox.WasmGameAdapter, family, 'family adapter must remain the public adapter');
  assert.equal(await family.start(context), `started-${variant}`);
  assert.equal(family.readEngineState(context), 'gameplay');
  assert.equal(family.readCaptureIntent(context), true);
  family.resize({ width: 800 }, context);
  family.captureLost({ reason: 'escape' }, context);
  family.inputCaptureChanged(true, context);
  family.controllerFrame({ actions: { attack: 1 } }, context);
  family.controllerChanged({ activeIndex: 2 }, context);
  family.pointerMove({ x: 3 }, { type: 'mousemove' }, context);
  family.pointerButton({ button: 0 }, { type: 'mousedown' }, context);
  family.preferencesChanged({ profile: 'high' }, context);
  family.contextLost({ type: 'webglcontextlost' }, context);
  family.contextRestored({ type: 'webglcontextrestored' }, context);
  assert.deepEqual(calls.map(call => call[0]), [
    'init', 'start', 'state', 'intent', 'resize', 'captureLost', 'capture', 'controllerFrame',
    'controllerChanged', 'move', 'button',
    'preferences', 'contextLost', 'contextRestored'
  ]);
}

(async () => {
  await exercise('quake', '/adapters/quake.js');
  await exercise('quake2', '/adapters/quake2.js');
  console.log('Verified family adapter dispatch and native hook delegation for both variants.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
