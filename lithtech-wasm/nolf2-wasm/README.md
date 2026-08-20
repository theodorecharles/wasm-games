# Nolf2 Wasm

Downstream browser port of **No One Lives Forever 2: A Spy in H.A.R.M.'s Way**,
scaffolded on `@wasm-game-framework/browser@0.9.6`.

This directory is a game site, not a web application. The framework owns
`index.html`, launcher CSS, the service worker, and the web manifest.

## Current checkpoint

Jupiter EX (`vendor/lithtech`, owner-authorized) plus official toolkit
(`vendor/nolf2-source`). Retail REZs stay outside Git at
`/home/ted/Development/wasm/data/nolf2/game`.

Native `nolf2_boot` opens those REZs with official `CRezMgr` and presents
`INTERFACE\MENU\ART\SPLASH.PCX` (the same path CShell uses for the splash).
That is the real title art, not the old fake host. CShell / ClientMgr are
not driving the screen yet.

```bash
cmake -S port -B build-port -DCMAKE_BUILD_TYPE=Release
cmake --build build-port --target nolf2_boot
./scripts/run-nolf2-boot.sh
```

## Commands

```bash
npm test
./scripts/build-web.sh
WASM_GAME_DATA_ROOT=/home/ted/Development/wasm/data/nolf2/game npm start
# http://127.0.0.1:8088/
```
