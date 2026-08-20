# WASM portfolio session handoff

Updated: 2026-08-15

This is the authoritative resume point for the current portfolio pass. Do not
infer completion from an existing browser tab or container tag: inspect the
repository commit, image ID, and runtime contract below.

## First actions in the next session

1. Read this file before changing a repository.
2. Run `git status --short` in every repository named below. The idTech4 and
   emulation lanes may have checkpoint branches described in their own final
   messages/commits; do not overwrite them.
3. Do not control an existing browser or resize a user-owned tab. Use a new
   isolated origin only after the user explicitly hands over browser control.
4. Do not restart the Game Lab Compose stack while the user is testing a game.
   Several accepted replacement images exist locally, but running containers
   intentionally retain their old image IDs until a safe swap.
5. Keep game-specific framework pins exact. Do not mechanically repin the
   whole portfolio merely because a newer framework tag exists.

## Landed and pushed in the final pass

| Repository | Commit | Evidence |
| --- | --- | --- |
| `wasm-game-framework` | `6029364` on `v0.9.6` plus docs/`create-wasm-game` 0.9.7 | Pages at https://theodorecharles.github.io/wasm-game-framework/; `npx create-wasm-game@latest`; OpenRCT2 added to the README project table. |
| `openrct2-wasm` | `9e956b865475940e4723f49ee43422908bd75058` | Native rebuild; framework/package/image/private-data tests; changelog disabled at the native initialization path; bounded audio queue; framework 0.9.6. |
| `dosbox-wasm` | `8ce1fbbdcbba4fd731ae50f0d6f1fd49eecce63a` | Exact production Wasm booted all nine installed titles, injected native keys, observed changing 640x400 frames, live machine slices, audio callbacks, and persistent config. |
| `idtech3-wasm` | `c6b3c6d1a0` | RTCW SP/MP builds; managed MP server on Objective `mp_depot`; password/private-data/wake/WebSocket/UDP/human-count/idle tests. |
| `wasm-game-lab` | `10ab86b` | `validate.sh` and `validate.sh --images` re-ran clean after the 2026-08-15 housekeeping pass. No image swap. |
| legacy `quake3-wasm` public `devel` | `bcda532f18f8794ab9b4c7c4f3e10e71fc65f049` | Removed stale legality copy from the public README. Canonical Quake III remains in `idtech3-wasm`. |

The canonical OpenRCT2 image is
`sha256:e00af4e3735efae516493824168208c57f1c41b47d43a679beb777957d942493`.
It is tagged `openrct2-wasm:dev` and available without replacing Game Lab at
`http://127.0.0.1:33049/` in container `openrct2-096-no-changelog`.

## OpenRCT2 accepted behavior and follow-up

The user confirmed that graphics, mouse input, sound, fullscreen, and an actual
scenario work. Scenario loading is slow but completes. Audio stutter was fixed
by the bounded worker-to-main queue. The automatic desktop changelog is now
disabled for fresh installs and upgrades while `lastRunVersion` is still saved.

The prior `Restoring installation...` delay was traced to 2,951 sequential
file fetch/IndexedDB transactions. Framework 0.9.6 restores them concurrently.
The final 0.9.6 client was package-tested but has not been timed by the user;
compare the cold-cache restore at port 33049 next time.

The combined `openrct2-combined` Docker volume contains both GOG imports:
2,953 transformed files and 1,228,573,939 bytes. OpenRCT2 exposes RCT1 and RCT2
content through its native New Game/scenario UI; the framework launcher does
not need a separate RCT1/RCT2 switch.

The Game Lab service on port 8026 still runs the older image. Swap it only
after the user closes the active game:

```bash
cd /home/ted/Development/wasm/wasm-game-lab
./validate.sh --images
WASM_GAME_LAB_APPLY=1 ./start.sh
```

Confirm that `OPENRCT2_DATA_VOLUME` selects the intended combined volume before
the swap. Do not delete any OpenRCT2 volume.

## RTCW follow-up

The source/build/server implementation is pushed in `idtech3-wasm` at
`c6b3c6d1a0`. RTCW MP now has a managed native dedicated server, same-origin
WebSocket-to-UDP bridge, wake/idle lifecycle, fixed `mp_depot` Objective map,
zero-bot policy, private data boundary, and password integration. SP/MP menus
remove cross-mode buttons; MP uses `JOIN GAME` instead of a public server
browser. Adapter code keeps the canvas visible during a managed join rather
than returning to the launcher.

