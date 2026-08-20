# Midtown Madness WASM Runbook

## Objective

Turn Open1560 into a self-hostable browser runtime for the original Midtown
Madness, using the required Build 1560 game data. Preserve Cruise and the
original single-player modes first, then assess the original multiplayer
protocol and a browser-compatible bridge. Every runtime claim must be proved in
real Chromium.

## Current checkpoint

- Downstream workspace: `/home/ted/Development/wasm/midtown-madness1-wasm`.
- Branch: `devel`; upstream fetch is enabled and upstream push is disabled.
- Source base: Open1560 at `965d1ccc`, licensed GPL-3.0.
- The engine has useful SDL3 and OpenGL modernization work, but it is not yet a
  WebAssembly game port.
- A real, executable-free browser slice now exists under `wasm/`: it validates
  an owner-selected AngelRes `.ar` file locally and reports its root entries.
  It does not contain, upload, persist, or serve game data.
- The real `code/midtown/stream/vfsystem.cpp` compiles to a wasm object as a
  build gate. The probe shares the exact archive structs factored into
  `code/midtown/stream/ares_format.h`.
- Full engine linking remains blocked by `code/midtown/game.asm`, which supplies
  engine functions that have not been rewritten in C++.
- The build and platform seams are still Win32/x86 and retain Windows APIs and
  legacy DirectInput, DirectSound, and DirectPlay assumptions.
- Owner media is available read-only on `root@4.20.69.100`; no retail file has
  been copied into Git, this workspace, or a container for this checkpoint.

## Feasibility verdict: executable-free, not source-complete

Open1560 does **not** hook, inject into, load, or call the retail
`midtown.exe`. Its normal build creates `Open1560.exe` from the C++ sources and
the repository's disassembled `game.asm`; the retail directory is only a
post-build/debug destination and the source of required data archives.

That distinction does not make the engine portable yet:

- `code/midtown/game.asm` is 509,827 lines / 11,290,124 bytes of `.686` 32-bit
  MASM and defines 4,456 public procedures. Emscripten cannot assemble or link
  it.
- The C++ tree still contains 4,775 `ARTS_IMPORT` markers across 364 files.
  Per `docs/methodology.md`, these mark functions not implemented in C++;
  `ARTS_IMPORT` itself expands to nothing.
- The root Premake configuration only defines a Win32/x86 platform, and the
  `Open1560` target always includes `game.asm`.
- `ARTS_STANDALONE` adjusts ABI checks, ownership wrappers, exported-symbol
  behavior, and hook registration. It does not remove `game.asm`, provide the
  imported implementations, or create a standalone game target. Its name must
  not be treated as evidence that the game can link from C++ alone.

Therefore title/menu or gameplay would require a substantial continuation of
the engine rewrite. The current honest milestone is the native-format archive
probe plus compilation of the real VFS source; it is not a menu, renderer, or
playable build.

## Absolute downstream-only rule

Do not open upstream pull requests, issues, discussions, or comments. Do not
contact maintainers. Do not push to `upstream`. All work stays in the eventual
`theodorecharles/midtown-madness1-wasm` downstream repository.

## Legal and data boundary

- Never commit or publish the disc image, executable, maps, textures, audio, or
  extracted game tree.
- Treat `game/1560.ar` as a provenance-review item before any public release;
  do not assume a tracked archive is redistributable merely because the engine
  repository is GPL.
- Development may mount or copy the owner's media into ignored local storage.
- The final launcher must validate owner-selected data by relative path, size,
  magic, and a locally generated manifest, then persist it browser-locally.
- Do not expose an unauthenticated HTTP upload or public retail-data route.

## Milestone order

1. **Partial:** compile a real portable data-path component and validate an
   AngelRes archive in WebAssembly without a game executable or retail data in
   the build. The `wasm/` probe satisfies this narrow milestone.
2. Reproduce the native Open1560 baseline against the exact Build 1560 data on
   a suitable 32-bit Windows toolchain.
3. Generate an inventory of every symbol still provided by `game.asm` and map
   each call to a portable implementation or a narrowly documented blocker.
4. Split Win32-only window, input, audio, timing, networking, filesystem, and
   diagnostics behind platform interfaces without regressing native builds.
5. Link a standalone portable build without x86 assembly or the original EXE.
6. Extend the reproducible Emscripten build from the archive probe to engine
   initialization using SDL3 and WebGL 2.
7. Convert the frame pump to `emscripten_set_main_loop` or an equivalent
   cooperative browser loop.
8. Mount validated owner data from OPFS/IndexedDB and reach engine init.
9. Render the authentic menu and start Cruise/single-player.
10. Prove keyboard, mouse, audio, HUD, aspect ratio, traffic, AI, and save state.
11. Assess multiplayer protocol and add a same-origin browser transport only
    after single-player is real.
12. Add the shared launcher, profiles, 30/60/120 FPS dynamic quality, Docker,
    and lifecycle behavior without packaging retail data.

## Build and test the WebAssembly probe

Prerequisite: an activated Emscripten SDK. The local verified SDK is 6.0.6 at
`/home/ted/emsdk`.

```sh
source /home/ted/emsdk/emsdk_env.sh
emcmake cmake -S wasm -B artifacts/build/wasm -DCMAKE_BUILD_TYPE=Release
cmake --build artifacts/build/wasm --parallel 2
ctest --test-dir artifacts/build/wasm --output-on-failure
python3 -m http.server 8012 --bind 127.0.0.1 \
  --directory artifacts/build/wasm/dist
```

Then open `http://127.0.0.1:8012/` and choose an `.ar` file. Generated files are
ignored and remain under `artifacts/build/wasm/dist/`:

- `index.html`
- `probe-ui.mjs`
- `mm1-asset-probe.mjs`
- `mm1-asset-probe.wasm`

The automated contract creates a synthetic archive and proves valid, invalid
magic, and truncation behavior. A second test reads the already tracked
`game/1560.ar`; at this checkpoint it reports a valid 796,715-byte AngelRes
archive with 29 nodes and 7 roots. This is validation only; nothing is extracted
or copied into the generated site.

Verified on 2026-08-14:

- Emscripten 6.0.6 configured and built both targets without warnings.
- `ctest`: 2/2 passed (`mm1_asset_probe_contract` and
  `open1560_archive_probe`).
- Both the linked probe and `vfsystem.cpp` compile-gate object identify as
  WebAssembly MVP binaries.
- Chromium loaded the HTML, JS module, and wasm at `127.0.0.1:8012` with the
  expected ready state and no warning/error console entries. The built-in
  browser self-test exercises the complete JS-to-wasm validation path without
  game data; the tracked archive is exercised through Node by the second CTest.

## Browser acceptance gate

Use `http://127.0.0.1:8012/` and test this lane alone. Save screenshots and
console logs under ignored `artifacts/runtime/`. Compiler success is not a
browser milestone. The minimum playable claim requires the authentic menu, a
rendered drive, steering/throttle input, audio initialization, and a reload that
reuses browser-local data without recopying it.

## First blocker to solve

The archive format and a real VFS translation unit are no longer the first
compiler blocker. The next gate is a source-only link inventory: remove
`game.asm` from a dedicated standalone target, capture every unresolved symbol,
and divide that list by the earliest initialization path. Do not spend time on a
game launcher or claim title/menu progress until the initialization closure
links without MASM. After that, the smallest user-visible path is to initialize
data, open a window, load the authentic title resources, and advance one browser
frame.
