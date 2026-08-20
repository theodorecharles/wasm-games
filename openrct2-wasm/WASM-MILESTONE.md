# OpenRCT2 WebAssembly milestone

Status: **Still in development**

This branch wraps the official OpenRCT2 source in `wasm-game-framework` and
builds a deployable `openrct2-wasm` image. The native runtime starts in a
dedicated application worker, mounts a provisioned RCT2 installation without
copying it into the Wasm heap, reports native lifecycle state, resizes its real
backbuffer, and persists OpenRCT2 user data in browser storage.

It remains in development while broader browser and gameplay acceptance is
completed, but the native menu, indexed-pixel presentation, audio, pointer
input, scenario picker, and first park session are now functional.

## Source and framework inputs

- Upstream: <https://github.com/OpenRCT2/OpenRCT2>
- OpenRCT2 release: `v0.5.4`
- OpenRCT2 source commit: `4a7ee146caab8888eb31e56a33c0559db89b17bd`
- Build image: `ghcr.io/openrct2/openrct2-build@sha256:0e1daa8e3f5a1c6951179aeab5c5de471ea705cb5f756bfb6e0ae5162b7e67be`
- Framework release: `v0.9.6`
- Framework commit: `ad0226db55a2925bb250c6e31ca6786bd0dc73bd`

The image build verifies these framework files against the pinned source
before extending the base image:

```text
b3c8e473fd5dd1e24d50e714d5b1ccb0505516ea6184deaa9efbefdad071dddd  wasm-game-framework.js
13bb7b72ca201e8adaa6dd189bb43b0d84871d2e3b1b9c148600d277f65dedae  wasm-game-bootstrap.js
7293129ca0161ad3ebd6312857e4b88526e70bfe606a10e4fb34f7a6ea4d396a  package.json
f0d922ab0692e7807f65a9f4601ba56903b91f2955c76eb58e5edf93e47d4882  media-library.js
```

The browser package contains only the manifest, adapter, validator, worker,
engine artifacts, and source-derived OpenRCT2 icons. The shared framework provides
the HTML, CSS, service worker, web manifest, launcher, PWA metadata, fullscreen,
viewport policy, media UI, and persistence lifecycle.

## Runtime architecture

The four installation directories are stored once in the container data
volume and once in the framework browser media cache:

```text
container media library -> cached browser File objects
                        -> dedicated OpenRCT2 application worker
                        -> WORKERFS mounts at /RCT/{Data,ObjData,Scenarios,Tracks}
```

This deliberately avoids JSZip and avoids copying the approximately 1.17 GiB
installation into MEMFS. Native pthread filesystem calls return to the
application worker, where the Blob-backed WORKERFS mounts exist. OpenRCT2's own
native load/save window reads and writes the framework-managed IDBFS tree at
`/save/openrct2`. Named parks, rotating autosaves, configuration, keybindings,
tracks, screenshots, and landscapes stay in that tree. Successful manual
saves, keybinding changes, and screenshots request an immediate flush;
autosaves and ordinary configuration updates use the framework debounce and
periodic flush policy.

The downstream contract is explicit:

- dynamic native-managed backbuffer, immediate resize, maximum DPR 1;
- browser cursor with absolute canvas coordinates and no pointer lock;
- native scene-manager lifecycle state (`loading`, `menu`, `gameplay`, or
  `paused`);
- keyboard, text, and wheel events translated to SDL in the application
  worker; absolute pointer state and mouse buttons enter OpenRCT2's native
  input queue directly so worker builds retain exact hover/click coordinates;
- controller mode disabled; controller polling/UI is reserved for emulator
  projects;
- original RCT2 title sequence selected because the OpenRCT2 showcase sequence
  depends on optional community objects;
- launcher media controls hidden after the provisioned installation is ready.

`Data` remains Blob-backed so its 931 MiB of graphics and music archives are
not duplicated in memory. The 244 MiB hot set (`ObjData`, `Scenarios`, and
`Tracks`, including the optional RCT1 scenario/track directories) is cached
one complete file at a time on first access. Repeated native seeks then read
the resident bytes instead of issuing thousands of synchronous Blob slices;
the cache is outside the Wasm heap and releases each replaced Blob reference.

The package uses the official 512-pixel OpenRCT2 icon as its PWA source and the
official `.ico` as its launcher icon.

## Build and provision

Use a clean framework checkout at the exact commit above:

```sh
WASM_GAME_FRAMEWORK_ROOT=/path/to/wasm-game-framework scripts/build-framework-runtime
WASM_GAME_FRAMEWORK_ROOT=/path/to/wasm-game-framework scripts/build-framework-image openrct2-wasm:dev
scripts/test-framework-image openrct2-wasm:dev
```

The launch card accepts the RCT2 GOG setup executable and its companion `.bin`
when they are selected together. The RCT1 GOG setup pair can be included in the
same selection to add RCT1 scenarios and assets. Extraction runs on the server;
the browser receives only the validated OpenRCT2 directory tree. Selecting the
`Data`, `ObjData`, `Scenarios`, and `Tracks` directories from an already
extracted RCT2 installation remains supported as well.

The exact downloaded installers can be exercised without modifying them:

```sh
scripts/test-gog-importer \
  "/path/to/rct2-setup.exe" "/path/to/rct1-setup.exe"
OPENRCT2_IMAGE=openrct2-wasm:dev scripts/test-gog-image \
  "/path/to/rct2-setup.exe" "/path/to/rct2-setup-1.bin" \
  "/path/to/rct1-setup.exe" "/path/to/rct1-setup-1.bin"
```

