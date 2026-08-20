# id Tech 1 WASM downstream runbook

## Scope and provenance

This repository is the canonical browser suite for the id Tech 1/Doom-engine
family. Its classic engine is built directly from the native SDL2 Crispy Doom
source tree. The source baseline is upstream commit
`7775ef82` (`crispy-doom-7.1-62-g7775ef82`) from
`fabiangreffrath/crispy-doom`; see `COPYING.md` and the copyright notices in
each source file.

The Modernized profile additionally builds native DSDA-Doom 0.29.4 at pinned
commit `ae7c280cd08047c399283bebcfaeeb3e9ecb8e6d`. The checkout is ignored;
`scripts/fetch-dsda-source.sh` verifies the revision and applies only the
tracked `patches/dsda-wasm.patch`. It does not use an existing DSDA WASM port.

The browser integration in this repository is intentionally independent:

All seven public titles are `Still in development`. `Live` and
`Still in development` are the only permitted public status labels.

- `wasm/CMakeLists.txt` owns the web source manifest and link configuration.
- `scripts/build-web.sh` configures **that subdirectory**, never the upstream
  repository-root CMake/autotools web path.
- `src/i_browser.c` schedules the engines' native one-frame functions with
  `emscripten_set_main_loop_arg`; the build does not use Asyncify.
- The framework owns the launcher document; this repository supplies only its
  declarative game/profile policy, adapter, and native artifacts.
- The suite and every locked image consume the same `wasm-game.json`,
  `game-adapter.js`, and variant-aware `wasm-game-data.json`. Do not add a
  downstream `index.html`, CSS shell, or title-specific launcher fork.
- No code or build logic from Dwasm, qwasm, or another WASM port is used.
- `wasm-game-framework` supplies the exact common suite/single-image launcher
  and Docker contract used by the rest of the portfolio. Image builds assert
  framework 0.9.4 at `c4ad3b9e075f881d32f044299fbfeee703a9169d`
  and layer every title over that one canonical base image. Its public browser
  global is `WasmGameFramework`; generic
  `wasm-game-framework.{js,css}` and `wasm-game-bootstrap.js` files replace the
  retired WolfWasm names.

Do not replace the build command with `emcmake cmake -S .`. That would enter
the upstream Emscripten seam that this project deliberately bypasses.

This is a downstream-only project. Do not submit patches, issues, pull
requests, or support requests to upstream on behalf of this port.

## Game-data boundary

Game WADs must remain outside Git, build artifacts, container images, and
public static routes. The shared framework provisions the selected title's
filename allowlist into the container's persistent `/data` volume, then
exposes only validated entries through same-origin `/game-data` endpoints. The
browser runs the same `/data-validator.mjs`, caches each file in origin-private
IndexedDB, and restores the cache before requesting the WAD again. There is no
`/data` or `/local-data` HTTP route and no Emscripten `.data` package.

The game data currently present on this workstation is a read-only regression
corpus. Its hashes label known results; they do not gate acceptance:

| Choice | Inspected file | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Doom | `/home/ted/.steam/debian-installation/steamapps/common/Ultimate Doom/base/DOOM.WAD` | 12,408,292 | `6fdf361847b46228cfebd9f3af09cd844282ac75f3edbb61ca4cb27103ce2e7f` |
| Doom II | `/home/ted/.steam/debian-installation/steamapps/common/Doom 2/base/DOOM2.WAD` | 14,604,584 | `10d67824b11025ddd9198e8cfc87ca335ee6e2d3e63af4180fa9b8a471893255` |
| Final Doom: TNT | `/home/ted/.steam/debian-installation/steamapps/common/Final Doom/base/TNT.WAD` | 18,195,736 | `c0a9c29d023af2737953663d0e03177d9b7b7b64146c158dcc2a07f9ec18f353` |
| Final Doom: Plutonia | `/home/ted/.steam/debian-installation/steamapps/common/Final Doom/base/PLUTONIA.WAD` | 17,420,824 | `a83b00c636fa3308286e76b1b3153fc14507caf994b0450770421260b08efed8` |
| Heretic | `/home/ted/.steam/debian-installation/steamapps/common/Heretic + Hexen/dos/base/heretic/HERETIC.WAD` | 14,189,976 | `12541f82e1d326b456b89411f8c54b895e775a611580f66b78558e898b2eaafa` |
| Hexen | `/home/ted/.steam/debian-installation/steamapps/common/Heretic + Hexen/dos/base/hexen/HEXEN.WAD` | 20,083,672 | `f74b857076b3ffe2597d0e05bdecc687496e6e8a9582d7a47db681e0e78e4001` |
| Chex Quest | `/home/ted/Development/wasm/data/crispy/CHEX.WAD` | 12,361,532 | `d8eb5277918883f490fb1a4be3c9a8588df2dbaee6dc4beb8df4929148bbffb1` |

