# Nolf2 Wasm — AI implementation runbook

This file is the working contract for an agent implementing **No One Lives
Forever 2** on WASM Game Framework **@wasm-game-framework/browser@0.9.6**.

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
| id | `nolf2-wasm` |
| title | No One Lives Forever 2 |
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
| source | official toolkit in `vendor/nolf2-source` |

## Current checkpoint (2026-08-15)

- Official toolkit source is vendored from
  `https://github.com/wilkie/no-one-lives-forever-2`. See `SOURCE_BASE_AUDIT.md`.
- Owner ISO/MDF discs were extracted from
  `root@4.20.69.100:/mnt/user/Documents/Software/Windows XP Stuff/Games/No One Lives Forever 2`.
- Required REZ files live at `/home/ted/Development/wasm/data/nolf2/game`.
- `web/data-validator.mjs` accepts RezMgr Version 1 archives.
- `native/` compiles official `Game/Shared/CRC32.cpp` and
  `libs/stdlith/helpers.cpp` plus a REZ header probe.
- The adapter must not report `menu` or `gameplay`. There is no Jupiter host.

## Native-source rule

Start from the official toolkit in this repository. Do not copy another
project's generated JS/WASM. Do not import leaked Jupiter EX trees unless the
owner explicitly authorizes that provenance.

NOLF 1 lives in the sibling `/home/ted/Development/wasm/nolf-wasm` tree. Do
not mix the two source bases.

## What you implement next

1. Keep compiling official portable units (`stdlith`, `ButeMgr`, CRC32).
2. Do not claim a menu until a real Jupiter host initializes the renderer and
   the TO2 client shell.
3. Mount validated REZ files read-only under `/game` before any native lookup.
4. Attach persistence at `/save/{variant}` before native config/save reads.
5. `readEngineState()` must come from native truth.

## Forbidden

- Downstream `index.html`, `*.css`, service worker, or `*.webmanifest`
- Inferring `gameplay` from a timeout, canvas visibility, or the last click
- Calling `requestPointerLock()` / `exitPointerLock()` from the adapter
- Tracking REZ/ISO/MDF files or generated WASM in Git
- Marking unreached behavior as passed because a hook looks plausible

## Commands

```bash
npm test
./scripts/build-web.sh
WASM_GAME_DATA_ROOT=/home/ted/Development/wasm/data/nolf2/game npm start
# http://127.0.0.1:8088/
WASM_GAME_FRAMEWORK_ROOT=/home/ted/Development/wasm/wasm-game-framework npm run build:image
```

## Acceptance

Follow section 11 of the adapter runbook for every *reached* item. Document the
exact native blocker for the rest. Compiling or validating REZ files is not a
finished adapter.
