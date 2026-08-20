# Emulation WASM

`emulation-wasm` is the console-emulation monorepo for NES, SNES,
PlayStation, and PlayStation 2 browser builds. Each system has a locked Docker
image identity, while `emulation-wasm` is the unified selector image.

The full name is deliberate. `emu-wasm` is shorter, but ambiguous;
`emulation-wasm` describes the repository cleanly and leaves names such as
`nes-wasm` available for the images people actually deploy.

This starts from maintained native emulator cores. It does not import another
browser emulator frontend, JavaScript UI, or prebuilt WebAssembly artifact.
The shared page, launcher, PWA, provisioning flow, persistence, responsive
canvas, fullscreen behavior, and controller connection surface come from
[`wasm-game-framework`](https://github.com/theodorecharles/wasm-game-framework).
This repository owns only console policy, native host seams, validation, and
controller mappings.

## Core choices

- NES uses [Nestopia JG](https://gitlab.com/jgemu/nestopia), an actively
  maintained Nestopia core with a small C ABI.
- SNES uses [bsnes-jg](https://gitlab.com/jgemu/bsnes), a current,
  cycle-accurate bsnes fork with the same native core ABI.
- PlayStation uses the [Mednafen JG port](https://gitlab.com/jgemu/mednafen),
  keeping the mature Mednafen PS1 core behind that ABI.
- PlayStation 2 uses [Play!](https://github.com/jpd002/Play-). Its portable
  native core is a better WebAssembly starting point than PCSX2's JIT-centric
  desktop architecture. The existing Play! browser UI and Emscripten host are
  excluded; this project will provide its own host and framework adapter.

The Jolly Good API is used as a native core boundary, not as a browser
frontend. Its versioned frame/audio/input/state interface lets the first three
systems share one Emscripten host without sharing emulator internals.

Exact repositories, tags, commits, build paths, and license files are recorded
in [source-lock.json](source-lock.json). See [docs/CORE_AUDIT.md](docs/CORE_AUDIT.md)
for the decision record, [docs/PS2_FEASIBILITY.md](docs/PS2_FEASIBILITY.md) for
the PS2 release gates, and [RUNBOOK.md](RUNBOOK.md) for milestone order.

## Runtime contract

The launch card owns controller discovery and the explicit Connect action.
The framework polls the browser Gamepad API and persists the chosen device
profile. The adapter owns the mapping from normalized physical controls to the
emulated console. Console adapters use `custom` mode and write directly to the
native virtual-pad state; they do not synthesize keyboard events.

Save RAM, memory cards, save states, and native emulator settings live under a
variant-scoped persistent filesystem. The framework separately persists the
selected controller and launcher preferences. Restore completes before a core
starts, writes are debounced and periodic, and page-hide triggers a final
flush. ROM, disc-image, and firmware storage is separate from mutable save data.

## Firmware

The setup card collects firmware through the same private provisioning flow as
game media. Current requirements are deliberately small:

- NES and standard SNES cartridges require no firmware.
- PlayStation requires one 512 KiB system image. The setup flow recognizes
  `scph5500.bin`, `scph5501.bin`, `scph5502.bin`, `scph1000.bin`,
  `scph1001.bin`, `scph1002.bin`, `psxonpsp660.bin`, or `bios.bin`. The adapter
  validates that single input and presents it under the three regional names
  expected by Mednafen, so the launcher never asks for three copies.
- PlayStation 2 uses Play!'s high-level system implementation and requires no
  BIOS image.

Famicom Disk System and SNES cartridges that depend on separate enhancement
firmware are not enabled yet. When those media types are added, their firmware
will be conditional manifest input requested only for affected games.

No ROM, disc image, firmware image, memory card, or save file is tracked or
included in a container image. Framework 0.9 now provides fixed firmware
provisioning plus a private selectable media library. Cartridge or disc entries
are installed atomically into `/data`, only the selected entry is cached by the
browser, and the same downstream validator runs on server upload and browser
restore. PS2 remains fail closed because multi-gigabyte media needs a range-
backed native filesystem rather than whole-file browser caching.

## Build state

NES and SNES now share a real Jolly Good API browser host built from their
locked native source. The host supplies SDL video, Web Audio through SDL,
keyboard and framework-controller input, framework-owned responsive sizing,
and an IDBFS-backed persistent tree that is restored before native `main()`.
Save RAM is committed when the cartridge unloads; host settings and explicit
save states use the same variant-scoped tree.

The SNES build carries one project-owned native patch that maps bsnes-jg's
libco threads to Emscripten fibers. It deliberately uses bsnes's cartridge
heuristics instead of loading the large upstream compatibility database at
startup. Standard gamepad cartridges run; compatibility for database-dependent
special hardware remains a release gate. NES and SNES therefore remain marked
**Still in development** despite their executable browser milestones.

PlayStation now uses the same real Jolly Good browser host with the pinned
Mednafen JG core. Its build uses Mednafen's vendored Zstandard and minilzo
sources and omits the FLAC-only audio-track reader; this milestone accepts an
atomic CUE plus its referenced BIN tracks. It mounts the selected disc and one
firmware image before native `main()`, maps DualShock buttons and both sticks,
and keeps memory cards, settings, and save states in the variant-scoped
persistent tree. The reproducible build limits the pinned upstream archive to
its PlayStation module.

This is a source-and-build checkpoint, not a runtime release. The earlier
all-module archive compiled and linked into the threaded PlayStation browser
runtime; the final clean rebuild after adding the PSX-only source filter was
intentionally stopped before completion. Re-run the two PlayStation build
commands below to close that reproducibility check. No compatible firmware and
CUE/BIN set was available locally for the final integration run, and browser
control was intentionally not used. Before this variant can be called Live,
run the PlayStation acceptance steps in the runbook with supplied media and
verify first boot, sustained frame and audio pacing, DualShock input,
memory-card persistence across a restart, and save-state restore.

PS2 still needs its new native host, random-access disc transport, and browser
renderer seam. It emits no placeholder runtime and remains fail closed.

The framework lock is finalized at 0.9.6, commit
`ad0226db55a2925bb250c6e31ca6786bd0dc73bd`. The normal suite keeps the
console-then-game picker. Deployments may optionally open a known entry with a
`?game=<variant>&media=<entry-id>` URL or lock one with `WASM_GAME_MEDIA`.

```bash
npm test
npm run fetch:sources

# Reproduce the native archive milestones:
VARIANT=nes EMSDK_DIR=/path/to/emsdk npm run build:core
VARIANT=snes EMSDK_DIR=/path/to/emsdk npm run build:core
VARIANT=ps1 EMSDK_DIR=/path/to/emsdk npm run build:core

# Build a browser runtime after its native archive:
VARIANT=nes EMSDK_DIR=/path/to/emsdk ./scripts/build-web.sh
VARIANT=snes EMSDK_DIR=/path/to/emsdk ./scripts/build-web.sh
VARIANT=ps1 EMSDK_DIR=/path/to/emsdk ./scripts/build-web.sh

# Build only images whose real artifacts are present:
DOCKER_TAG=dev ./scripts/build-images.sh nes snes ps1
```

Do not submit this browser integration or its patches to any upstream core
project.

## Projects

| System | Status | Docker image |
| --- | --- | --- |
| NES / Famicom | **Still in development** | `nes-wasm` |
| SNES / Super Famicom | **Still in development** | `snes-wasm` |
| PlayStation | **Still in development** | `ps1-wasm` |
| PlayStation 2 | **Still in development** | `ps2-wasm` |