The test suite also exercises the installed rerelease and enhanced revisions
of Doom, Doom II, TNT, Plutonia, Heretic, and Hexen. Acceptance comes from a
bounded header/directory parse and title-specific lump signatures, not an
exact byte count or digest. The parser caps reads and lump count, validates all
ranges, tracks duplicates without overwriting entries, distinguishes IWAD from
PWAD, and returns the SHA-256 only as fingerprint metadata. See
[`docs/owner-data-policy.md`](docs/owner-data-policy.md) for the complete rules.
`.gitignore` excludes WADs, `.data` files, web artifacts, and Python caches.

## Build

Prerequisites are CMake, a C compiler host environment, and an active
Emscripten SDK. If `emcc` is not already on `PATH`, set `EMSDK_DIR` (or
`EMSDK`) to the SDK checkout.

```bash
cd /home/ted/Development/wasm/idtech1-wasm
./scripts/build-web.sh
```

Optional controls:

```bash
IDTECH1_BUILD_DIR=/tmp/idtech1-build \
IDTECH1_BUILD_JOBS=8 \
EMSDK_DIR=/path/to/emsdk \
./scripts/build-web.sh
```

Successful output consists only of code:

```text
web/wasm-game.json
web/wasm-game-data.json
web/data-validator.mjs
web/game-adapter.js
web/assets/*.svg
web/assets/{doom,heretic,hexen}.png
web/dist/crispy-doom.js
web/dist/crispy-doom.wasm
web/dist/crispy-heretic.js
web/dist/crispy-heretic.wasm
web/dist/crispy-hexen.js
web/dist/crispy-hexen.wasm
web/dist/dsda-doom.js
web/dist/dsda-doom.wasm
web/dist/dsda-doom.wad
web/dist/chex.deh
web/dist/chexdeh.txt
```

There must be no `web/dist/*.data` or game WAD file. `dsda-doom.wad` is
generated entirely from the open DSDA source tree. `chex.deh` is checksum-
pinned from `/idgames`; its accompanying notice grants unrestricted use.

## Run

The WASM fetch requires HTTP; do not open `index.html` as a `file://` URL.

```bash
cd /home/ted/Development/wasm/idtech1-wasm
mkdir -p /tmp/idtech1-wasm-data
WASM_GAME_SITE_ROOT="$PWD/web" \
WASM_GAME_SHELL_ROOT="$PWD/../wasm-game-framework/dist" \
WASM_GAME_DATA_ROOT=/tmp/idtech1-wasm-data \
WASM_GAME_HTTP_PORT=4177 \
node ../wasm-game-framework/server/static-server.js
```

Open `http://127.0.0.1:4177/`. The framework-owned canonical document selects
the suite variant before applying its independent provisioning gate. Use the
first-run control to install that exact WAD and press **Play**. Doom and
Doom II share the Doom engine module. Reload before testing another engine.
Click the canvas once it is running so keyboard input, pointer capture, and
browser audio can activate. The framework displays its desktop-input warning
only on small/coarse-pointer clients.

## Exact serialized Chromium handoff

Browser use is serialized so only one game occupies Chromium at a time. A
2026-08-14 game-data test exposed and invalidated the earlier launcher-only
checkpoint. The first repair removed the browser-thread OPL wait; a second real
Chrome run then exposed WebAssembly's strict function-table signatures when a
new game spawned its first objects. Both blockers are now repaired and Doom
E1M1 has rendered in Chrome from the installed IWAD.

1. Open the framework-served suite in the coordinator-controlled Chromium
   session. Provision **Doom** with the exact `DOOM.WAD` path from the table if
   the container is not ready yet.
