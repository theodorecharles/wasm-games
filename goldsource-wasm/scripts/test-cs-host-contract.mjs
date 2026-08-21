#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [start, entrypoint, build, dockerfile, sources] = await Promise.all([
  readFile(new URL('../runtime/counter-strike/start.sh', import.meta.url), 'utf8'),
  readFile(new URL('../runtime/counter-strike/start-yapb.sh', import.meta.url), 'utf8'),
  readFile(new URL('../runtime/counter-strike/build-host-image.sh', import.meta.url), 'utf8'),
  readFile(new URL('../runtime/counter-strike/Dockerfile', import.meta.url), 'utf8'),
  readFile(new URL('../sources.json', import.meta.url), 'utf8').then(JSON.parse)
]);

const yapb = sources.sources.find(source => source.name === 'yapb');
assert.equal(yapb.commit, '9b9d4b655898744dcef1f3dfb87bcd4b4554b41e');
assert.equal(yapb.release, '4.4.957');
assert.equal(yapb.sha256, '8c095ac89b9b2ccc70a66a71d608e1a570b5268c57c6083ced8c06161533a4b1');
assert.match(build, new RegExp(yapb.sha256));
assert.match(build, /sha256sum --check --status/);
assert.match(dockerfile, /gamedll_linux "addons\/yapb\/bin\/yapb\.so"/);
assert.match(dockerfile, /de_dust2\.graph/);
assert.match(start, /CS_BOTS:-9/);
assert.match(start, /-e "CS_BOTS=\$\{bot_quota\}"/);
assert.match(start, /-e "CS_BOT_DIFFICULTY=\$\{bot_difficulty\}"/);
assert.match(entrypoint, /yb_quota/);
assert.match(entrypoint, /yb_difficulty/);
assert.match(entrypoint, /sed -i/);
assert.match(entrypoint, /main_cfg/);
assert.match(dockerfile, /ENTRYPOINT \["\/usr\/local\/bin\/start-yapb"\]/);
console.log('Verified pinned Counter-Strike YaPB host and bot launch contract.');
