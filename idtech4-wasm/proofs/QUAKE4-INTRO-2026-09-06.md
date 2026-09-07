# Quake 4 intro gray polygons — 2026-09-06

Status: **faulty draw and wrong-buffer root cause identified**. A candidate SDK
repair passes the focused regression but is not integrated, browser-accepted
or deployed. RTCW SP is untouched and Blood remains deferred.

## Controlled Chrome comparison

The Chrome-control skill was used for the real Play button, native campaign
menus, physical console key presses, screenshots and visible DOM logs. No
synthetic held input, engine-global inspection or fabricated gameplay evidence.

The older readback candidate on `32875` also shows the large gray polygons in
the natural space intro. Its image is
`sha256:df094f94983cd04aee5125f0fc5e1ffe8fab4f044d85bd3ec03379d05354366f`;
JS is `cc6dc74541294bc8d65f26694466c4827e4a2ba760425e874d7e4bb76aa05e2f`,
Wasm is `621a9856013abb6eab614646e119dd81907272b4561ae4c6831d9a600edf4961`.
This predates the mip-size repair, so that change did not introduce this defect.

The native `g_stopTime 1` command freezes an exact dropship scene. The retained
`quake4-intro-old-*-2026-09-06.{json,jpg}` files show these comparisons:

| Temporary setting | Result in the frozen scene |
| --- | --- |
| `r_skipFogLights 1` | Byte-identical to gray baseline |
| `r_skipNewAmbient 1` | Byte-identical to gray baseline |
| `r_skipAmbient 1` | Gray and starfield removed; lit ships remain |
| `bse_render 0` | Some effects removed; gray remains |
| `r_skipDecals 1` | Gray removed; starfield and ships remain |
| `r_skipOverlays 1` | Byte-identical to gray baseline |
| Both decal and overlay skips | Byte-identical to decal-only skip |
| All rendering defaults restored | Byte-identical to original gray baseline |

Baseline JPEG SHA256:
`9c3326a48d8f261622eaa19e2bdf6f89b7a61f4743d9c67c8989df1e95c55629`.
Decal-only/both-skips JPEG SHA256:
`075bd0340d6dbfa2e21530940a13bcc0da4817afc95733ee89390f31c1e1494e`.

`r_skipSky` was also tried, but source declares rather than consumes it; its
unchanged screenshot is **not** a useful exclusion. Surface-info/primitives
debug toggles did not identify the offender and were restored. All temporary
settings were restored, including `g_stopTime 0`, and the natural intro resumed.
Native value queries and restoration screenshots are retained.

## Read-only observers

The test-only `tests/q4-intro-decal-diagnostic.patch` logs the first unique
decal materials while the native clock is frozen. It changes no render state.
The isolated image is
`sha256:2fd8241946869719aaae4f65c2ae72a274bcc379ca4e78f8cb557d7d32a8dc90`:

- `q4-intro-trace-proof-20260906`, localhost `32958`: native observer only.
- `q4-intro-draw-proof-20260906`, localhost `32959`: also captures the next
  actual WebGL draw, shader/uniforms, GPU indices/attributes and five pixels.
- `q4-intro-sequence-proof-20260906`, localhost `32960`: extends observation
  through up to 200 subsequent draws, stopping at the next color clear.

All three have a read-only root, temporary `/tmp`, and the owner's original
`/home/ted/wasm-game-data/quake4/q4base` mounted read-only. Diagnostic JS is
`87d340130f6c3ec1fe62c7440785e867a411d9d4852b7c55f8983cd9e40dbe4c`;
Wasm is `af5f59e3352b6f21ce7c21701cc8b385301b1d0087e8b652c2251964b0d9fda9`.
The GPU wrappers are separately mounted read-only and import an exact copy of
the ordinary worker. Their temporary buffer-query bindings are restored, and
queried GL errors remain retrievable by the engine.

The temporary native observer was removed from the prepared source and the
ordinary build relinked to the **exact** earlier border-size JS/Wasm hashes.
The canonical patch and ordinary artifacts remain unchanged. Diagnostic
artifacts are retained separately in `/tmp/q4-intro-trace.jb5f5P`.

## Observed draw state

The native observer identifies three ordinary one-stage decal materials:

- `models/characters/marine/decal_raven2_cine`: 11 vertices, 33 indices.
- `models/characters/bodies_parts/half2_bl_decal`: 34 vertices, 138 indices.
- `models/vehicles/marine_destroyer/md_lod0_decal1`: 60 vertices, 120 indices.

