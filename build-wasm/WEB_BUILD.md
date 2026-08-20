# Build Engine family WebAssembly build

This branch builds the native NBlood and EDuke32 targets for a single-threaded
Emscripten runtime. It uses SDL2, SDL/Web Audio, Vorbis, Asyncify, memory
growth, and the native Build 8-bit software renderer. No game data is
linked or preloaded. The only preload is tracked `nblood.pk3`, an engine
resource needed by NBlood.

The downstream owns no HTML, CSS, service worker, or web manifest. It installs
the canonical browser package from exact wasm-game-framework 0.9.4 commit
`c4ad3b9e075f881d32f044299fbfeee703a9169d`.

## Required game data

The suite manifest is variant-aware and exact:

- Blood accepts the verified One Unit Whole Blood policy: 24 required files
  and 33 optional demo, Cryptic Passage, movie, and OGG entries. Every entry has
  an exact byte size and SHA-256 digest; RFF files also have their signature.
- Duke Nukem 3D accepts the 1.3d `DUKE3D.GRP` with size `26524524`,
  `KenSilverman` signature, and SHA-256
  `7c729a8f1f2877869feab30b77a062812cd927b8209452892c1b51d69247babc`.
  The matching `DUKE.RTS` is optional and also has an exact size and digest.

The framework validates uploads into persistent container `/data`, exposes
only allowlisted valid keys through its gated endpoint, and caches them in the
browser's origin-private IndexedDB. Neither `/data` nor `/local-data` is served
as a static path. The adapter mounts restored files at read-only `/game` using
a bounded preserve-paths MEMFS mount. Saves and settings use per-engine IDBFS
directories.

## Build and verify

Use the isolated framework release checkout or another checkout at the exact
commit:

```bash
WASM_FRAMEWORK_DIR=/path/to/wasm-game-framework \
EMSDK_DIR=/path/to/emsdk \
./scripts/test-web.sh

WASM_FRAMEWORK_DIR=/path/to/wasm-game-framework \
./scripts/test-static.sh
```

`BUILD_WASM_BUILD_DIR` can select an ignored build directory and
`BUILD_WASM_JOBS` controls compilation parallelism. Expected ignored output is
under `build-web/dist/`:

```text
blood.js blood.wasm blood.data
duke3d.js duke3d.wasm
game-adapter.js adapters/{blood,duke3d}.js
wasm-game.json wasm-game-data.json
blood.ico blood-{192,512}.png
duke3d.ico duke3d-{192,512}.png
shared-shell/*
```

## Images

Build and HTTP-smoke the suite and both locked images:

```bash
WASM_FRAMEWORK_DIR=/path/to/wasm-game-framework \
EMSDK_DIR=/path/to/emsdk \
./scripts/build-images.sh
```

Run a suite image with a private persistent game-data directory:

```bash
docker run --rm -p 127.0.0.1:8007:8088 -v build-game-data:/data build-wasm:dev
```

The locked images use the same artifacts and manifest with server-enforced
variants `blood` and `duke3d`.

## Classic profile

Both titles use only `classic`; the launcher hides graphics controls until a
second verified renderer profile exists:

- fixed 800×600 contained at 4:3 with no stretch;
- 8-bit software rendering and pixelated presentation;
- WASD reapplied after persisted configuration loads;
- horizontal mouse look, while mouse Y preserves classic forward/back input;
- Blood native menu/gameplay/paused/debrief/loading state, New Game capture
  intent, and synchronous capture-loss menu hooks;
- Duke native menu/gameplay/paused state and capture-loss menu hooks;
- SDL stereo and optional game-data music through Web Audio.

Duke's desktop attract/menu function is a blocking loop. The browser port
keeps the native menu and actions but advances that front end once per browser
frame; attract-demo playback is disabled in this classic browser path.

## Polymost/WebGL blocker

The source has GLES conditionals, and isolated `USE_OPENGL=1`, WebGL 2/ES3
compile probes now link both Blood and Duke artifacts. That is build evidence,
not a gameplay claim: the shipped adapter still fixes 8-bit mode, has no
profile-driven renderer selection or dynamic resize seam, and the WebGL
artifacts have not received serialized browser renderer, input, lighting,
context-loss, or aspect testing. Until those native/runtime contracts are
implemented and reviewed, no dynamic or modern profile is declared.
