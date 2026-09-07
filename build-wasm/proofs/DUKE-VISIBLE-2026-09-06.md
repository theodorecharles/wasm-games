# Duke GPU visible-renderer checkpoint — 2026-09-06

Historical 800×600 GPU checkpoint. The later
[selectable-profile checkpoint](DUKE-PROFILES-2026-09-06.md) adds actual
1280×720 Modernized selection and preserves this candidate as a baseline.

Status: **in progress, isolated only, not Modernized acceptance**. The native
Polymost menu, first-level textures, skyline/clouds, pistol and HUD are now
visible in Chrome without the draw observer. Real firing uses one round (48→47)
and Escape opens the native menu and resumes gameplay. The fixed 800×600 GPU probe is not the requested
selectable widescreen/Modernized profile. No live service changed; RTCW SP is
protected and Blood's pitchfork crash remains deferred at the user's request.

## Repairs and negative evidence

- Explicitly initialize texture matrices for units 0–4 with normal GL calls.
  The SDK's initial matrix versions prevented identity uniforms from being
  uploaded. Old textured draws have zero matrices; repaired textured menu
  draws have identity matrices. Color-only startup fade draws need no texture
  coordinates and still show unused zero uniforms; do not misclassify them.
- Use sized `GL_R8` internal storage for the indexed atlas and palette-swap
  texture in browser builds. Chrome rejected unsized `GL_RED` allocations
  at 8192² and 2048² with `INVALID_VALUE`; subsequent updates had no storage.
  The R8 build displays the native menu and level. This is actual Polymost
  mode 3 / 32 bpp, not a fallback to the deployed Classic renderer.
- Convert BGRA pixels to RGBA bytes at `Polymost_SendTexToDriver`, preserving
  the caller's buffer for mip generation. WebGL rejects the desktop packed
  type `GL_UNSIGNED_INT_8_8_8_8_REV`. Both allocation and updates now use
  `GL_RGBA` / `GL_UNSIGNED_BYTE`. Existing RGBA and null allocations work;
  native non-browser upload behavior is unchanged. The invalid upload logs
  disappear, **but this alone does not restore the sky**.
- Guard desktop perspective-correction and fog hints outside browser builds.
  The precise hint observer records `INVALID_ENUM` for targets 3152 and 3156;
  the guarded menu trace has neither driver nor pending errors. This does not
  disable fog: fog functions and shader calculations remain present.
- Use an infinite-far browser projection. The native matrix has far depth 8,
  but the flat sky at width 800 has depth about 12.2. Desktop depth clamping
  prevents clipping; WebGL has no equivalent capability here. Keeping the
  near plane and taking the infinite-far limit restores the skyline in the
  actual observer-free Chrome game. It does not disable sky rendering or fog.
  The earlier 24-draw trace records ordinary early world draws, not necessarily
  sky polygons; the matrix/source calculation and negative/positive GPU
  readbacks establish the clipping problem independently.

The optional compiled draw observer consumes GL error flags. Its captures
are diagnostics, not gameplay acceptance. The final candidate described below
does not include that observer. Browser work uses the existing Chrome-control
connection, real UI input, DOM-authored logs/telemetry and screenshots; no
engine globals, synthetic input or browser-security bypasses are used.

## Retained observations

| Port | Candidate | Observation |
| --- | --- | --- |
| 32972 | Matrix repair | Correct textured matrices; exact unsized RED failures; black menu |
| 32973 | R8 repair | Visible GPU menu/world; actual shot changes ammo 48→47; packed BGRA failures |
| 32974 | RGBA repair | Upload failures gone; visible level; sky still black |
| 32975 | Hint attribution | Exact unsupported perspective/fog hint errors |
| 32976 | Broad world trace | World uniforms; oversized log loses early draws, not a complete draw history |
| 32977 | Hint guards | Visible menu without observed driver/pending errors |
| 32978 | Reduced sky trace | Bounded early-world trace, same native Wasm as 32977 |
| 32979 | No draw observer | Visible menu/world; black-sky baseline; real firing 48→47 and native Escape menu |
| 32980 | Infinite-far projection, no draw observer | Skyline restored; actual firing 48→47; native Escape menu and resume |

[Evidence audit](duke-polymost-visible-evidence-2026-09-06.json) validates
20 additional Chrome screenshot/DOM pairs and 56 artifact hashes, including
the old failures. Together with the earlier checkpoint this retains 33 pairs.
It explicitly keeps `modernizedAccepted: false`. Ammo and visible-scene
observations are human-readable screenshot checks, not inferred from fixture
success or an automated pixel-recognition claim.