All have sort 2, no baked decal color cache, no new ambient shader, no texgen,
ignored vertex colors, white constant color, and stage state `0x133`.
Retail material definitions agree: `GL_DST_COLOR, GL_SRC_COLOR` blending.

The actual GPU traces on `32959` confirm those blend factors, blending enabled,
FUNC_ADD, LEQUAL, depth writes disabled, valid uint32 indices and stride-64
position/UV attributes. All preexisting/query/draw/after-query error lists are
empty. Border emulation is **disabled for these samplers**. The five sampled
pixels remain black before and after all three traced draws; these individual
draws therefore have **not** been shown to paint the gray region. The full
scene does show it. A later draw or another instance remains possible.

`r_useStateCaching 0` on `32958` does not remove the defect and was restored to
1. `r_useIndexBuffers` was already 0; reasserting 0 is not an independent test.
Decal skipping removes the gray again, but is a diagnostic, **not a fix**.

## Exact gray-producing draw and candidate regression

The `32960` sequence observer identifies draw **3**, immediately after the
decal draws, as the first retained draw that lifts background pixel `(142,105)`
from `[0,0,0,255]` to `[51,51,51,255]`. It is **not a decal**:

- Six uint16 triangle indices: the SDK's converted fullscreen quad.
- Identity modelview and a 0–1 orthographic projection.
- Constant color `[0.2,0.2,0.2,1]`, no texture, blending
  `ONE_MINUS_DST_COLOR, ONE`, depth/culling disabled.
- Position attribute: float4, stride **16**, reading the previous character's
  **2,176-byte model buffer**. Its first position is approximately
  `[3905.24,-9957.19,1666.78,0]`, followed by model normals interpreted as vertices.

This state matches `RB_STD_ForceAmbient`, which submits the four corners
`(0,0), (0,1), (1,1), (1,0)` via `glBegin(GL_QUADS)`. The linked SDK stores those
corners in its CPU stream, but `renderer.prepare()` instead selects the still-
bound application VBO. The resulting malformed quad explains the moving gray
polygon and why skipping a preceding decal changes it.

The bounded visible console retained complete records **2–21** and an end
marker after 21 draws; record 1 was truncated out. All 20 retained records have
empty error lists. Do not call this a complete-frame capture. All observer
clocks were restored and their browser tabs released to `about:blank`.

`tests/q4-immediate-buffer-transform.mjs` is a **candidate-only** repair of the
exact SDK `glEnd` seam: use the CPU temporary stream independently of the
application VBO, then restore the logical/physical binding and invalidate the
prepared-buffer cache in `finally`. The ordinary canonical transform is not
yet changed. `test-q4-immediate-buffer.mjs` executes the actual linked SDK
Begin/Vertex/End/layout/renderer/flush functions against a GPU-buffer recording
sink. Four bound-VBO failures reproduce in the old implementation; all six
candidate transitions preserve correct quad vertices, application attributes,
element binding and subsequent VBO pointers. Throwing-draw binding restoration
also passes. This is **not** a real-GPU or browser acceptance test of the repair.

The forced 0.2 floor is a separate follow-up: `RB_STD_ForceAmbient` infers a
failed ARB interaction path from invalid ARB programs even though this WebGL
port uses its working GLSL ES interaction program. Correcting the quad alone
may therefore reveal an unwanted full-screen brightness floor. Check the
actual GLSL route/availability rather than simply suppressing all brightness
settings or hiding the quad. That policy is not changed in this checkpoint.

## Checks and next boundary

```sh
node idtech4-wasm/scripts/test-q4-intro-package.mjs
node idtech4-wasm/scripts/test-q4-intro-sequence-package.mjs
node idtech4-wasm/scripts/test-q4-intro-evidence.mjs
node idtech4-wasm/scripts/test-q4-immediate-buffer.mjs
node idtech4-wasm/scripts/test-q4-border-size-package.mjs
node idtech4-wasm/scripts/test-q4-border-size-evidence.mjs
```

The package checks preserve 45 installed files for the native-only observer
and 44 for each worker observer, verify changed HTTP bytes and 32 owner files,
and recheck the restored ordinary source/build. The prior mip-size evidence
still passes without changing its strict sampling oracle.

Next: integrate and fresh-link the regression-tested SDK repair, cover the
WebGL GLSL-vs-ARB rescue-floor policy, and test an isolated candidate in Chrome
through the natural intro and first-person gameplay. Preserve explicit
`r_forceAmbient` behavior and non-WebGL behavior. Do not disable decals globally
or claim broad renderer acceptance from this isolation.
