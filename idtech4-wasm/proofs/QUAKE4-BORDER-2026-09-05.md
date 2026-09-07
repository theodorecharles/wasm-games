# Quake 4 border-sampling checkpoint — 2026-09-05

Status: Chrome control is working again. The initial border candidate reproduced
a startup failure on shipped GLSL 130 shaders. A separate rebuilt candidate fixes
that dialect, sampler-parameter forwarding, constant MRT outputs and the SDK's
normal-matrix handling. All 33 shipped shader pairs now compile/link through the
packaged path. Chrome now completes a fresh intro into a visible first-person
world with sky and weapon/HUD, and native pause/resume works. Mouse capture
fails and remains open. **Not fully campaign accepted or deployed.**
Quality/performance and wider control checks remain open. The Chrome-verified
split-buffer sky candidate is retained unchanged. Earlier checkpoints below are
historical; the latest section records the shader-startup repair.

## Required semantics

`src/renderer/OpenGL/gl_Image.cpp` requests opaque black for `TR_CLAMP_TO_ZERO`
and transparent black for `TR_CLAMP_TO_ZERO_ALPHA`, then uses
`GL_CLAMP_TO_BORDER` on both texture axes. The actual campaign previously
reported WebGL error 1280 for these unsupported calls. A new texture's unchanged
default repeat mode is a plausible result of rejected wrap requests, not a
fresh Chrome-state observation in this checkpoint.

