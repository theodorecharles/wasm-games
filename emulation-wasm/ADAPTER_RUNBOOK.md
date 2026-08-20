# Console adapter contract

This runbook is the implementation checklist for `web/game-adapter.js` and the
native host. Browser lifecycle remains in `wasm-game-framework`.

## State ownership

The adapter reports only these states:

```text
launcher -> loading -> gameplay -> paused -> gameplay
                    \-> crashed
```

Console cores have no desktop-style menu that changes pointer capture. The
framework keeps keyboard focus on the canvas while gameplay is active, releases
it for its own pause/launcher surfaces, and never requests pointer lock for the
four initial variants.

## Start order

`start(context)` must execute in this order:

1. set engine state to `loading`;
2. resume audio from the Play gesture;
3. load and validate the selected media set;
4. instantiate the modularized Emscripten factory with the framework canvas;
5. attach `context.persistence` to the module filesystem;
6. create config/save/state directories under the attached root;
7. mount media read-only without copying a PS2 disc into MEMFS;
8. apply the adapter's controller profile;
9. initialize the native core and load the selected media;
10. enter the browser main loop and report `gameplay` after the first frame.

The persistence restore in step 5 must finish before core initialization.

## Controller modes

The framework supports three policy modes:

- `disabled`: no discovery UI and no controller polling;
- `wasd-mouse`: standardized left-stick-to-WASD and right-stick-to-relative-look
  behavior for first-person engines;
- `custom`: adapter-owned bindings to native actions, keys, buttons, or mouse
  axes.

All console variants use `custom`. `controllerProfile(context)` returns a frozen
profile for the selected variant. The framework displays connection state and
polls the physical device. It passes immutable frames to
`controllerFrame(detail, context)` and reports selection/connectivity edges
through `controllerChanged(detail, context)`; the adapter writes
`detail.gamepad.axes` and `detail.gamepad.buttons` into the native host's
virtual pad. On disable, disconnect, blur, pause, or crash it releases every
held native action.

Normalized values must preserve:

- axes as floats in `[-1, 1]`;
- buttons as floats in `[0, 1]` plus a pressed flag;
- connection and disconnection changes;
- monotonic timestamps;
- up to four pads even though the first UI exposes one selected controller.

Do not bind by browser gamepad index. Indices may change on reconnect. Persist a
device fingerprint made from non-sensitive mapping information and let the user
confirm when multiple matching devices exist.

### Default console profiles

- NES: D-pad, B, A, Select, Start.
- SNES: D-pad, B, A, Y, X, L, R, Select, Start.
- PS1: DualShock D-pad, face buttons, shoulders, triggers, both sticks, stick
  clicks, Select, and Start.
- PS2: DualShock 2 layout with analog button values retained where the browser
  exposes them.

Keyboard fallback belongs to the same adapter profile. Arrow keys and WASD map
to the D-pad; the remaining bindings are documented in
`adapters/controller-profiles.mjs`.

## Persistence

Every variant declares `/persistent/{variant}` as its mount root. The framework namespaces
the backing IndexedDB store by application and variant. The native host receives
these paths:

```text
/persistent/{variant}/config
/persistent/{variant}/saves
/persistent/{variant}/states
/persistent/{variant}/screenshots
```

After a core changes SRAM or a memory card, call
`context.persistence.markDirty()`. Save-state creation and mapping/config
changes do the same. The framework performs debounced and periodic syncs and
tries a final flush on visibility change and page hide.

An adapter should expose `persistenceChanged(detail, context)` for diagnostics,
but must not create a second IDBFS mount or its own IndexedDB database.

## Resize and video

Core frame dimensions can change at runtime. NES and SNES may change overscan or
height; PS1 and PS2 may change video modes within one title. On each reported
geometry change:

1. resize the native backbuffer immediately;
2. call the framework resize path in the same animation frame;
3. preserve the configured 4:3 presentation without stretching;
4. keep integer/pixelated sampling for NES/SNES unless a later profile overrides
   it.

Do not wait for a window-resize debounce. Fullscreen exit must trigger the same
path immediately.

## Stop and crash

Before a controlled stop, pause the frame loop, commit core save RAM, await
`context.persistence.save({ force: true })`, then destroy audio and core state.
On a crash, report `crashed`, preserve logs, and attempt a forced persistence
flush without masking the original error.
