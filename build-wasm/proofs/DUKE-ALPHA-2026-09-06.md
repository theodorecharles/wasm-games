# Duke custom-shader alpha testing — 2026-09-06

Status: **fixed in canonical source and isolated 32985, not deployed or full
Modernized acceptance**. The custom Polymost shaders now implement the alpha
test before color/depth writes. Production GLES tests prove rejected fragments
leave both buffers alone; Chrome retains the visible world and working input.
A separate native save-name text-input failure was reproduced here; the newer
[text-input checkpoint](DUKE-TEXT-INPUT-2026-09-06.md) fixes it and verifies
named save/reload/load in both profiles. This document retains the 32985 baseline.

This follows the [NPOT/palette checkpoint](DUKE-NPOT-2026-09-06.md). Its 32984
package remains intact as the pre-alpha baseline.

## Correction

The native renderer enables/disables `GL_ALPHA_TEST` and sets a comparison and
reference value. Desktop GL applies that test after the custom fragment shader.
The SDK's compatibility renderer generates it only in its own fixed-function
shaders; the application's Polymost shader did not discard rejected fragments.
The [Khronos alpha-test reference](https://raw.githubusercontent.com/KhronosGroup/OpenGL-Refpages/main/gl2.1/glAlphaFunc.xml)
specifies all eight comparisons, disabled/default behavior and reference
clamping; rejected fragments must not update the framebuffer.

- The application-owned ESSL translator wraps the basic/extended Polymost
  fragment entry point and applies the test to its final alpha. Disabled mode
  and ALWAYS accept every fragment, including alpha zero; the other seven
  comparisons retain their distinct semantics. This is not an unconditional
  transparent-pixel discard or a blending workaround.
- The canonical browser-only `glbuild.cpp` patch synchronizes the shader
  uniforms after native alpha-function, enable/disable and program-bind calls.
  The helper reads the SDK's actual compatibility state instead of inventing
  new defaults when native state accounting is reset. It clamps the reference
  to [0,1], skips programs without these uniforms, and caches locations by
  program object identity, not reusable integer handle. Unchanged values do
  not trigger repeated uploads.
- No SDK/WebGL method is replaced. No source pin, game artwork, native desktop
  alpha behavior or browser security setting is changed. The isolated build
  includes no draw observer.

## Verification

`test-polymost-alpha.mjs` uses the **production translated basic and extended
shader pairs**, real GLES 3 draws and readback. Each shader runs 3,840 cases:
all eight comparisons, enabled/disabled, six reference inputs, five vertex
alpha values, blending on/off, and four source paths (color-only, RGBA texture
alpha multiplied by vertex alpha, ordinary R8 indexed art, transparent index
255). Each case checks color, then draws a farther opaque surface to verify
whether depth was preserved or written. This distinguishes a discarded
fragment from a merely transparent fragment that still occludes geometry.

- [AMD](duke-alpha-full-amd-2026-09-06.json) and
  [llvmpipe](duke-alpha-full-software-2026-09-06.json) each pass **7,680 color
  checks and 7,680 depth checks** across both shaders. Removing the discard
  independently fails color and depth controls for both shaders on each driver.
  The earlier 960-case-per-shader color-only results are retained separately;
  the `full-*` records are the expanded current tests.
- [343 native/SDK state checks](duke-alpha-full-state-2026-09-06.json) compile
  the actual extracted native wrappers/reset into Wasm with the actual SDK
  compatibility implementation, SAFE_HEAP and undefined-behavior checks.
  The WebGL sink records uploads rather than rasterizing; it checks defaults,
  all functions/reference clamps, enable/disable, program switching, accounting
  reset, redundant updates, no-program/missing-uniform paths and recycled
  integer handles. Removing native synchronization fails the old-code control.
  GPU behavior is proved by the separate real GLES test above.
- Basic/extended shader compilation and the 39,960-pixel NPOT/palette suite
  pass again on both drivers. Existing adapter, family and manifest contracts,
  generated JS syntax, Wasm validation and whitespace checks pass.
- [Canonical source audit](duke-alpha-source-2026-09-06.json): 1,702 files match
  the unchanged pin plus patches, tree
  `183c701edf49365087e6ad217f050819d83304da`. Preparation is idempotent and
  preserves developer notes. The isolated target was rebuilt; the full family
  packaging build was not rerun.

## Actual Chrome observations

The Chrome-control skill supplied actual clicks, keyboard taps, screenshots
and DOM-authored native telemetry through the existing connection. No engine
globals or synthetic events were used. The [evidence audit](duke-alpha-evidence-2026-09-06.json)
retains **12 new Chrome pairs / 29 hashes**.

1. Main menu, E1L1 rooftop, skyline, fence, complete pistol/hand and HUD render
   at native mode 3 / 32 bpp / 1280×720. Three clicks reduce visible ammo
   **48→47→46→45**. Moving down changes native pitch **113→40**, then moving
   right changes yaw **422→637**, with player position unchanged.
2. A real W tap reaches native scan 17 and moves player XY from
   `(-31243,7160)` to `(-31324,7308)` without changing Z/yaw/pitch. This is
   short-tap movement proof, not held-control or pointer-lock acceptance.
3. Escape opens native pause menu 50. Save Game opens menu 350 with readable
   labels and a current-view preview. A real T tap reports `KeyT:up`, scan 20,
   but **no letter appears in the name field**. Escape cancels the unconfirmed
   slot, returns through pause, then resumes at the same native position/view.
   The final world screenshot is byte-identical to the pre-menu movement
   screenshot. No save was confirmed or overwritten.

Useful images: [world](duke-alpha-world-2026-09-06.jpg),
[lower view](duke-alpha-low-view-2026-09-06.jpg),
[turned view](duke-alpha-side-view-2026-09-06.jpg),
[forward tap](duke-alpha-forward-tap-2026-09-06.jpg),
[save preview](duke-alpha-save-preview-2026-09-06.jpg),
[missing typed letter](duke-alpha-save-letter-2026-09-06.jpg).

Initial camera pitch differs from 32984, so these are not before/after pixel
parity images. The fixture establishes the alpha defect and correction; the
Chrome views establish integration and bounded gameplay, not complete sprite
or menu-shading fidelity. Existing unused-uniform `-1` warnings remain.

## Package and next work

Container `duke-polymost-profiles-alpha-proof-20260906`, localhost **32985**:
ID `78ed9074492f1825fbcd5ade88eb9d324a121b7bba9a833418440320e044fce8`,
image `sha256:f9abfa3e2b8f5290df469cb0c5fa98f88147940f8882f48e864b9e8197fb3dc2`,
started `2026-09-06T20:28:26.061605435Z`.

The [package audit](duke-alpha-package-2026-09-06.json) verifies all 23 site
files, six HTTP asset hashes, localhost binding and read-only root/owner data.
Relative to 32984 only the Modernized JS and Wasm change; Classic, Blood,
adapter, manifest and shared shell are unchanged. Live identities and the
previous isolated packages are retained; no service was stopped or replaced.

Next: fix native save-name text delivery, then verify named save/full reload/
load. The adapter currently stops key propagation and cancels unmodified
non-gameplay keys, while `Build_WasmKeyEvent` supplies scan state only; native
SDL text goes through `OSD_HandleChar`/`keyBufferInsert`. This is the identified
input boundary to investigate, not a proven one-line fix. Preserve quick-tap
menu/gameplay handling and test editing/confirmation keys as well as letters.
After that, advance the still-missing Blood Modernized profile without
reopening the user's deferred crash investigation.

Wider gameplay/fidelity, held controls, normal capture/fullscreen, listening
and promotion remain open. All build/test processes from this pass finished.
The owned tab remains in first-level gameplay on 32985; changes are uncommitted.
