# Emulation WASM runbook

## Non-negotiable boundaries

- Do not submit this work or its patches upstream.
- Do not import an existing browser emulator frontend or prebuilt web artifact.
- Do not add ROM, disc, firmware, save, or memory-card bytes to Git or images.
- Do not add downstream HTML, CSS, service workers, or web manifests.
- Do not publish a placeholder image. An image must contain a native JS/WASM
  pair and pass its system smoke test.
- Keep public status to **Live** or **Still in development**.

## Source bootstrap

```bash
npm test
npm run fetch:sources
npm run audit:sources

# Current reproducible native compilation milestones:
VARIANT=nes EMSDK_DIR=/path/to/emsdk npm run build:core
VARIANT=snes EMSDK_DIR=/path/to/emsdk npm run build:core
VARIANT=ps1 EMSDK_DIR=/path/to/emsdk npm run build:core
```

`fetch-sources.sh` creates detached, exact-revision checkouts beneath ignored
`vendor/`. It never follows a moving branch. Play! submodules are checked out at
the gitlinks recorded by the locked parent revision.

## Milestone order

### 1. Shared host against a test core

Implement `engine/include/emulation_host.h` with The Jolly Good API 2.0.0.
Begin with Nestopia JG and a tiny purpose-built test cartridge kept outside the
repository. Deliver one video frame, one audio block, and one input transition.

### 2. Framework persistence

Before calling `emulation_host_boot`, attach the framework persistent
filesystem. Configure `/persistent/{variant}/config`,
`/persistent/{variant}/saves`, and `/persistent/{variant}/states`. Test a
battery-RAM change across a full page close and
reload; a save-state-only test is insufficient.

The 0.9 worker contract must also be preserved for a worker-hosted core: pass
the resolved namespace/root and exact framework script to the worker, import it
there, create the worker-local persistence manager, await attach/restore before
native main, and flush through that same manager.

### 3. Framework controller contract

Connection occurs on the launch card. The Play click may resume audio and start
the core only after the selected controller is either connected or explicitly
skipped. Test connect, disconnect, reconnect, mapping override, analog value,
and a keyboard-only launch.

### 4. NES

Build only the Nestopia static JG archive and the shared host. Start with `.nes`
media. Confirm mapper database lookup, 60/50 Hz timing, audio unlock, SRAM,
states, fullscreen, and controller mapping. Add FDS only after standard carts
pass. Standard cartridges require no firmware. FDS must remain unavailable
until its media policy conditionally requests and validates `disksys.rom`.
The locked core currently compiles into an Emscripten static archive via
`scripts/build-native-core.sh`; the shared host is the remaining runtime step.

### 5. SNES

Build the bsnes static JG archive with its balanced defaults. Resolve libco for
Emscripten, then measure real frame time. Confirm variable-height framebuffer,
audio pacing, SRAM, states, and standard pad. Add special firmware and alternate
input devices later. Standard cartridges require no firmware; enhancement-chip
firmware must be requested only for media that identifies the relevant chip.
The locked core currently compiles into an Emscripten
static archive. The repeatable build enables the vendored samplerate library
and creates the nested object directory omitted by its upstream build rule.

### 6. PlayStation

Build the pinned Mednafen JG archive and expose only its PlayStation system
through the browser host. Provision a CUE and every referenced BIN track
atomically. Confirm firmware discovery,
DualShock buttons and sticks, memory cards, disc audio, states, and disc change.
The fixed policy captures one 512 KiB firmware image under a recognized common
filename; the adapter mounts that image under all three regional names expected
by Mednafen before launch. The Emscripten build uses Mednafen's vendored
Zstandard and minilzo sources. FLAC-backed audio tracks are outside the first
CUE/BIN milestone. Measure sustained browser frame time before enabling
filters. Framework 0.9 installs CUE/track bundles atomically and caches only
the selected disc; do not replace that with a title-specific uploader.

Checkpoint boundary: the pinned all-module archive compiled and linked into a
threaded PlayStation browser runtime without embedding firmware or disc data.
The subsequent PSX-only source filter applies cleanly, but its final clean
archive rebuild was stopped before completion; reproduce it with
`VARIANT=ps1 EMSDK_DIR=/path/to/emsdk npm run build:core`, followed by the PS1
`build-web.sh` command below. Runtime verification also remains blocked on a
supplied 512 KiB firmware image and atomic CUE/BIN set. Run the acceptance
matrix below, including sustained frame/audio observation, both analog sticks,
memory-card data after a full browser restart, and save-state restore. Until
those checks pass, keep the PlayStation variant **Still in development**.

### 7. PlayStation 2

Build Play!'s native core while excluding the locked web paths in
`source-lock.json`. Implement block-based disc access before attempting a full
game. Validate the GS renderer with a small test executable, then boot one disc.
Measure CPU, memory, audio underruns, and cache growth. Do not mark the variant
Live on a boot-logo-only result. Play! does not require a PS2 BIOS image.

## Build commands

Once a variant's native host is implemented:

```bash
VARIANT=nes EMSDK_DIR=/path/to/emsdk ./scripts/build-web.sh
```

Expected output:

```text
build-web/nes/emulator.js
build-web/nes/emulator.wasm
web/dist/wasm-game.json
web/dist/game-adapter.js
```

The build copies no framework-owned page files. `scripts/build-images.sh`
checks the exact framework release, builds the suite and four locked identities,
and rejects any variant without runtime artifacts.

## Acceptance matrix

For each system, test in Chromium after the shared serialized browser slot is
available:

1. fresh launch and already-cached launch;
2. keyboard-only and connected-controller launch;
3. connect/disconnect while on the launcher and while running;
4. fullscreen entry and Escape exit with immediate resize;
5. save data after reload and after browser restart;
6. controller mapping after browser restart;
7. missing-data provisioning and ready-state launcher suppression;
8. direct `/data` and `/local-data` requests return 404;
9. optional password gate blocks page, media, status, and runtime files;
10. no framework-owned document artifacts exist downstream.
