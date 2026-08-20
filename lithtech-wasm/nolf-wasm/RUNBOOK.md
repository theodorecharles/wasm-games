# Nolf Wasm — AI implementation runbook

This file is the working contract for an agent implementing **No One Lives
Forever** on WASM Game Framework **@wasm-game-framework/browser@0.9.6**.

Read the canonical docs before editing. Do not invent a second website.

## Canonical docs

Read these first, in order:

1. https://theodorecharles.github.io/wasm-game-framework/llms.txt
2. https://theodorecharles.github.io/wasm-game-framework/build-a-game.html
3. `vendor/wasm-game-framework/ADAPTER_RUNBOOK.md`
4. https://theodorecharles.github.io/wasm-game-framework/adapter.html and the
   display, input, persistence, and game-data guides.

## This project's declared policy

| Field | Value |
| --- | --- |
| id | `nolf-wasm` |
| title | No One Lives Forever |
| displayMode | `4:3` |
| menuCursor | `browser` |
| nativeManaged | `false` |
| syncBackbuffer | `true` |
| pointerLock | `true` |
| fullscreen | `true` |
| controller.mode | `disabled` |
| persistence | `/save/{variant}` |
| media library | `false` |
| dedicated server stub | `false` |
| framework pin | `@wasm-game-framework/browser@0.9.6` |
| source | official 1.003 game code in `vendor/nolf-source`; owner-authorized Jupiter EX at `vendor/lithtech` |

## Current checkpoint (2026-08-15)

- Official 1.003 game source is vendored. See `SOURCE_BASE_AUDIT.md`.
- Owner authorized `https://github.com/jsj2008/lithtech` (Jupiter EX Build 69)
  as a library/reference drop. Vendored independently at `vendor/lithtech`.
  Do not touch the sibling `nolf2-wasm` tree.
- Owner GOTY discs were extracted from
  `root@4.20.69.100:/mnt/user/Documents/Software/Windows XP Stuff/Games/No One Lives Forever`.
- Required REZ files live at `/home/ted/Development/wasm/data/nolf/game` and
  are declared in `web/wasm-game-data.json`.
- `web/data-validator.mjs` accepts RezMgr Version 1 archives.
- Host opens those archives, parses `ATTRIBUTES/MISSIONS` + `ATTRIBUTES/WEAPONS`,
  and blits official `MENU/ART/SPLASH`. Adapter `readEngineState()` is native.
- Jupiter cannot load NOLF 1 DAT v66 worlds (`CURRENT_WORLD_VERSION` is 85).
  Gameplay after the splash is still a stand-in.

## Native-source rule

Start from the official 1.003 tree in this repository. Owner authorized the
GPL Jupiter EX tree **only as libraries and a format reference** for NOLF 1.
Do not compile Jupiter's clientmgr as if it were `lithtech.exe` for this game.
Do not copy another project's generated JS/WASM. NOLF 2 is a separate tree.

## What you implement next

1. Keep compiling official portable units (StdLith, official CRezMgr) behind shims.
2. A LithTech 2.1 host that can `CreateClientShell` and load DAT v66 is still
   required before claiming a real in-world renderer.
3. Mount validated REZ files read-only under `/game` before any native lookup.
4. Attach persistence at `/save/{variant}` before native config/save reads.
5. `readEngineState()` must come from native truth.

## Forbidden

- Downstream `index.html`, `*.css`, service worker, or `*.webmanifest`
- Inferring `gameplay` from a timeout, canvas visibility, or the last click
- Calling `requestPointerLock()` / `exitPointerLock()` from the adapter
- Tracking REZ/ISO/BIN/CUE files or generated WASM in Git
- Marking unreached behavior as passed because a hook looks plausible

## Commands

```bash
npm test
./scripts/build-web.sh
WASM_GAME_DATA_ROOT=/home/ted/Development/wasm/data/nolf/game npm start
# http://127.0.0.1:8088/
WASM_GAME_FRAMEWORK_ROOT=/home/ted/Development/wasm/wasm-game-framework npm run build:image
```

## Acceptance

Follow section 11 of the adapter runbook for every *reached* item. Document the
exact native blocker for the rest. Compiling or validating REZ files is not a
finished adapter.
