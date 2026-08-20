# id Tech 2 WASM runbook

## Guardrails

- Work only from the two history-pinned native source ports in this repository.
- Never commit, publish, proxy, or embed game PAKs.
- Never add a downstream HTML document, stylesheet, service worker, or web
  manifest. Those belong to `wasm-game-framework`.
- Keep the framework pinned to v0.9.4 /
  `c4ad3b9e075f881d32f044299fbfeee703a9169d`; verify from an isolated
  checkout when a shared checkout has moved.
- Do not submit issues, patches, discussions, or pull requests upstream.

## Build layout

`scripts/build-web.sh` builds the root WinQuake target into `web/dist/`, builds
the Quake II target from `engines/quake2/`, installs both native delegates and
source-derived icons, and copies the exact framework browser package.
No game-data directory is a build input.

Useful build overrides:

```bash
IDTECH2_Q1_BUILD_DIR="$PWD/build-web-q1" \
IDTECH2_Q2_BUILD_DIR="$PWD/engines/quake2/build-web-q2" \
IDTECH2_BUILD_JOBS=8 \
EMSDK_DIR=/path/to/emsdk \
WASM_FRAMEWORK_DIR=/path/to/wasm-game-framework-v0.9.4 \
./scripts/test-web.sh
```

`scripts/test-web.sh` validates both WebAssembly modules, native browser seams,
the generic API, exact data policy, source-derived PWA icons, and absence of
game data or workstation paths. `scripts/test-static.sh` exercises the real
framework server with an empty temporary `/data` root and proves both variant
gates plus the private data boundary.

## Container smoke

Build all three deployable images:

```bash
EMSDK_DIR=/path/to/emsdk \
WASM_FRAMEWORK_DIR=/path/to/wasm-game-framework-v0.9.4 \
./scripts/build-images.sh
```

Run one image at a time with an empty named volume for provisioning checks:

```bash
docker run --rm -d --name idtech2-smoke -p 127.0.0.1:18082:8088 \
  -v idtech2-smoke-data:/data idtech2-wasm:dev
curl -fsS http://127.0.0.1:18082/wasm-game.json
curl -fsS 'http://127.0.0.1:18082/game-data/status?variant=quake'
curl -fsS 'http://127.0.0.1:18082/game-data/status?variant=quake2'
test "$(curl -sS -o /dev/null -w '%{http_code}' \
  http://127.0.0.1:18082/data/id1/pak0.pak)" = 404
docker stop idtech2-smoke
docker volume rm idtech2-smoke-data
```

For locked images, use the same sequence with `quake1-wasm:dev` or
`quake2-wasm:dev`. Their `WASM_GAME_VARIANT` value is `quake` or `quake2`, so
the framework renders only that title and ignores a query-string selection.

## Native behavior audit

Quake Original must remain a fixed 640×480, 4:3 framebuffer. Modernized must
use `Q1_BrowserResize` to resize the real software color/depth/surface-cache
buffers, never stretch a fixed 4:3 backbuffer. The official renderer's static
scan tables bound the native mode to 1280×1024; larger viewports are reduced
without changing aspect. Modernized removes the original 72 FPS filter and
runs at the browser display cadence. It remains a software renderer, so do not
describe it as OpenGL or as filtered texture rendering.

`WinQuake/sys_emscripten.c`, `vid_emscripten.c`, and `snd_emscripten.c` own the
cooperative loop, state, trusted menu dispatch, controls, framebuffer, and
engine-owned Web Audio resume behavior. Browser defaults are a versioned
one-time config migration: subsequent launches must retain custom bindings,
explicit unbinds, and sensitivity. The attract loop checks its index before
accessing the fixed demo table and clears stale names when a new list is
installed.

Quake II should retain native-managed dynamic resizing, horizontal-plus FOV,
WebGL 2 / GLES 3, quality application, input capture, and audio/state telemetry.
Its required PAKs mount read-only at `/data/baseq2`; each variant restores its
browser-private settings and saves under `/persistent/idtech2/{variant}` before
native main. Controller support is currently disabled.

Browser interaction testing is intentionally outside the static and HTTP
checks and must use the separately coordinated browser-testing slot. Quake's
acceptance sequence is:

1. Original reports and retains a 640×480 native backbuffer across viewport
   changes; Modernized reports the exact aspect-correct native backbuffer at
   narrow and wide viewport sizes.
2. SDL Web Audio reports a running context plus increasing callback and
   nonzero-callback counters after a trusted interaction.
3. The first config migration reports the complete WASD/mouse mask; a later
   launch restores a changed binding/sensitivity instead of replacing it.
4. New Game enters loading/gameplay with automatic capture. Escape opens the
   native menu and releases capture; native Resume recaptures it.
5. New Game while a server is already active reaches a fresh controllable
   start map without a synchronous modal loop, freeze, or abort.
6. A native save produces `s0.sav`, requests an immediate IDBFS flush, and both
   the save and `config.cfg` restore after a new page load.
7. The complete attract-demo cycle repeats without an out-of-bounds read,
   stale demo name, WebAssembly trap, or fatal engine log.

The same coordinated pass must retain Quake II's accepted real dynamic
backbuffer/projection aspect at narrow, wide, fullscreen-enter, and
fullscreen-exit sizes. Adapter hooks and static telemetry alone do not satisfy
these runtime checks.
