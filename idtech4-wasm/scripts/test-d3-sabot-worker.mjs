#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const worker = fs.readFileSync(process.env.D3_SABOT_WORKER_SOURCE || new URL('../.work/d3-sabot-browser-candidate/d3-worker.js', import.meta.url), 'utf8');
const lock = JSON.parse(fs.readFileSync(new URL('../bots/doom3/source-lock.json', import.meta.url)));
assert.equal(crypto.createHash('sha256').update(worker).digest('hex'), lock.candidate.runtimeOutputs['site/d3-worker.js']);
const reference = process.env.D3_SABOT_REFERENCE || fileURLToPath(new URL('../.work/idtech4a-bot-reference/', import.meta.url));
const archive = fs.readFileSync(path.join(reference, lock.assets.path));
assert.equal(crypto.createHash('sha256').update(archive).digest('hex'), lock.assets.sha256);
const checks = [];
async function run({variant = 'doom3-mp', failure, ready = true} = {}) {
  const imports = [], requests = [], messages = [], mounts = [];
  let args;
  const owner = new Blob(['owner fixture']);
  const fakeFs = {mkdir() {}, mount(type, options, directory) { mounts.push({type, options, directory}); }};
  const sandbox = {URL, Blob, Uint8Array, crypto: crypto.webcrypto,
    location: {href: 'https://d3.test/'},
    postMessage: message => messages.push(message),
    setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
    async fetch(url) {
      requests.push(url);
      assert.equal(url, '/bots/d3_sabot_a7.pk4');
      if (failure === 'network') throw new Error('fixture network failure');
      let bytes = archive;
      if (failure === 'size') bytes = archive.subarray(0, archive.length - 1);
      if (failure === 'checksum') { bytes = Buffer.from(archive); bytes[100] ^= 1; }
      return {ok: failure !== '404', status: failure === '404' ? 404 : 200, blob: async () => new Blob([bytes])};
    }
  };
  sandbox.self = sandbox;
  sandbox.importScripts = url => {
    imports.push(url);
    if (url === '/d3-managed-network.js') {
      sandbox.createD3ManagedNetwork = () => ({closeAll() {}});
    } else if (url === '/shared-shell/wasm-game-framework.js') {
      sandbox.WasmGameFramework = {version: '0.9.6', createPersistenceManager: options => ({...options,
        async attach(FS) { assert.equal(FS, fakeFs); }, markDirty() {}, async save() {}})};
    } else {
      assert.equal(url, variant === 'roe' ? '/dhewm3-roe.js' : '/dhewm3-base.js');
      sandbox.FS = fakeFs;
      sandbox.WORKERFS = {};
      sandbox.Module.FS = fakeFs;
      sandbox.Module.callMain = value => { args = Array.from(value); };
      for (const callback of sandbox.Module.preRun) callback();
      sandbox.Module.onRuntimeInitialized();
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(worker, sandbox);
  sandbox.onmessage({data: {type: 'start', variant, managedMultiplayer: ready,
    entries: [{path: 'base/pak000.pk4', file: owner}], canvas: {width: 1280, height: 720},
    width: 1280, height: 720, playerName: 'Fixture',
    persistence: {root: '/save/' + variant, namespace: 'idtech4-' + variant,
      frameworkScript: '/shared-shell/wasm-game-framework.js', frameworkVersion: '0.9.6'}}});
  const deadline = Date.now() + 5000;
  while (!args && !messages.some(message => message.type === 'error') && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 2));
  }
  const errors = messages.filter(message => message.type === 'error');
  if (failure || !ready) {
    assert.equal(args, undefined, 'invalid assets/readiness must prevent native main');
    assert.equal(errors.length, 1);
    assert.equal(mounts.length, 0);
    assert.equal(imports.some(url => /dhewm3-/.test(url)), false);
    if (!ready) { assert.match(errors[0].text, /ready managed match/); assert.equal(requests.length, 0); }
    if (failure === 'size') assert.match(errors[0].text, /asset size/);
    if (failure === 'checksum') assert.match(errors[0].text, /checksum mismatch/);
    if (failure === '404') assert.match(errors[0].text, /unavailable \(404\)/);
    if (failure === 'network') assert.match(errors[0].text, /network failure/);
  } else {
    assert.ok(args, 'worker reaches native main');
    assert.deepEqual(errors, []);
    assert.equal(mounts.length, 1);
    assert.equal(mounts[0].directory, '/owner-data');
    const blobs = Array.from(mounts[0].options.blobs);
    assert.equal(blobs[0].data, owner, 'owner data stays Blob-backed');
    assert.deepEqual(blobs.map(blob => blob.name), variant === 'doom3-mp'
      ? ['base/pak000.pk4', 'base/zz_sabot.pk4'] : ['base/pak000.pk4']);
    assert.ok(args.includes('/save/' + variant));
    if (variant === 'doom3-mp') {
      assert.deepEqual(requests, ['/bots/d3_sabot_a7.pk4']);
      assert.equal(crypto.createHash('sha256').update(Buffer.from(await blobs[1].data.arrayBuffer())).digest('hex'), lock.assets.sha256);
      assert.deepEqual(args.slice(-2), ['+connect', '127.0.0.1:27666']);
    } else {
      assert.deepEqual(requests, [], 'SP/RoE never fetch multiplayer bot assets');
      assert.equal(imports.includes('/d3-managed-network.js'), false);
      assert.equal(args.includes('+connect'), false);
    }
  }
}
for (const variant of ['doom3-mp', 'doom3', 'roe']) {
  await run({variant}); checks.push(variant + ': exact mount/connect/persistence profile');
}
for (const failure of ['404', 'network', 'size', 'checksum']) {
  await run({failure}); checks.push(failure + ': asset failure prevents engine startup');
}
await run({ready: false}); checks.push('managed readiness is required before bot fetch');
const proof = {scope: 'Exact candidate worker executed in a VM with the real pinned bot archive and real SHA-256. Tests MP-only mounting, SP/RoE isolation and fail-closed asset validation; not a renderer or full campaign test.',
  workerSHA256: lock.candidate.runtimeOutputs['site/d3-worker.js'], checks, passed: true};
if (process.env.D3_SABOT_WORKER_PROOF) fs.writeFileSync(process.env.D3_SABOT_WORKER_PROOF, JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify(proof, null, 2));
