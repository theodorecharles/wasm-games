# Blood and Duke Modernized scoped release — 2026-09-06

Selectable Classic/Modernized rendering, the accumulated Polymost repairs,
Duke save-name input and Blood's binding-slot diagnostic fix are installed
on the regular lab endpoints. Classic remains the default. This release does
not close wider gameplay/fidelity, held controls, capture/fullscreen or audio
listening acceptance. The user's Blood crash reproduction remains deferred.

## Exact deployment

| Service | Port | New immutable image |
| --- | --- | --- |
| Blood | 8007 | `sha256:db6c466f16e89fed82c5c53b6c3fdfa62864cbbd72aaf278a7252f9101b31512` |
| Duke3D | 18007 | `sha256:6f0fbb17a90525cdc288f750ba53e4ebd1abc69cba400809d91f9178cccd9af4` |

Both started at 2026-09-06 21:57:58 UTC. `wasm-game-lab/image-contracts.json`
pins these IDs while preserving framework 0.9.6 / `ebb1ebe` and locked variants.
`validate.sh --images` passed before and after tag handoff. Only
`docker compose -f compose.yaml up -d --no-deps blood duke3d` was used.
The old containers were replaced; their images and all data remain recoverable.

The [pre-swap inventory](build-modernized-release-before-2026-09-06.json) and
[post-swap package audit](build-modernized-release-package-2026-09-06.json)
verify **all 142 other containers unchanged**, the same mounts/ports for both
services, and **98 owner files unchanged**. No data migration or archive
packaging was performed. Docker's unordered mount list is normalized only for
comparison; every mount field remains checked and the original snapshot is
retained. The first post-swap audit rejected list ordering, not a changed mount.

## Build and package gates

The [four-module candidate checkpoint](BLOOD-MODERNIZED-2026-09-06.md) records
the native build, shader/native/adapter checks and initial save/reload evidence.
The exact current candidate passed [16 Chrome pairs](build-family-evidence-2026-09-06.json):
both games/profiles reached their first level and responded to W; Duke fired
48→47 in each profile; Blood's reloaded native binding script retained a valid
31-bit controls mask. These are actual user-input checks, not injected engine
state. Pointer lock was not established and is not claimed.

Canonical `scripts/build-images.sh` completed with `BUILD_WASM_SKIP_BUILD=1`,
`DOCKER_NAMESPACE=local`, `DOCKER_TAG=modernized-release-20260906` and the
audited framework base `local/wasm-game-framework:build-family-20260906`.
The native build was already completed; this command repeated web/static tests,
assembled suite/Blood/Duke locked images, HTTP-smoked all three, and tested the
optional password gate. Log: `/tmp/build-family-release-images-20260906.log`.

All 30 site/effective-shell files in each release image match the tested
candidate. Both live endpoints serve 24 checked byte-identical static assets;
all four Wasm modules validate. Both data-status endpoints report ready with
the correct locked variant. The framework base includes the existing local
runtime/bootstrap repairs, not merely the pinned upstream tree; its actual
served bytes are recorded in the candidate package proof.

## Live Chrome checks

The [live-origin evidence audit](build-modernized-release-evidence-2026-09-06.json)
passes **21 Chrome pairs / 44 hashed files**. The Chrome-control skill supplied
actual clicks and key taps; observations are screenshots and read-only
DOM-authored native diagnostics, with no engine-global or synthetic injection.

- Both launchers initially selected Classic. Actual Advanced settings selection
  starts Modernized at 1280×720 / mode 3 / 32 bpp; Classic starts at
  800×600 / mode 0 / 8 bpp. All four retain valid controls and restore owner
  data from the existing browser cache.
- Both Blood profiles reach E1M1 through New Game → The Way of All Flesh →
  Lightly Broiled. The room, cobwebs, pitchfork and HUD render. A real W tap
  changes position `(-14976,33280,-29360,0)` → `(-14800,33280,-35504,0)`.
  Both log playback of `blood03.ogg`; that is resource-start evidence, not
  an audible listening test. The Classic native cvar replay retains mask 31.
- Both Duke profiles reach Hollywood Holocaust through the native episode and
  difficulty menus. The skyline, fence, roof, pistol/hand and HUD render.
  W changes XY `(-31243,7160)` → `(-31206,7313)`. Left click visibly reduces
  Classic ammo **48→47** and Modernized ammo **48→46**. The latter consumed two
  rounds during the click; no one-round-per-click claim is made. Released
  native pointer bits are zero and the player view remains stable afterward.
- Both original Classic launcher selections were restored, and the owned test
  tab was navigated to `about:blank`. The first Blood return screenshot was
  captured before repaint although its DOM already selected Classic; the
  separate `blood-return-confirmed` pair proves the settled/reloaded selection.
  **No saves were created, overwritten or cleared.**

These live checks close profile availability/first-level startup and Duke
left-click delivery, not full campaigns or broader combat/fidelity. Native
menus were entered after clicking the canvas; keyboard-only initial focus is
not proved. Pointer lock/fullscreen remain unestablished, listening is open,
and the known SDK uniform/texture-cache diagnostics remain visible. The Blood
firing-crash loop was not resumed.

## Scoped rollback

The retained prior images are:

- `local/blood-wasm:before-modernized-20260906` →
  `sha256:ef1fe7905bb41c0bbf9ad805d58fc520e70a54a0fe9a85b8deb35a6d61bd2328`.
- `local/duke3d-wasm:before-modernized-20260906` →
  `sha256:8631a4e193cadf1eb16c4b5b5d8c3cb639dd605bcab109c7fd9dac5ea8788e90`.

To roll back these two services, retag the retained images to `blood-wasm:dev`
and `duke3d-wasm:dev`, set their two `imageId` fields in the lab contract to
the corresponding prior IDs, run `./validate.sh --images`, then recreate only
`blood duke3d` with `--no-deps`. Do not run a broad stop/start, delete owner
data, clear browser storage or overwrite browser saves. Previous isolated
origins and their test saves remain retained.

Recheck the release with `node build-wasm/scripts/test-modernized-release.mjs after`.
Recheck its frozen Chrome evidence with
`node build-wasm/scripts/test-modernized-release-evidence.mjs`.
The `before` command is a pre-swap gate, not a command to recapture historical
state after deployment. Frozen proof outputs use exclusive creation.
