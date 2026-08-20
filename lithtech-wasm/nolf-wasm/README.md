# Nolf Wasm

Downstream browser port of **The Operative: No One Lives Forever**, scaffolded
on `@wasm-game-framework/browser@0.9.6`.

This directory is a game site, not a web application. The framework owns
`index.html`, launcher CSS, the service worker, and the web manifest.

## Current checkpoint

Official NOLF Source Code v1.003 is vendored at `vendor/nolf-source`. Owner
authorized the GPL Jupiter EX tree at `vendor/lithtech` as a RezMgr / library
reference (it is **not** LithTech 2.1; NOLF 1 worlds are DAT v66). Owner GOTY
REZ archives live outside Git under `/home/ted/Development/wasm/data/nolf/game`.

Startup opens those archives with a RezMgr Version 1 reader and blits the
official GOTY `MENU/ART/SPLASH` title card. There is still no LithTech 2.1
`CreateClientShell` renderer after the splash.

## Commands

```bash
npm test
./scripts/build-web.sh
WASM_GAME_DATA_ROOT=/home/ted/Development/wasm/data/nolf/game npm start
# http://127.0.0.1:8088/
```

## Files you own

- `web/wasm-game.json` — browser policy
- `web/game-adapter.js` — native seam
- `web/wasm-game-data.json` — GOTY REZ allowlist
- `web/data-validator.mjs` — RezMgr format checks
- `native/` — compile probe
- `RUNBOOK.md` / `SOURCE_BASE_AUDIT.md`