Still required in a fresh user-approved browser session:

- SP Start Game must leave the briefing and render the world at full size;
- SP and MP native cursors must align across resize/fullscreen;
- MP `JOIN GAME` must wake and enter `mp_depot` without showing the launcher;
- renderer output must be checked for the previously reported dark/foggy,
  missing-texture appearance.

The existing Game Lab containers on 8085/18085 are older images. Do not use
them as evidence for commit `c6b3c6d1a0`; build/tag and perform a safe swap.

## idTech4 renderer checkpoint

The preserved checkpoint is branch `checkpoint/idtech4-glsl-es` at
commit `1c5d4a1d576f8daaefbbbd5f84a7c2bc56b92a7a`, pushed to
`origin` (`theodorecharles/idtech4-wasm`). Its worktree was clean and exactly
matched the remote when handed off.

The old port linked Emscripten ARB entry-point names but did not have a usable
ARB assembly implementation: Emscripten 6 `libglemu.js` asserts that
`glBindProgramARB` receives program zero. The active lane implemented real
`#version 300 es` interaction shaders for dhewm3 (Doom 3 and RoE), Prey 2006,
and openQ4 SP/MP. All four Wasm engines compiled and their imports showed real
shader create/compile/link/use/uniform APIs.

The checkpoint passed exact patch reconstruction, fresh Wasm builds for every
engine, surfaceless Mesa GLES 3.2 compilation/linking of the embedded shaders,
Wasm import audits, staging/memory/adapter/worker/package tests, all seven image
HTTP smokes, and the password gate. Before declaring the renderer complete,
finish:

- residual ARB shadow/special-material paths;
- exact-source headless GLES 3 shader compile/link test;
- generated/GPU-posed Quake 4 geometry paths;
- regenerated patch hashes, family images, static/HTTP tests;
- a new isolated browser pass through menus and actual gameplay.

Keep this renderer change separate from a framework repin. The repository was
still intentionally pinned to framework 0.9.2 when the work began.

## Emulation checkpoint and firmware

NES and SNES are already real native Jolly Good browser runtimes. The PS1
checkpoint is branch `checkpoint/ps1-mednafen-runtime` at commit
`cdf4f31e486c8c7229a754b1de511379897b3818`, pushed to
`theodorecharles/emulation-wasm`; `master` was not touched and the checkpoint
worktree was clean. It adds a real Mednafen-JG target with CUE/BIN media, one 512 KiB
firmware capture, region aliases, IDBFS, native PlayStation buttons and four
axes, and a pthread worker. Fast gates pass 23/23, and prior evidence includes
a linked/validated threaded PS1 Wasm and static image smoke. The clean rebuild
after the final PSX-only filter was intentionally interrupted during button-up,
so rerun it before merging. Do not replace it with a diagnostic placeholder. PS2 remains
fail closed until its real runtime and large-media constraints are solved.

Ignored local test media under `emulation-wasm/.local/test-media` includes:

- PS1 firmware `firmware/ps1/scph5501.bin`, 524,288 bytes,
  SHA-256 `cbe758e1c8ece593c8e14ce1e8b3436428a01c608032a02613b3a4b442b4d712`;
- SNES Super Mario World and F-Zero test carts;
- PS1 SimCity 2000 CUE/BIN test media.

No NES ROM or PS2 image was found on the server. The PS1 firmware must be
captured through the same private media/provisioning UI as game media; it must
not enter Git or an image. Keep the console-first launcher: choose a console,
then choose a game. Direct `?game=<variant>&media=<id>` and deployment locks are
supported for family-style direct links.

Resume the PS1 checkpoint with:

```bash
cd /home/ted/Development/wasm/emulation-wasm
git switch checkpoint/ps1-mednafen-runtime
VARIANT=ps1 EMSDK_DIR=/home/ted/emsdk EMULATION_BUILD_JOBS=8 npm run build:core
VARIANT=ps1 EMSDK_DIR=/home/ted/emsdk ./scripts/build-web.sh
DOCKER_TAG=checkpoint ./scripts/build-images.sh ps1
```

