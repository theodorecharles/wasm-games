'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function verify(directory) {
  const javascript = fs.readFileSync(path.join(directory, 'etjs.js'));
  const wasm = fs.readFileSync(path.join(directory, 'etjs.wasm'));
  const source = javascript.toString('utf8');
  new vm.Script(source, { filename: 'etjs.js' }); // Syntax only; never run the game.
  assert.ok(WebAssembly.validate(wasm), 'etjs.wasm is not a valid WebAssembly module');
  const exports = new Map(WebAssembly.Module.exports(new WebAssembly.Module(wasm)).map(item => [item.name, item.kind]));
  const functions = ['_main', '_Cbuf_AddText', '_Cvar_VariableIntegerValue', '_ETJS_KeyEvent',
    '_ETJS_CharEvent', '_ETJS_SetMove', '_ETJS_SetResolution', '_ETJS_AddLook', '_ETJS_OpenCommunication'];
  for (const name of functions) {
    const mapping = new RegExp('Module\\["' + name + '"\\]=wasmExports\\["([^"]+)"\\]').exec(source);
    assert.ok(mapping, `JavaScript does not expose ${name}`);
    assert.equal(exports.get(mapping[1]), 'function', `WASM does not provide the JS target for ${name}`);
  }
  const signals = ['etjs_uiopen', 'etjs_console', 'etjs_eth32save', 'cl_aimbotmenu'];
  for (const signal of signals) assert.ok(wasm.includes(Buffer.from(signal + '\0')), `WASM is missing ${signal}`);
  const digest = bytes => ({ bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
  return { javascript: digest(javascript), wasm: digest(wasm), functions, signals, engineStarted: false };
}

if (require.main === module) {
  try { console.log(JSON.stringify(verify(path.resolve(process.argv[2] || path.join(__dirname, '../web/client'))), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { verify };