Each `duke-polymost-*-package-2026-09-06.json` verifies exact installed and HTTP
JS/Wasm identity, read-only root/data mount, localhost binding, and all 21 site
files. Only Duke JS/Wasm differ from live; the other 19 files are identical.
The original Classic-only launcher text is intentionally still present in
these isolated native-engine probes; it is not profile integration.

Current no-draw-observer candidate: `duke-polymost-projection-proof-20260906`,
port 32980, image
`sha256:b66800ee76a5719c52c3854d7736c3ea549c93b480984b08c1fd01d9e3fdbb59`.
Its JS is `4b2400b50a496376fcbb49f9f70502da7a4e6f353df7c8e3ef5ed8a9c6822287`;
Wasm is `07fe9ed264b24ee095d620945cae3bea9eea633d9812178aef65ec6a22b9b2f5`.
The [clean package audit](duke-polymost-projection-clean-package-2026-09-06.json)
also asserts that the served JS has no draw-observer markers. The retained
32979 baseline has identical JS but pre-projection Wasm, visibly black sky,
real firing 48→47 and the native pause menu.
The installed Classic Duke and approved RTCW SP identities remain unchanged.

## Regression checks

`test-polymost-textures.mjs` extracts the actual production upload functions
and executes them in real GLES 3 contexts under ASan/UBSan. Forty checks cover
RGBA/BGRA allocation and subimage update at four mip sizes, allocation flags
1/3, alpha/channel/row order, unchanged source buffers, null data, atlas-edge
updates at 8²/2048²/8192², and palette-swap rows/black border. Each driver also
rejects four negative variants: old packed types, missing channel swap, lost
alpha, and unsized indexed storage. The last includes an explicit WebGL
format assertion because desktop GLES drivers may accept unsized RED.

- [AMD pixel readback](duke-polymost-textures-amd-2026-09-06.json)
- [llvmpipe pixel readback](duke-polymost-textures-software-2026-09-06.json)
- [Exact canonical source](duke-polymost-visible-source-2026-09-06.json):
  1,702 files at pin `f8639031546ccea8964c2d63c9d09944c8a4a67c`, patched tree
  `09872a4d092b3b9c067dc3f50c59ebe9083f7684`, idempotent preparation and
  developer-note preservation checked. Matrix patch includes the later fog
  hint guard; earlier pixel proofs predate that guard but test identical
  extracted upload functions.
- [Projection source](duke-polymost-projection-source-2026-09-06.json):
  current patched tree `be3928e4811d25ff9ad81757e6bfd5f8f5f85d08`.
- Projection readback on [AMD](duke-polymost-projection-amd-2026-09-06.json)
  and [llvmpipe](duke-polymost-projection-software-2026-09-06.json): 27 checks
  per driver using the exact production matrix, viewport-dependent sky depth,
  near/behind-camera rejection, and distances up to 1024. The old matrix
  fails at depth 8.1. These are GPU clipping fixtures, not browser gameplay.

```sh
node build-wasm/scripts/test-source.mjs
node build-wasm/scripts/test-polymost-textures.mjs
LIBGL_ALWAYS_SOFTWARE=1 node build-wasm/scripts/test-polymost-textures.mjs
node build-wasm/scripts/test-polymost-projection.mjs
LIBGL_ALWAYS_SOFTWARE=1 node build-wasm/scripts/test-polymost-projection.mjs
node build-wasm/scripts/test-polymost-glsl.mjs
node build-wasm/scripts/test-polymost-fog-loader.mjs
node build-wasm/scripts/test-variant-adapters.js
node build-wasm/scripts/verify-site-contract.js
node build-wasm/scripts/test-duke-visible-evidence.mjs
```

## Remaining acceptance

Review transparency/alpha-test semantics and sprite fidelity as well as
sky mapping across more viewpoints. Implement
the actual selectable widescreen GPU profile, and complete pitch/yaw,
pointer capture, movement, sound listening, and save/full-reload checks.
Existing startup fixes and negative evidence are in the
[earlier checkpoint](DUKE-POLYMOST-2026-09-06.md).

All build and test jobs for this checkpoint completed. The owned Chrome tab
is on 32980 in the actual first-level game after pause/resume, with ammo 47.
No save was created or overwritten in this renderer investigation.
