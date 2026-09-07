#!/usr/bin/env node
// Execute the actual side-module entrypoints with a shared Emscripten-style GOT.
// This is a narrow ABI regression, not a substitute for a real engine/Chrome run.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const menuFile = process.env.CS_MENU_WASM || path.join(root, 'native/cs-menu-framework.wasm');
const clientFiles = fs.readdirSync(path.join(root, 'web/artifacts'))
  .filter(name => /^client_emscripten_wasm32-.*\.wasm$/.test(name))
  .filter(name => WebAssembly.Module.exports(new WebAssembly.Module(fs.readFileSync(path.join(root, 'web/artifacts', name))))
    .some(item => item.name === '_Z21HUD_InitClientWeaponsv'));
assert.equal(clientFiles.length, 1, 'one unmodified CS client');
const clientFile = path.join(root, 'web/artifacts', clientFiles[0]);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function exercise(file, expectPrivate) {
  const memory = new WebAssembly.Memory({ initial: 256 });
  const table = new WebAssembly.Table({ element: 'anyfunc', initial: 16384 });
  const stack = new WebAssembly.Global({ value: 'i32', mutable: true }, 12 * 1024 * 1024);
  const globals = { 'GOT.mem': {}, 'GOT.func': {} };
  const resolved = new Set();
  const bytes = new Uint8Array(memory.buffer), words = new Uint32Array(memory.buffer);
  let nextFunction = 4096;
  const builtin = {
    memcpy: (dest, src, size) => { bytes.copyWithin(dest, src, src + size); return dest; },
    memmove: (dest, src, size) => { bytes.copyWithin(dest, src, src + size); return dest; },
    memset: (dest, value, size) => { bytes.fill(value, dest, dest + size); return dest; },
  };
  function link(filename, memoryBase, tableBase) {
    const data = fs.readFileSync(filename), module = new WebAssembly.Module(data);
    const imports = { env: { memory, __indirect_function_table: table,
      __stack_pointer: stack, __memory_base: memoryBase, __table_base: tableBase }, ...globals };
    let instance;
    for (const item of WebAssembly.Module.imports(module)) {
      if (item.module.startsWith('GOT.')) {
        imports[item.module][item.name] ??= new WebAssembly.Global({ value: 'i32', mutable: true }, 0);
      } else if (item.kind === 'function') {
        assert.equal(item.module, 'env');
        imports.env[item.name] = (...args) => {
          const fn = instance?.exports[item.name] || builtin[item.name];
          assert(fn, `unexpected native dependency called: ${item.name}`);
          return fn(...args);
        };
      } else assert(item.name in imports.env, `unexpected import: ${item.name}`);
    }
    instance = new WebAssembly.Instance(module, imports);
    for (const item of WebAssembly.Module.exports(module)) {
      const kind = item.kind === 'global' ? 'GOT.mem' : 'GOT.func';
      const key = kind + '.' + item.name;
      if (resolved.has(key)) continue; // first global definition wins, like dlopen
      const slot = globals[kind][item.name] ??= new WebAssembly.Global({ value: 'i32', mutable: true }, 0);
      if (item.kind === 'global') slot.value = memoryBase + instance.exports[item.name].value;
      else if (item.kind === 'function') {
        table.set(nextFunction, instance.exports[item.name]); slot.value = nextFunction++;
      } else throw Error(`unexpected export kind: ${item.kind}`);
      resolved.add(key);
    }
    instance.exports.__wasm_apply_data_relocs?.();
    return { instance, module, sha256: sha256(data) };
  }
  const menuBase = 1024 * 1024;
  const menu = link(file, menuBase, 1);
  const exported = WebAssembly.Module.exports(menu.module).some(x => x.name === 'gpGlobals');
  const imported = WebAssembly.Module.imports(menu.module).some(x => x.name === 'gpGlobals');
  assert.equal(exported, !expectPrivate, 'menu gpGlobals export visibility');
  assert.equal(imported, !expectPrivate, 'menu gpGlobals GOT import visibility');
  const ui = 14 * 1024 * 1024, functions = ui + 4096, engine = ui + 8192;
  words.set([0, 0, 1424, 1057, 32, 1], ui / 4);
  assert.equal(menu.instance.exports.GetMenuAPI(functions, engine, ui), 1);
  const cells = [];
  for (let offset = menuBase; offset < menuBase + 1024 * 1024; offset += 4)
    if (words[offset / 4] === ui) cells.push(offset);
  assert.equal(cells.length, 1, 'actual GetMenuAPI writes exactly one menu-global pointer');
  const menuCell = cells[0];
  const before = [...words.slice(words[menuCell / 4] / 4 + 2, words[menuCell / 4] / 4 + 6)];
  assert.deepEqual(before, [1424, 1057, 32, 1]);

  const client = link(clientFile, 4 * 1024 * 1024, 256);
  assert(WebAssembly.Module.exports(client.module).some(x => x.name === 'gpGlobals'));
  const clientCell = globals['GOT.mem'].gpGlobals.value;
  assert.equal(clientCell === menuCell, !expectPrivate, 'shared versus private pointer cells');
  assert.equal(words[clientCell / 4], expectPrivate ? 0 : ui);
  // The real weapon initializer writes gpGlobals, then calls GetClientTime through
  // the intentionally empty engine callback table. Stop at that null callback;
  // no constructors, weapon gameplay or full-engine initialization are simulated.
  assert.throws(() => client.instance.exports._Z21HUD_InitClientWeaponsv(),
    error => error instanceof WebAssembly.RuntimeError && /null function|signature mismatch/.test(error.message));
  assert(words[clientCell / 4] >= 4 * 1024 * 1024 && words[clientCell / 4] < 6 * 1024 * 1024,
    'actual client initializer points to its own dummy globalvars_t');
  const after = [...words.slice(words[menuCell / 4] / 4 + 2, words[menuCell / 4] / 4 + 6)];
  assert.deepEqual(after, expectPrivate ? before : [0, 0, 0, 0],
    'screen dimensions, maxClients and developer after real weapon-global assignment');
  return { file, sha256: menu.sha256, clientSHA256: client.sha256,
    privateMenuGlobals: expectPrivate, menuCell, clientCell, before, after,
    stoppedAtFirstUnprovidedEngineCallback: true, fullEngineAcceptance: false, passed: true };
}

const cases = [];
if (process.env.CS_MENU_BASELINE) cases.push(exercise(process.env.CS_MENU_BASELINE, false));
cases.push(exercise(menuFile, true));
const report = { testedAt: new Date().toISOString(), cases, passed: true };
if (process.env.CS_MENU_GLOBALS_PROOF) fs.writeFileSync(process.env.CS_MENU_GLOBALS_PROOF, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
