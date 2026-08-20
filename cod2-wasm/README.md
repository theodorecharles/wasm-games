# Call of Duty 2 WASM

Call of Duty 2 WASM is an Emscripten integration for a reconstructed IW 2.0
multiplayer client. Status: **Still in development**. The current
checkpoint compiles the complete selected client source graph to WebAssembly
objects and runs a small native checksum diagnostic, but the game does not
link or launch yet.

The browser package uses wasm-game-framework 0.9.2 at immutable commit
`53bc7e6eeef1ae35dcf3b25dea4e3ec0ab46726f`. The framework supplies the HTML,
CSS, responsive canvas, setup gate, PWA metadata, service worker, and container
data service. This repository supplies only declarative manifests, an adapter,
the source-built diagnostic, and an original diagnostic icon.

## Current milestone

- 395 reconstructed multiplayer client translation units compile as WebAssembly objects.
- The native MD4/checksum diagnostic builds and executes in Node and the browser adapter.
- The framework package exposes one honest `cod2-mp` variant.
- A clean-room native test-client command ABI compiles with the full source graph.
- Single-player is not offered because this source tree has no SP client,
  server, game, cgame, or UI source families.
- The game executable does not link; no menu, level, renderer, input, network,
  or audio behavior is claimed.
- Controller input and save/config persistence are explicitly disabled until
  the multiplayer engine links and exposes native runtime seams.

The exact link blocker is the reconstruction's generated native data model.
It represents some names as both code pointers and linear-memory data. Native
ELF link options reconcile those aliases, while WebAssembly has separate
function-table and data symbol kinds and rejects the collision. Repair requires
a wasm-aware data/import generator, not undefined-symbol suppression.

## Multiplayer bot foundation

The reconstructed multiplayer server now keeps bot command intent in a
layout-safe sidecar and exposes GSC methods for test-client identity, stop,
movement, view angles, weapon selection, and native input actions. The server
submits those commands through the normal player movement path with the current
server time; it no longer generates random test-client input.

This foundation does not supply bot AI, navigation graphs, or population
scripts, and it does not change the current link-blocked status. The post-link
target is an 8-player population with `sv_maxclients 12`: independently
authored server logic will add bots up to eight total participants and remove
one as each human connects, while the extra four slots provide admission
headroom.

## Build and test

Requirements: Emscripten, CMake, Node.js, and Docker. The default Emscripten
checkout is `/home/ted/emsdk`; override it with `COD2_WASM_EMSDK`.

```bash
./scripts/test-web.sh
./scripts/build-docker.sh
./scripts/test-http.sh
```

The Docker build produces a suite image and a multiplayer-locked image:

```text
local/cod2-wasm:dev
local/cod2-wasm:cod2-mp-dev
```

## Required data setup

Start with a persistent data directory:

```bash
docker run --rm -p 8088:8088 \
  -v "$PWD/data:/data" \
  local/cod2-wasm:cod2-mp-dev
```

Open `http://localhost:8088` and select the required Call of Duty 2 `main`
directory when prompted. The container validates the exact 28-file Steam
inventory and stores it beneath `/data/main`. Direct `/data` and `/local-data`
HTTP routes remain unavailable.

At this diagnostic milestone the browser caches only the selected 706-byte
representative archive. Loading the complete 3.685 GB archive set into MEMFS
would exhaust the wasm32 address space; the future engine runtime needs a lazy,
archive-aware filesystem.

## Source boundary

Call of Duty 2 is identified here by its conventional IW 2.0 engine-family
label. IW 3.0 refers to the later Call of Duty 4 generation and must not appear
in this launcher's metadata.

The current browser checkpoint uses the technically more complete OpenCoD2
reconstruction because it compiles 395 selected translation units to
WebAssembly objects. That repository has no repository-level license file, so
the images remain local. The GPL-2.0 `xtnded/cod2` reconstruction is pinned and
evaluated in [SOURCE_BASE_AUDIT.md](SOURCE_BASE_AUDIT.md); its current native
and Emscripten CMake targets fail in the first translation unit and do not yet
build the reconstructed source graph.

The browser target uses reconstructed native source only. It does not restore
the removed inherited web target or import a third-party WebAssembly build.
It also does not include or fetch third-party bot scripts or waypoint data.
Generated JavaScript/WebAssembly and IWD archives remain outside Git and no
downstream HTML, CSS, service worker, or web manifest is authored here.

No changes from this repository are submitted upstream.
