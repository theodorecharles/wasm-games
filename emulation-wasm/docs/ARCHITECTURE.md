# Architecture

```text
wasm-game-framework
  launcher / PWA / fullscreen / responsive canvas
  provisioning / browser cache / persistent filesystem
  controller discovery / polling / connection state
                |
                v
emulation-wasm adapter
  media policy / controller mapping / core options
  variant state / save paths / native exports
                |
        +-------+-------+----------------+
        |               |                |
        v               v                v
shared JG host       shared JG host    Play! host
Nestopia JG          bsnes-jg          native PS2 core
Mednafen JG
```

The diagram intentionally separates browser responsibilities from emulator
responsibilities. There is one document and one launcher implementation: the
framework's. This repository contains no `index.html`, stylesheet, service
worker, or web manifest.

## Shared JG host

The first three variants use The Jolly Good API 2.0.0 as a stable native ABI.
The Emscripten host must:

1. initialize exactly one statically linked core;
2. load one validated media set from a read-only mount;
3. restore the variant persistent mount before core initialization;
4. expose audio frames through an SDL/Web Audio-compatible ring buffer;
5. upload the core framebuffer to the framework-owned canvas;
6. accept normalized virtual-pad state once per frame;
7. serialize save RAM and states into the persistent mount;
8. yield every frame through Emscripten's browser main-loop API.

The native exports are specified in `engine/include/emulation_host.h`. The host
does not perform browser DOM work and does not discover physical controllers.

## Play! host

The PS2 target implements the same exported surface but not the JG internals.
Disc access is a random-access stream, never a pointer to a complete in-memory
image. The first implementation should prefer OPFS sync access handles in a
worker and expose bounded block reads to the core. HTTP range reads are a
fallback for server-resident content.

## Media versus mutable state

Media and firmware are read-only deployment data cached by content identity.
Mutable state is variant-scoped and restored before the engine starts:

```text
/persistent/{variant}/config
/persistent/{variant}/saves
/persistent/{variant}/states
/persistent/{variant}/screenshots
```

NES battery RAM and SNES SRAM go under `saves`. PS1 and PS2 memory cards do as
well. A state file is never used as a substitute for a core's normal save
format.

## Controller boundary

The framework owns the browser Gamepad objects. It passes normalized snapshots
containing stable semantic control names, float axis/button values, timestamps,
and connection changes. The adapter converts that snapshot into the virtual
pad fields exported by the native host.

Mappings are adapter policy. They are not embedded in the framework, and the
native core never depends on a browser gamepad index. User overrides are stored
inside the variant preference namespace. Rumble is an optional adapter request
that the framework routes only when the selected device exposes an actuator.
