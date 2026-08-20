# Build Engine WASM family runbook

This is the canonical downstream family for native-source Blood and Duke Nukem
3D browser builds. Do not add required game data or generated WebAssembly
artifacts to Git, and do not contact upstream projects as part of a release.

| Title | Status |
| --- | --- |
| Blood | Still in development |
| Duke Nukem 3D | Still in development |

## Architecture

```text
wasm-game-framework 0.9.4 canonical document/server/PWA and persistence layer
        |
Build family config + variant adapter dispatch
        |
container /data -> exact validation -> browser IndexedDB
        |
bounded read-only preservePaths MEMFS mount at /game
        |
native NBlood or EDuke32 + Build software renderer + SDL2/Web Audio
```

The downstream owns no HTML, CSS, service worker, or web manifest. Fullscreen
preference, launcher state, input capture, PWA metadata,
and provisioning are framework contracts. Blood persists under
`/home/web_user/.config/nblood`; Duke persists under
`/home/web_user/.config/eduke32`. Each adapter attaches the framework's IDBFS
manager before `callMain`, asks native code to write configuration before a
flush, and lets the framework handle debounce, periodic save, page hide, and
hard reload restoration.

Set `WASM_GAME_PASSWORD` on a container to require the framework launch-card
password gate. Leave it unset for the normal open launcher. The same framework
session cookie protects provisioning and runtime endpoints.

Controller support is currently disabled for both variants.

Duke's browser front end draws the native menu cooperatively instead of
entering the desktop blocking attract loop. Native menu choices still launch
the normal game path; attract demos are not played in the browser profile.

## Verification

```bash
WASM_FRAMEWORK_DIR=/path/to/wasm-game-framework EMSDK_DIR=/path/to/emsdk \
  ./scripts/test-web.sh
WASM_FRAMEWORK_DIR=/path/to/wasm-game-framework ./scripts/test-static.sh
WASM_FRAMEWORK_DIR=/path/to/wasm-game-framework EMSDK_DIR=/path/to/emsdk \
  ./scripts/build-images.sh
```

These checks cover both native builds, JavaScript and WASM validation, family
dispatch, exact manifests, source-derived icon sizes, immutable framework
identity, forbidden downstream shell files, public-data leakage, server gates,
image contents, and HTTP behavior of all three images.

## Manual browser checklist

Chrome is serialized across project lanes. Do not start it without an explicit
grant.

Once granted, test each variant with the required data files:

1. Empty `/data` shows provisioning and disables launch.
2. Complete exact data makes the selected title ready without exposing `/data`.
3. Launch renders a contained 4:3 800×600 native menu.
4. Gameplay verifies WASD, horizontal turn, classic mouse-Y movement, firing,
   use, jump/crouch as applicable, Escape, capture loss, and return to play.
5. Verify non-silent SDL/Web Audio; Blood's native
   menu/gameplay/paused/debrief/loading state and New Game capture; and Duke's
   native menu/gameplay/paused state.
6. Hard refresh and confirm required files restore from IndexedDB without another
   gated container transfer.
7. Change settings, save, reload, and verify IDBFS persistence.
8. Verify remembered Launch fullscreen behavior in suite and locked images.

## Known blocker

Polymost/WebGL is intentionally absent from the declarative profiles. Isolated
WebGL 2/ES3 compile probes link for both titles, but profile-driven renderer
selection, dynamic resizing, and browser renderer/aspect/input/context-loss
checks are not complete. A modern profile must not be claimed before that work.
