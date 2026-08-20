#!/usr/bin/env node
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BROWSER_POLICY_RELS,
  HL2_OWNER_ROOT,
  describeFileSlim,
  ownerRootRecipe,
  toBrowserPolicy
} from './source-data-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteRoot = process.env.SOURCE_WASM_WEB_DIR
  || process.env.WASM_GAME_SITE_ROOT
  || path.join(root, 'web');
const dest = path.join(siteRoot, 'wasm-game-data.json');

if (!existsSync(path.join(HL2_OWNER_ROOT, 'hl2', 'gameinfo.txt'))
  && !existsSync(path.join(HL2_OWNER_ROOT, 'portal', 'gameinfo.txt'))) {
  throw new Error(`owner root missing gameinfo: ${HL2_OWNER_ROOT}`);
}

const version = ownerRootRecipe(HL2_OWNER_ROOT);
const variants = {};
for (const variant of ['hl2', 'portal']) {
  const files = BROWSER_POLICY_RELS
    .filter((rel) => rel.startsWith(`${variant}/`))
    .filter((rel) => existsSync(path.join(HL2_OWNER_ROOT, rel)))
    .map((rel) => describeFileSlim(HL2_OWNER_ROOT, rel));
  if (files.length) {
    variants[variant] = { namespace: `source-${variant}`, version, files };
  }
}
if (!variants.hl2 && !variants.portal) {
  throw new Error(`owner root has no browser policy files: ${HL2_OWNER_ROOT}`);
}
const browser = toBrowserPolicy({
  namespace: 'source-wasm',
  version,
  variants
});

writeFileSync(dest, `${JSON.stringify(browser, null, 2)}\n`);
console.log(`wrote ${dest} (${Buffer.byteLength(JSON.stringify(browser, null, 2))} bytes, Play/init stub)`);
console.log(JSON.stringify({
  ownerRoot: HL2_OWNER_ROOT,
  version,
  variants: Object.fromEntries(Object.entries(variants)
    .map(([key, pack]) => [key, pack.files.map((file) => file.path)]))
}, null, 2));