The sampler must preserve edge blending, minification and the engine's filtering
controls, not just remove invalid-enum messages. The
[OpenGL specification](https://registry.khronos.org/OpenGL/specs/gl/glspec46.core.pdf)
provides the border/mipmap reference. Actual desktop GPU samples, not a CPU
reimplementation, are the oracle below.

## Tests and evidence

Run from the repository root:

```sh
node idtech4-wasm/scripts/test-q4-border-sampling.mjs
```

`tests/gl-border-sampling.c` creates desktop GL and GLES 3 contexts on the
AMD Radeon 890M / Mesa 26.1.6 driver. Each case samples 121 UV locations around
edges, corners and interiors. The matrix covers 8x8, 16x4, 7x5 and 1x8 textures,
both border alphas, nearest/linear/trilinear filtering, fractional and clamped
LODs, six gradient footprints, implicit derivatives and projected coordinates.
RGBA8 edge colors and mip contents deliberately differ, so incorrect substitutes
cannot pass because every texture happens to have a black edge.

Three negative controls are compared to native `GL_CLAMP_TO_BORDER`:

- Repeat differs in all 128 current cases (maximum channel error 241/255).
- Edge substitution differs in all 128 (maximum 228/255).
- An abrupt outside-UV cutoff differs in 120/128 (maximum 171/255).

The initial test-only sampler (now promoted to prepared source
`tools/build/emscripten_border_sampler.glsl`) fetches texels with explicit border
values and preserves bilinear/trilinear weights and mip dimensions. It matches
all 128 desktop cases within one channel value. The same GLSL equations then
run in an actual GLES 3 context and match all 128 saved desktop reference images
within the same tolerance. No desktop border enum is submitted by the GLES
candidate. The test asserts case counts, mode/shape/alpha coverage and exact
cross-context case indexing.

The [current GLES record](quake4-border-gles-2026-09-05.json) contains those
results and source identities. Earlier matrices are retained as development
evidence, not additional independent acceptance:

- [Initial negative reference](quake4-border-reference-2026-09-05.json): 64 cases
  for each of the three substitutes, before the prototype existed.
- [Explicit-LOD prototype](quake4-border-isotropic-2026-09-05.json): 64 prototype
  comparisons on desktop GL.
- [Explicit gradients](quake4-border-gradients-2026-09-05.json): 112 prototype
  comparisons on desktop GL.

## Initial anisotropic gap

The initial isotropic-only prototype was tested with an 8x sampler setting:

```sh
Q4_BORDER_ANISOTROPY=8 node idtech4-wasm/scripts/test-q4-border-sampling.mjs
```

At that checkpoint it exited 1: **30/128 prototype cases differed**, both on desktop GL and
GLES 3, with maximum error 178/255. The driver confirms support for the requested
setting; the fixture retains it on mip-filtered textures instead of disabling
it. Differences include wide anisotropic footprints, implicit derivatives and
projected coordinates. See the
[negative anisotropic record](quake4-border-anisotropic-legacy-2026-09-05.json).
Here “legacy” means the isotropic-only prototype before an anisotropic repair;
it does not mean this prototype is installed in the old or current engine.

`Q4_BORDER_PROOF=/absolute/path.json` saves the complete record before the final
acceptance assertion, including expected failures. The default passing run is
isotropic evidence only and is deliberately not a production staging gate yet.

The subsequent work below implements a genuine anisotropic kernel. Remaining
work must cover texture formats and
actual sampler state/texture lifetime, generated fixed-function shader consumers
and material/projected-light shaders before production integration. Do not ship
an edge alias, disable anisotropy, or treat these synthetic tests as campaign
acceptance. After integration, rebuild and run existing image, lighting, vertex,
shader and package regressions, followed by the retained scene in Chrome when
extension control is available again. Blood remains deferred; RTCW is untouched.

## Multi-tap anisotropic kernel and shader conversion

The [anisotropic extension specification](https://registry.khronos.org/OpenGL/extensions/EXT/EXT_texture_filter_anisotropic.txt)
explicitly leaves the kernel implementation dependent. Its example chooses
multiple samples along the larger derivative and adjusts the selected mip level.
The prototype now implements this approach, with the engine's integer 1–16 tap
limit and the ordinary isotropic path for magnification. The engine's current
default is 16, not 8; the earlier 8x run was a diagnostic setting only.

Two comparisons are retained separately:

- Border correctness: a separately expressed desktop shader uses native
  `GL_CLAMP_TO_BORDER` for every sample at the same footprint locations. The
  GLES candidate uses its explicit border texels and filtering at those locations.
- Vendor rendering: differences from the driver's built-in anisotropic kernel
  remain reported and are **not** relabeled as exact visual parity. At 8x and
  16x, 30 cases still differ from that vendor kernel, with maximum channel error
  40/255, versus 178/255 for the isotropic-only control. Campaign image quality
  remains to be assessed; the former failure records are preserved.

The [anisotropy matrix](quake4-border-anisotropic-matrix-2026-09-05.json) covers
every integer setting 1 through 16: 2,048 desktop and 2,048 GLES comparisons
pass the same-footprint border oracle within one channel value. Each setting
retains 128 cases of edge/corner/interior, size, alpha, mip and gradient coverage.
The GLES half now runs shader-converted `texture`, `textureProj`, `textureLod`
and `textureGrad` calls with enabled per-sampler metadata, rather than invoking
the low-level helper directly. The isotropic-only control still fails anisotropic
footprints, ensuring the new gate does not merely accept disabled filtering.

```sh
node idtech4-wasm/scripts/test-q4-border-matrix.mjs
```

The test-only source converter upgrades legacy shader interfaces to GLSL ES 3,
preserves cube sampling and matrix expressions, and attaches separate metadata
to each 2D sampler (including constant-index arrays). Non-border samples retain
native texture calls. Unsupported macro lookups, bias overloads, unresolved
sampler arguments, legacy MRT output and vertex-stage 2D sampling fail explicitly;
they are not silently assigned edge/repeat behavior. Those forms need expansion
if encountered in the actual engine shader inventory before integration.

Verification with the conversion enabled:

- Actual linked material program and seven targeted syntax cases compile/link;
  see the [shader conversion record](quake4-border-shaders-2026-09-05.json).
- All 24 exact SDK-generated shader variants compile/link; see the
  [generated shader record](quake4-border-legacy-shaders-2026-09-05.json).
- All 128 shipped-material lighting comparisons pass with border metadata
  disabled, preserving existing lighting equations; see the
  [lighting record](quake4-border-lighting-2026-09-05.json).
- All 20 synthetic depth tests and 32 captured-triangle comparisons preserve
  depth equality and reject perturbed-depth controls; see the
  [depth record](quake4-border-depth-2026-09-05.json). Some captured triangles
  have no visible pixels; this is not a new full-scene render.

Those historical tests used `Q4_BORDER_SHADER_TRANSFORM=1` against pre-integration
artifacts. Do not set it with the new package: the ordinary submission path now
performs conversion, and the fixtures reject a second conversion. At that older
checkpoint the production patch/artifacts were unchanged. Integration follows.

## Integrated build and package

`openq4-browser.patch` now includes the sampler GLSL, shader converter and cached
runtime under `tools/build/emscripten_border_*`. The SDK transform routes shader,
program, texture, integer-uniform and draw operations through a per-context
runtime without changing live browser context methods. Meson explicitly depends
on all three component files, so their edits cause an engine relink.

The actual image layer supplies filter/mip/anisotropy and post-format border
colors. Both zero-repeat modes use valid hardware edge wrap plus explicit border
texel filtering in shaders; they are not edge aliases. Ordinary repeat/clamp
disables that metadata. Format expansion preserves opaque RGB/luminance borders,
zero-alpha intensity/normal borders and white-RGB alpha-coverage borders. No
graphics cvar or existing anisotropy setting was lowered. Unsupported non-2D
border requests, sampler-object overrides and unhandled shader forms fail
explicitly; broader renderer/custom-shader coverage still needs checking.

Current passing evidence:

- [91 actual linked-engine image/sampler/framebuffer cases](quake4-border-integrated-images-2026-09-05.json),
  including 36 border-format cases, 18 filter/mip/limit cases, repeat reset,
  refreshed anisotropy, unchanged-draw caching and purge/recreation.
- [Six native API-path cases](quake4-border-integrated-api-2026-09-05.json): actual
  GLEW/SDK shader conversion, sampler-unit reassignment, texture binding/deletion,
  DrawArrays and the indexed-draw bridge reach a recording submission sink.
- [26 runtime state/lifetime cases](quake4-border-runtime-2026-09-05.json) and
  [40 desktop GL format/swizzle cases](quake4-border-formats-2026-09-05.json).
  The latter retains the native compatibility ALPHA8 interior-coverage defect
  as an observation; the working browser upload conversion does not copy it.
- [All 16 anisotropy settings](quake4-border-integrated-matrix-2026-09-05.json):
  4,096 desktop/GLES comparisons pass within one channel value. GLES receives
  the exact packaged shader conversion, checked against the source components.
  UVs/metadata are synthetic, and vendor-kernel differences remain disclosed.
- [24 generated shader pairs](quake4-border-integrated-legacy-shaders-2026-09-05.json),
  [128 unchanged-lighting comparisons](quake4-border-integrated-lighting-2026-09-05.json),
  and [20 synthetic plus 32 captured-triangle depth cases](quake4-border-integrated-depth-2026-09-05.json)
  pass with the integrated package. Lighting/depth checks use disabled border
  metadata; they protect the existing shader equations, not campaign borders.
- Ten vertex-cache and seven split-buffer cases still pass. Native audio,
  Continue, shadows, device enumeration, exceptions and keyboard checks pass.
  All four exact patch trees and the full site staging/package checks pass.

Normal build/staging now gates native sampler cases, packaged SDK routing,
depth equality, runtime state and the isotropic GPU border oracle. Run the full
anisotropy matrix separately with `node idtech4-wasm/scripts/test-q4-border-matrix.mjs`.

The [build identity record](quake4-border-integrated-build-2026-09-05.json) includes
all prepared-source and packaged hashes. Candidate:
`local/idtech4-wasm:quake4-border-candidate`, image
`sha256:6de09954693415f068e94181b0068f64f07e5596fe8b5757909bce7eb6ddcc38`.
Its application has not been started. Image contents match the staged JS/Wasm,
SP/MP modules, worker and adapter; SP/MP modules, worker and adapter are unchanged.
The retained sky container on `127.0.0.1:32873` is still running, restart count 0.
No live service, retail data, RTCW source or Blood source changed.

Next: audit remaining shader/sampler consumers and run the retained campaign
scene with the new immutable candidate when Chrome control is available. Check
image quality, frame cost, error-free sampling, sustained movement/firing and
capture behavior. The last control error requested an extension update; this
turn did not retry or bypass it. Do not declare the border issue closed from
these native/component fixtures alone.

## Shipped shader startup repair

Chrome control became available again without a reinstall or alternate browser.
The initial border image was launched on isolated port 32874. It failed before
the native menu at 79066.8 ms with `unsupported shader dialect 130`; see the
[negative Chrome record](quake4-border-initial-chrome-2026-09-05.json). The
original image and the separate sky candidate are retained.

The earlier generated/material tests missed shipped SMAA and auxiliary shaders.
The new `test-q4-shader-inventory.mjs` enumerates all 66 sources / 33 pairs from
the shipped `baseoq4/pak0.pk4`, runs the actual packaged SDK preprocessing and
submission boundary, then compiles and links them on EGL/GLES. After accepting
GLSL 130, its [first run](quake4-border-inventory-initial-2026-09-05.json) passes
28/33, exposing sampler helper arguments, legacy MRT and normal-matrix issues.

The converter now forwards border metadata through scoped sampler parameters
and nested helper calls, preserves cube helper sampling, and maps constant
`gl_FragData[0..3]` to matching explicit output locations. Dynamic MRT, unsupported
dialects and unresolved forms still reject. The SDK previously replaced the
`gl_Normal` prefix inside `gl_NormalMatrix`, producing `a_normalMatrix`; exact
identifier conversion now preserves the matrix. Its inverse-transpose uploads
also update when fixed-function lighting is disabled or the separate model-view
uniform is optimized out.

Rebuilt-candidate evidence:

- [33/33 shipped shader pairs](quake4-border-dialects-inventory-2026-09-05.json)
  pass with `sourceComponents:false`: this is the real packaged converter.
- [12 targeted shader pairs and seven rejection cases](quake4-border-dialects-shaders-2026-09-05.json)
  pass, including nested forwarding, shadowed sampler names, cube helpers,
  three MRT outputs and GLSL 130 interfaces.
- [Actual SDK normal-matrix uploads](quake4-normal-matrix-native-2026-09-05.json)
  give the expected inverse-transpose for two nonuniform scales with lighting
  disabled and no model-view uniform. Existing cache/split-buffer/API tests pass.
- [4,096 desktop/GLES border comparisons](quake4-border-dialects-matrix-2026-09-05.json)
  pass across all 16 anisotropy settings. The implicit GLES branch now forwards
  enabled metadata through two helper functions, testing pixels as well as links.
- [91 linked-engine image/sampler/framebuffer cases](quake4-border-dialects-images-2026-09-05.json)
  pass. Four exact patch trees and full staging pass, including 24 generated
  shaders, 128 lighting cases, depth, runtime, adapter, worker and package gates.
  Staging now always runs the complete shipped shader inventory.

The [new identity record](quake4-border-dialects-build-2026-09-05.json) identifies
`local/idtech4-wasm:quake4-border-dialects-candidate`, image
`sha256:c663601a9f4f3107183c775726a09521b5f661e74ed04452604eb12f2a58f441`,
on isolated `127.0.0.1:32875`. Packaged JS is
`154d33f8e46539d114fc82912f9e209dc93ed770f43d1cd1e42dfd45c5856899`;
Wasm, game modules, worker and adapter are unchanged from the initial border
candidate. This candidate now renders the animated native menu in Chrome with
no worker exception. No live services or owner data were replaced.

### Normal-package Chrome campaign result

The [browser record](quake4-border-dialects-chrome-2026-09-05.json) and
[first-person screenshot](quake4-border-dialects-chrome-2026-09-05.jpg) retain the
fresh campaign result. The ordinary worker runs at 1424x1113 on the unchanged
High profile, with no diagnostic renderer wrapper. Native menu state arrives at
90090.8 ms; the first map loads in 34847 ms and presents Continue at 234658.6 ms.
Enter completes that gate at 262896.5 ms. The full intro runs naturally through
the ship and landing sequences, then reaches the pistol/hand/crosshair/health 72
HUD with textured ground, walls and rock, bright cloudy sky, distant structures,
smoke and aircraft. No worker exception occurs. No matching GL error or shader
failure appears in the retained 756 log lines, including startup; this is not a
separate instrumented GL trace. Missing assets, unsupported ARB assembly, mlock
and MSAA-texture warnings remain, so this is not full feature parity.

The gameplay click publishes `captured:false` at 524571.1 ms, followed by native
pause at 524793.9 ms. DOM pointer lock is null. Eight brief W presses occur while
paused and the following click opens Save Game; **neither movement nor firing
is accepted**. Escape backs out, then resumes the world at 670614.8 ms. The saved
screenshot is after that resume. A final Escape pauses at 719219 ms, with no
worker error and 487 scheduled WebAudio starts in a running context. Audible
listening, automatic/click capture, sustained controls, frame-cost measurements,
auxiliary shader variants and wider campaign acceptance remain open. The test
tab is retained paused on port 32875; Blood stays deferred and RTCW is untouched.