Provision and run a named data volume:

```sh
scripts/audit-rct2-data "/path/to/RollerCoaster Tycoon 2"
scripts/provision-local-data openrct2-wasm:dev openrct2-data "/path/to/RollerCoaster Tycoon 2"
scripts/provision-gog-volume openrct2-combined \
  "/path/to/rct2-setup.exe" "/path/to/rct2-setup-1.bin" \
  "/path/to/rct1-setup.exe" "/path/to/rct1-setup-1.bin"
docker run --rm -p 8088:8088 --mount source=openrct2-data,target=/data openrct2-wasm:dev
```

The local-directory provisioner is idempotent. The GOG provisioner refuses to
replace a ready named volume, so a combined RCT1+RCT2 candidate can be prepared
and accepted without changing a working RCT2-only library. The framework
displays the directory picker only when the volume has no accepted
installation. The validator reads at most 64 bytes total and checks the
directory/sentinel layout without hashing every large asset.

The current extracted-folder fixture contains 2,951 files and 1,225,462,276
bytes:

```text
Data          134 files    976042241 bytes
ObjData      2122 files    191054826 bytes
Scenarios     143 files     55256999 bytes
Tracks        552 files      3108210 bytes
```

## Current reproducible evidence

Static/package/image checks pass for the current candidate. The image test
verifies both an empty data volume and the provisioned `openrct2-data` volume;
the latter reports one ready 2,951-file entry while keeping the launcher media
controls hidden:

```text
adapter package contract passed for 1 variant
bounded RCT2 installation validator passed
OpenRCT2 image package, range serving, isolation headers, data state, and
private-data boundary passed

GOG launch-card import passed with 2,456 RCT2 files plus 497 RCT1 files: 2,953
transformed files and 1,228,573,939 bytes total.

586d6fb0116cda145d9112c0c1601d94787b924ce2c42b6c0243839e37079e7e  openrct2.js
47c9e439375f10b814810c0dc6fe8ed5f7c67c057ad87c801d77f1289cbf61b5  openrct2.wasm
67d5eb15e5b656782492409c31241d4451bda0dff6ea9de845c94050a22b74a8  openrct2.data
a353c39a961398b0d0157733330d907768d30a0fcade9e2dc72284b1ddffffbd  openrct2.ico
9e0ea4583bd2f38cb87ca48aa020e7deea39591321f6caae4e702cdfaafc2a9e  openrct2-192.png
14547c761454ddaeaed45a798d33d7354105e9d47095ab240bd131385f27ecec  openrct2-512.png
```

The image ID is recorded by `scripts/test-framework-image` for each rebuild.

The framework source commit and the verified in-image file hashes above
remain the build authority.

The current browser build visibly presents OpenRCT2's indexed framebuffer at
the native canvas size using a worker-safe palette-to-RGBA compositor. A real
Chrome pass displayed the animated RCT2 title park, delivered the title music
through the bounded worker-to-main audio bridge, reported a running 48 kHz
audio context with progressing buffers, and opened the native scenario picker
using correctly aligned mouse input. The native framebuffer had 4,044 varying
samples out of 4,096 and the screenshot contained more than 190 colors.

Browser startup never opens OpenRCT2's desktop changelog window. It records
the current version in the persistent configuration so the window remains
suppressed on fresh installs and after image upgrades. Framework 0.9.6 restores
the 2,951-file installation through a bounded parallel cache pipeline instead
of one file and IndexedDB transaction at a time.

The worker audio bridge primes three native mixer buffers and maintains an
80-ms playback lead. It never resets onto already scheduled sources when the
producer gets too far ahead; excess input is dropped without overlapping the
timeline. Queue depth, producer sequence gaps, underrun count, and cumulative
underrun duration are published as runtime telemetry so audible stutter can be
separated from browser or worker scheduling guesses.

The first scenario initially deadlocked because `ObjectManager` dispatched
file-backed object loads to pthreads and then blocked the application worker in
`JobPool::Join`; the pthread filesystem calls needed that same worker to serve
WORKERFS. The Emscripten build now loads scenario objects sequentially on the
application worker while native platforms retain the threaded path. A manual
foreground retest entered the selected scenario successfully with graphics,
music, and mouse input working.

The three native indexes (`objects.idx`, `tracks.idx`, and `scenarios.idx`)
are written under `/save/openrct2` and flushed immediately after the first
startup scan. The measured cached reload reached the native menu in 21.8
seconds while restoring a 517,167-byte combined index set; the initial launch
also has to index the full installation.

## Remaining release blockers

- Finish a real park session and verify native named save/load, rotating
  autosaves, screenshots, and changed keybindings across a full browser reload.
- Repeat the accepted Chrome visual/audio/input path in Firefox after the final
  input build, and test the combined RCT1+RCT2 imported installation in the
  browser rather than only through importer/validator integration tests.
- The OpenRCT2 source build retains its existing linker warning for the
  `RideMusicGetTrackOffsetLength_Default` signature mismatch. The Wasm module
  validates and links, but the warning remains recorded rather than hidden.
- Networking, OpenGL, HTTP, TTF, FLAC, and Discord integration are disabled in
  this first target.

The image remains **Still in development** until those persistence and
cross-browser gameplay checks pass.
