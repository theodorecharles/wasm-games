# Quake 4 screenshot/save-preview readback — 2026-09-05

Status: browser-only readback repair built; exact patch reconstruction and full
staging pass. Real-GPU negative/positive regression passes. Chrome verifies a
correct new-save thumbnail, its persistence across page reload, and native save
restore to the first-person world. Pointer capture remains separately open.

## Cause and scope

Chrome's retained capture candidate shows a white/striped thumbnail for the
existing Quicksave1. The save itself restores first-person gameplay. F5 on that
same image writes Quicksave2 for a fresh negative control.
That [fresh selected preview](quake4-readback-legacy-fresh-chrome-2026-09-05.jpg)
is also striped/corrupt; the [browser record](quake4-readback-legacy-chrome-2026-09-05.json)
retains the save/restore events and old-image identity.

`CaptureRenderToFile` and `R_ReadTiledPixels` request `GL_RGB/GL_UNSIGNED_BYTE`
directly. The shipped Emscripten bridge forwards that pair to WebGL unchanged.
RGBA/unsigned-byte is the portable normalized-color readback pair; RGB is not
guaranteed. See the [WebGL readback specification](https://registry.khronos.org/webgl/specs/latest/1.0/index.html)
and [WebGL 2 additions](https://registry.khronos.org/webgl/specs/latest/2.0/).
The actual GLES driver rejects the production RGB calls with
`GL_INVALID_OPERATION`, leaving the destination unfilled.

The browser branches now read tightly packed RGBA8. The save-preview path
preserves opaque alpha and the existing TGA orientation; tiled screenshots
explicitly strip alpha into the caller's RGB layout, including partial tiles.
The shared helper saves/restores pack alignment, row length, pixel/row skips,
and pixel-pack buffer binding. No filtering, resolution or rendering-quality
setting is reduced.

Desktop and Vulkan retain their existing RGB code. This matters because the
native Vulkan readback shim currently accepts RGB only. No game-module ABI,
save format, adapter or worker changes are made by this repair.
The regression also compares both preprocessed non-browser functions against
the pinned native source and requires identical code, beyond the desktop GPU
smoke cases.

## Tests and build

- [Legacy production functions](quake4-readback-legacy-2026-09-05.json): all
  60 GLES cases fail with invalid readback. Three supported desktop cases pass.
- [Repaired production functions](quake4-readback-native-2026-09-05.json): all
  60 GLES and the same three desktop cases pass. The fixture compiles exact
  capture/tiled functions, uses actual EGL/GLES or desktop GL, supplies a known
  scene and records pixels passed to the TGA writer. It does not encode a save
  file or execute the complete engine. Cases include 320×240 previews, thin/odd
  cropped widths, multi-tile session/view captures, pack alignments 1/2/4/8,
  non-default row/skips, PBO binding, alpha, orientation and memory guards.
- The gate runs from `stage-site.sh`. Four exact patch trees and complete
  staging pass, including all prior shader, lighting, depth, border-runtime,
  image-package, adapter, worker and device gates.

Run the new GPU regression on a host with EGL/GLES and desktop GL development
libraries:

```sh
node idtech4-wasm/scripts/test-q4-readback.mjs
```

Canonical patch SHA-256:
`8139dae66aad534ab51bc2652a1df4998db9742dda140e962c7e7efa2efc987e`.
Rebuilt Wasm SHA-256:
`621a9856013abb6eab614646e119dd81907272b4561ae4c6831d9a600edf4961`.
The loader JS, SP/MP modules, adapter and worker remain unchanged.
The [packaged identity record](quake4-readback-build-2026-09-05.json) identifies
image `sha256:df094f94983cd04aee5125f0fc5e1ffe8fab4f044d85bd3ec03379d05354366f`
(`local/idtech4-wasm:quake4-readback-candidate`) and verifies all six artifacts
against the staged outputs.

The preceding capture image is retained. Only the owned isolated service may
be replaced for Chrome proof; live services, RTCW and owner PK4 files are not
changed. Blood remains deferred at the user's request.

## Chrome acceptance

The [browser record](quake4-readback-chrome-2026-09-05.json) retains app-authored
DOM proof from both page loads, with no worker errors:

- On the repaired image, Quicksave2 restores at `313103.4` ms. Its existing
  corrupt thumbnail remains unchanged, as expected; this repair does not
  regenerate previously written preview files.
- F5 writes Quicksave3 at `423777.1` ms. Selecting it in native Load Game shows
  an [upright world/sky/pistol/HUD preview](quake4-readback-chrome-2026-09-05.jpg),
  dated 12:12pm, with no stripes.
- A complete page reload retains all four save-list entries. Selecting the
  latest row again shows the [same correct thumbnail](quake4-readback-reload-preview-2026-09-05.jpg).
  The native material log identifies `savegames/quicksave3` at `478678.7` ms.
- Native Load Game logs save initialization at `508266.3` ms and reports
  gameplay at `533366.5` ms. The [restored world](quake4-readback-reload-world-2026-09-05.jpg)
  contains the terrain, walls, sky, smoke, pistol and health-72 HUD.
- Escape leaves the isolated tab paused at `564989.6` ms, with native
  `resumeAvailable:true`. Pointer-lock and sustained-control acceptance are
  not claimed by this readback check.

The complete engine's new save and cross-reload restore complement the smaller
GPU fixture's pixel/orientation/pack-state assertions. Broader campaign, input,
performance and multiplayer acceptance remain open.