2. Press Play. Confirm the log says it mounted `doom.wad`, prints
   `[crispy-wasm] cooperative main loop registered`, and remains responsive for
   at least ten seconds. Confirm the title/menu is rendered. Use Enter to start
   a level; verify W/S move, A/D strafe, Q/E turn, Escape returns to the menu,
   capture is released outside gameplay, and a canvas click restores it.
3. Hard reload, select **Doom II**, and repeat with `DOOM2.WAD`.
4. Hard reload for **Heretic**, then **Hexen**, using compatible files from the
   table paths.
5. Hard reload after one successful run. In Chromium DevTools Network, confirm
   the browser restores the WAD from IndexedDB without a
   `/game-data/files/...` response. No `.data` response should exist.
6. Stop the framework server when the serialized check is complete.

For the Modernized check, load Doom with **Modernized — DSDA dynamic**. Chrome
must log `dsda-doom v0.29.4`, mount `/dsda-doom.wad`, register
`[dsda-wasm] cooperative browser main loop registered`, and render the
title/menu through DSDA's software scene renderer at the requested dynamic
viewport. The log must identify one SDL presentation renderer; accelerated
presentation is preferred and the compatible fallback is acceptable. Resize
and leave fullscreen, then confirm `document.documentElement.dataset.doomBackbuffer`
tracks the visible viewport without aspect distortion. Start E1M1 and verify
walls remain rectangular, W/S move
forward/backward, A/D strafe, Q/E turn, and the mouse turns horizontally
without a continuous one-direction drift. Type `iddqd` once and verify the
message appears while `doomFrames` continues increasing. On a 120 Hz display,
select 120 FPS and inspect `doomTargetFps` and `doomFps`; the former must be
`120` and the latter must continue updating. Confirm `doomAudioDevices` is `1`
and `doomAudioCallbacks` increases while sound plays. Pick up an item and
confirm the prior yellow sky/view flash is absent. For Chex, select **Chex
Quest** and confirm `chex.deh` loads from the same MEMFS directory as
`chex.wad` before the title appears.

## Verified status (2026-08-15)

- Emscripten 6.0.6 configured the independent `wasm/` project.
- Doom, Heretic, and Hexen each compiled and linked successfully.
- All eight generated engine module files returned HTTP 200 from the static
  server;
  `.wasm` responses used `application/wasm`.
- Generated modules export their distinct factory, `FS`, `callMain`, runtime
  state, and native-menu hooks.
- The build output contains no game WAD, `.data`, or Python cache file.
- The original engine-start attempt with Doom data deadlocked Chrome
  during OPL initialization. `OPL_Delay()` waited on an SDL condition from the
  same non-pthread browser thread whose audio callback had to signal it; its
  fallback `emscripten_sleep()` was also invalid because this independent build
  intentionally has no Asyncify.
- The downstream browser seam now trusts the successfully initialized in-process
  SDL software OPL driver instead of running hardware timer detection, skips
  the impossible condition wait, yields rather than sleep-polling for the next
  35 Hz tic or wipe step, and leaves FPS pacing to `requestAnimationFrame`. All
  three classic modules were rebuilt.
- The classic Doom state table intentionally stores one-argument mobj actions
  and three-argument weapon actions behind a shared erased function-pointer
  type. Native ABIs tolerate that historic pattern, while WebAssembly traps on
  the indirect-call signature mismatch. The web-only build now enables
  Emscripten adapter thunks with `EMULATE_FUNCTION_POINTER_CASTS`.
- The shared framework keeps SDL's inline desktop-sized canvas styles from
  overflowing the page. Chrome verified a contained 4:3 canvas, native menu
  navigation, new-game initialization, and a live E1M1 frame. The browser was
  not in Fullscreen API mode.
- Chrome rendered Original and Smooth through the fixed 4:3 canvas and reached
  a live E1M1 frame. DSDA Modernized used a 1085×806 internal/dynamic canvas
  and rendered a live game frame through SDL's software compositor. Its SDL
  presentation backend reported `opengles2 (0xa)`. The same
  build's legacy desktop-OpenGL translation reached native menu telemetry but
  presented an all-black compositor, so it is not exposed as a launch mode.