Then point its private provisioning flow at the ignored firmware and atomic
SimCity 2000 CUE/BIN fixture listed above and run the PS1 acceptance matrix in
`RUNBOOK.md` (boot, audio, save restore, controller, resize, and hard reload).

## Build-family and other manual checks still owed

The following code paths are committed and statically tested, but the user's
reported behavior should be rechecked on current images before calling the
titles polished:

- Blood: captured relative mouse must turn the view; menu cursor policy is
  `none` and released menu mouse motion must not move menu selection.
- Duke Nukem 3D: selecting a skill must enter gameplay without freezing.
- Wolf3D/Spear: no released menu pointer alignment, no spontaneous selection,
  and A/D must not both turn and strafe.
- Quake II and GoldSource: `menuCursor: browser` must make the released browser
  cursor visible; WolfET/RTCW/Quake III use native cursors.
- Quake Modernized: dynamic software backbuffer must retain aspect ratio.
- Heretic and Hexen Modernized profiles exist through DSDA and need ordinary
  user acceptance after the earlier controlled-browser viewport conflict.

Controller mode is intentionally `disabled` in every non-emulator canonical
manifest. `emulation-wasm` alone uses custom controller mappings.

## Documentation site and developer toolchain

Landed. Do not reopen unless the user asks.

- Docs: https://theodorecharles.github.io/wasm-game-framework/
- `/llms.txt` and `/llms-full.txt` are published
- `npx create-wasm-game@latest` / `npm create wasm-game@latest` publish
  `create-wasm-game@0.9.7` (homepage is the docs site)
- Framework README project table includes OpenRCT2 / RollerCoaster Tycoon 1+2
  as **Still in development**

## Housekeeping (2026-08-15)

Re-audited every local `.git` under `wolfetjs` and `wasm/*`. Canonical family
repos from the snapshot below were clean. Active checkpoints are still
`idtech4-wasm` `checkpoint/idtech4-glsl-es` @ `1c5d4a1` and `emulation-wasm`
`checkpoint/ps1-mednafen-runtime` @ `cdf4f31`; do not overwrite them.

`./validate.sh` and `./validate.sh --images` passed in `wasm-game-lab`. Image
contracts were not changed. No Compose swap. No containers stopped. No
volumes deleted. Isolated OpenRCT2/RTCW/Build test ports remain up.

Archive/source-only trees (`crispy-doom-wasm`, `quake1-wasm`, `quake2-wasm`,
and `*.archive-*`) are still not canonical examples.

## Repository synchronization snapshot

These repositories were clean and synchronized before the two active
checkpoint lanes were stopped:

```text
wolfet-wasm        aa8bd80b9a
build-wasm         72e1669989
cod2-wasm          c109bf013d
dosbox-wasm        8ce1fbbdcb
goldsource-wasm    bd96fbad56
idtech1-wasm       6af899b49d
idtech2-wasm       4cd231d6d4
idtech3-wasm       c6b3c6d1a0
openrct2-wasm      9e956b8654
source-wasm        58cf818f0d
wasm-game-framework 6029364
wasm-game-lab      10ab86b
wolf3d-wasm        2ab4d53c2e
```

Re-audit rather than trusting this snapshot:

```bash
for marker in /home/ted/Development/wolfetjs/.git /home/ted/Development/wasm/*/.git; do
  test -e "$marker" || continue
  repo="${marker%/.git}"
  git -C "$repo" status --short
  git -C "$repo" branch -vv
done
```

Then run the Game Lab validators, update image contracts only after final image
builds, and push each repository intentionally. Archive/source-only working
trees such as `crispy-doom-wasm`, `quake1-wasm`, and `quake2-wasm` are not
canonical family deliverables and should not be presented as current examples.

## Running-container caution

Many isolated acceptance containers were deliberately left alive because the
user had tabs open. The most important are OpenRCT2 ports 33040 and 33042-33049,
RTWC test ports 18540/18541, and Build test ports 18520/18521. Do not bulk-stop
containers. Inventory them first:

```bash
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}' | sort
```

After the user confirms all related tabs are closed, remove only explicitly
named disposable test containers. Never delete Docker volumes during cleanup.
