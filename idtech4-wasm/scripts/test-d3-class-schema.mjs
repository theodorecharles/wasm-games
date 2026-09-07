#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = process.env.IDTECH4_WORK_ROOT || path.join(root, '.work');
const bots = process.env.D3_CLASS_BOTS === '1';
const clientTree = bots ? 'd3wasm-sabot' : 'd3wasm';
const serverTree = bots ? 'd3-managed-sabot-source' : 'd3wasm-roe-game';
const clientRoot = path.join(work, clientTree, 'neo');
const serverRoot = path.join(work, serverTree, 'neo');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

// Read registrations only from translation units selected by the real builds,
// not every source file in a checkout (which also contains expansion classes).
function inventory(build, sourceRoot, target) {
  const ninja = fs.readFileSync(path.join(work, build, 'build.ninja'), 'utf8');
  const classes = new Map();
  const units = [];
  for (const line of ninja.split('\n')) {
    if (!line.startsWith(`build CMakeFiles/${target}.dir/`)) continue;
    const match = line.match(/ (\S+\/neo\/(game\/[^ ]+\.cpp)) /);
    if (!match) continue;
    const relative = match[2];
    units.push(relative);
    const source = fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    for (const registration of source.matchAll(/\b(?:CLASS_DECLARATION|ABSTRACT_DECLARATION)\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/g)) {
      const [, parent, name] = registration;
      assert.ok(!classes.has(name), `duplicate registration: ${name}`);
      classes.set(name, { name, parent, source: relative });
    }
  }
  assert.ok(units.length > 50, 'missing configured game translation units');
  return { units, classes };
}

// Model the identical production constructor/Init traversal: alphabetical
// registration, recursively initialize parents, prepend children, depth first.
// This is a source-schema check, not execution of the full native game library.
function numbered(classes) {
  const children = new Map([['NULL', []]]);
  function init(name) {
    if (children.has(name)) return;
    const type = classes.get(name);
    assert.ok(type, `missing superclass ${name}`);
    init(type.parent);
    children.set(name, []);
    children.get(type.parent).unshift(name);
  }
  for (const name of [...classes.keys()].sort()) init(name);
  const result = [];
  function visit(name) {
    result.push({ type: result.length, name, parent: classes.get(name).parent });
    for (const child of children.get(name)) visit(child);
  }
  for (const name of children.get('NULL')) visit(name);
  return result;
}

const algorithmHashes = {};
for (const relative of ['game/gamesys/Class.cpp', 'idlib/containers/Hierarchy.h', 'game/Game_network.cpp']) {
  const client = fs.readFileSync(path.join(clientRoot, relative));
  const server = fs.readFileSync(path.join(serverRoot, relative));
  assert.deepEqual(client, server, `client/server algorithm differs: ${relative}`);
  algorithmHashes[relative] = hash(client);
}
const client = inventory(`${clientTree}/build-wasm`, clientRoot, 'd3wasm');
const server = inventory(bots ? 'd3-managed-sabot' : 'd3-managed-native', serverRoot, 'base');
const clientSchema = numbered(client.classes);
const serverSchema = numbered(server.classes);
assert.deepEqual(clientSchema, serverSchema, 'network class IDs differ');
assert.equal(clientSchema.length, bots ? 144 : 142);
if (bots) {
  for (const name of ['botAi', 'botSabot']) assert.ok(client.classes.has(name), `missing ${name}`);
  for (const file of fs.readdirSync(path.join(clientRoot, 'game/bots'))) {
    assert.deepEqual(fs.readFileSync(path.join(clientRoot, 'game/bots', file)),
      fs.readFileSync(path.join(serverRoot, 'game/bots', file)), `bot implementation differs: ${file}`);
  }
}
assert.ok(client.classes.has('idTestModel'));
for (const relative of ['game/anim/Anim_Testmodel.cpp', 'game/anim/Anim_Testmodel.h']) {
  assert.deepEqual(fs.readFileSync(path.join(clientRoot, relative)), fs.readFileSync(path.join(serverRoot, relative)),
    'restore the complete original class, not a placeholder ID');
}

const legacyClasses = new Map(client.classes);
legacyClasses.delete('idTestModel');
const legacy = numbered(legacyClasses);
const playerType = serverSchema.find(row => row.name === 'idPlayer').type;
assert.equal(legacy[playerType].name, 'idAI', 'negative control must reproduce the observed player-as-AI crash');
assert.notDeepEqual(legacy, serverSchema);
const proof = {
  scope: 'Source-derived wire class schema from actual Ninja-selected base game translation units; identical client/server class, hierarchy and snapshot implementations. Not a full runtime or browser test.',
  classes: clientSchema.length, algorithmHashes,
  clientTranslationUnits: client.units.length, serverTranslationUnits: server.units.length,
  negativeControl: { removed: 'idTestModel', serverPlayerType: playerType, oldClientDecodesAs: legacy[playerType].name },
  schema: clientSchema,
};
if (process.env.D3_CLASS_PROOF) fs.writeFileSync(process.env.D3_CLASS_PROOF, JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify({ classes: proof.classes, negativeControl: proof.negativeControl, passed: true }));