- Chromium coordinate/angle telemetry verified forward/backward and strafe
  bindings independently. The browser path no longer warps the SDL mouse while
  pointer-lock relative movement is active, eliminating synthetic continuous
  left turns. Vertical mouse movement and freelook remain disabled.
- WebAssembly-safe cheat dispatch calls zero-argument, integer-argument, and
  text-argument handlers through their exact signatures. `iddqd` no longer
  traps or freezes the main loop.
- Doom data was restored after hard reload from the framework's private
  browser cache with no WAD network request.
- The Modernized profile migration now replaces stale desktop-OpenGL, fixed
  resolution, old arrow-key, vertical-look, duplicate-gamepad, pickup-palette,
  and audio settings once. Later launches refresh only session-owned display
  and FPS values, preserving user key bindings and preferences.
- Native resize telemetry reports the authoritative DSDA backbuffer instead of
  assuming a JavaScript request succeeded. Native target/delivered-frame
  telemetry covers the 60/90/120 FPS controls. The adapter contract verifies
  immediate 1111×777 resizing. Serialized Chrome acceptance measured 599
  delivered frames over five seconds (119.8 FPS) at a native 1085×806
  backbuffer with the 120 FPS target selected.
- Modernized audio uses one SDL_mixer device, a low-latency browser slice, and
  a one-tic duplicate-SFX limit. Native active-device and callback counters are
  exported; Chrome observed one active mixer and a continuously increasing
  callback count, with no overlapping output path.
- Chrome accepted `iddqd`, displayed the invulnerability message, and continued
  advancing the native frame counter. The WebAssembly-safe cheat dispatcher no
  longer traps or hangs the runtime.
- The exact framework 0.9.4/`c4ad3b9` build, structural data tests, framework
  static-server flow, all seven Original/Smooth profile contracts, all five
  Modernized contracts, and the suite plus seven locked Docker images pass.

## Current limitations and next blockers

- Save/config data is attached to framework-owned IDBFS before native `main`.
  A forced close during an in-flight browser transaction can still lose the
  most recent interval; menu/capture transitions request an immediate flush.
- Native SDL_net code links through Emscripten's SDL_net port, but multiplayer
  transport has not been adapted or tested against a browser-reachable relay.
- Audio may remain suspended until a post-start canvas click, depending on the
  browser's autoplay policy. OPL register writes now initialize synchronously;
  audible output remains a manual check for this pass.
- DSDA Modernized offers a 120 FPS ceiling, but the software scene renderer is
  not claimed to sustain that rate on every viewport or device. It requests an
  accelerated SDL presentation renderer and falls back compatibly. A true
  GLES/WebGL scene renderer remains a separate future engine project; DSDA's
  fixed-function desktop OpenGL renderer is not exposed under a false label.
- DSDA MIDI/music decoding still reports an unsupported song format in the
  current minimal dependency build. Base DMX sound effects remain the supported
  audio path. The single-device and duplicate-SFX fixes are implemented, but
  audible echo still requires the serialized browser/manual acceptance above.
- Modernized disables the bonus/pickup palette flash to prevent the reported
  yellow sky/view artifact. Damage and radiation palette effects remain active.
- DSDA Modernized controller translation and audible echo remain open for
  hardware/manual acceptance because the automated session has neither a
  physical controller nor audible monitoring. Fullscreen requests are blocked
  while the ChatGPT browser-control overlay is attached; the framework's
  fullscreen-exit resize and capture contracts pass statically, but should be
  checked once in an ordinary unmanaged browser session.

## Static verification commands

```bash
git diff --check
node --check web/game-adapter.js
node scripts/verify-site-contract.js
find web build-web -type f \
  \( -iname '*.wad' -o -name '*.data' -o -name '*.pyc' \) -print
WASM_GAME_SITE_ROOT="$PWD/web" \
WASM_GAME_SHELL_ROOT="$PWD/../wasm-game-framework/dist" \
WASM_GAME_DATA_ROOT=/tmp/idtech1-wasm-data \
WASM_GAME_HTTP_PORT=4177 \
node ../wasm-game-framework/server/static-server.js
curl -fsSI http://127.0.0.1:4177/dist/crispy-doom.wasm
```
