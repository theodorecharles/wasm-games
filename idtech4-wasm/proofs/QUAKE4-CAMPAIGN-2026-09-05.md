# Quake 4 campaign repair — 2026-09-05

The campaign-start `ChoiceVals` crash is traced to an unterminated OpenAL
device list. The corrected native engine passes the actual device-choice
builder and GUI lexer. C++ exception catching and destructor unwinding also
pass across the rebuilt main/side-module runtime. **Chrome campaign and audio
acceptance are still pending; no live service has been replaced.** The first
Chrome pass below confirms the parser repair and actual menu audio scheduling,
then exposes a separate post-load wait-loop stall.

## Root cause and regression evidence

`alcGetString(NULL, ALC_DEVICE_SPECIFIER)` must return a double-NUL-terminated
device list, not the single device-name string previously returned by the
browser bridge. The old linked engine enumerates 10,000 bogus devices before
the test's safety cap, scanning 235,531 bytes of adjacent engine constants.
Those include multiline command help. Its actual device-choice builder then
feeds that text into the actual GUI lexer, which rejects it (`-1`). This
reproduces the native path behind Chrome's `newline inside string` failure.

The corrected implementation returns `WebAudio\0` with the additional implicit
C-string terminator. Default-device and opened-device queries still return a
single name. The rebuilt engine enumerates exactly one device and its actual
choice lexer accepts both Default and WebAudio (`2`). No production parser
flags, owner assets or menu content were changed to bypass the error.

The test uses the linked Wasm's native `alcGetString` export. The generated
JavaScript `Module._alcGetString` is the SDK's different wrapper and cannot
stand in for this engine call path. The test-only side module invokes the
production choice builder and lexer without starting a renderer or loading
retail assets. Its `LEXFL_NOERRORS` records parse errors without invoking an
uninitialized UI; production lexer behavior is unchanged.

Emscripten had also compiled out catch handlers. The canonical Meson build now
uses `-fexceptions` for project C++ compilation and both main/side-module links.
All 749 project C++ compilation commands contain the flag, and the full engine,
SP game and MP game rebuild passes. A test-only side module throwing
`idException` reproduces the disabled-catching abort against the device-only
intermediate engine, then verifies catch payload and one destructor unwind
against the final engine. This is runtime exception evidence, not in-game
error-dialog recovery acceptance.

## Candidate identity and checks

- Image: `local/idtech4-wasm:quake4-campaign-candidate`
- Image ID: `sha256:2894633c6bda2d9592df928a9b9887bc1d19902cad95f940d936e718a8a2a6f2`
- Engine JS: `9ae5ab7a54a4bffa8bf778cf8eac161534d40d95f0e655a19c44a46b564dae4b`
- Engine Wasm: `82ec8b4f5ca3d7ca33d8a0168db87d9994a14a2a18a1c02217324317479f39f8`
- SP game Wasm: `fd06653d691281646875bba266fb28e1556078200572780378d6a3a56c0416a7`
- MP game Wasm: `802c0ddb06592f16e92fe854fd26ac31c6454de15ed57c700324f6a30226baca`
- Canonical patch: `eaacd9084d88f956576b14dfc3f77ab9cc59ba7d837ff50d26eb79535f8b6e2c`

Native device/GUI/exception, GL/focus and audio tests pass. All four exact
patched source trees pass reconstruction checks. Staging passes shader,
Wasm-import/memory, adapter/worker, actual device artifact and six-variant
package tests. Negative and positive logs are retained under the local
diagnostic directory `/tmp/idtech4-chrome.pAD0Mo/`.

Chrome's extension can open and inspect a fresh tab. Accessing the superseded
test tab times out; this alone does not justify reinstalling the plugin.
The candidate is served on isolated port 32873 to avoid sharing browser saves
with the old test tab. Retail Q4 data is mounted read-only. Live Q4 SP/MP,
RTCW and all other lab services are unchanged. The earlier
[menu checkpoint](QUAKE4-2026-09-05.md) remains historical evidence for the
previous artifact, not acceptance of this candidate.

## Chrome campaign pass and cooperative Continue repair

The device/exception candidate above renders the native menu in Chrome and
accepts Single Player → Mission → Start Game (default Corporal). There is no
`ChoiceVals` error. `game/airdefense1` loads in 38,085 ms, including entity
initialization, player spawn, 1,335 loaded images and ten settling frames.
WebAudio now has three sources and three starts, with 957 loaded buffers.
This proves actual scheduling, not audible-listening acceptance.

After map loading the last menu frame remains visible. Escape reaches the page
adapter, but the worker produces no further state, audio or log updates. The
source's synchronous loading-continue loop cannot receive browser messages or
yield the OffscreenCanvas for presentation. See the retained
[Chrome result](quake4-campaign-chrome-2026-09-05.json); this is not a rendered
map or gameplay pass.

The next candidate replaces only the browser's blocking continue loop with a
per-frame gate. The map remains loaded, with simulation paused and game audio
unselected; the loading GUI draws on normal frames. Input is accepted only
after a browser yield, preventing queued launch input from skipping Continue.
Completion retains the wipe and clears the input latch/queue and user commands.
The existing optional timed test override remains optional and off by default.
Desktop handling is unchanged. Unload clears the gate, and the browser reports
the wait as paused rather than gameplay.

Production-method tests use substituted engine/GPU services and cover 10,000
bounded waiting frames, stale launch input, key releases, non-continue events,
key/character completion, timeout boundaries and exactly-once sound/input
cleanup. They do not claim native whole-session or GPU acceptance. The rebuilt
artifact also repeats the actual device/GUI/exception tests successfully.
Exact source trees and staging/package tests pass.

- Continue candidate image: `sha256:eec336466987fa82b632115befd0ec23e29ce4d5b98413953f1f1beca7e3b99d`
- Continue engine JS: `d0b88bc6078b638832eadbd43f73fd0c9f263785de8e5cbaaa2d1c7b7ec20884`
- Continue engine Wasm: `eebabbd40129273ca36d4484025e77a10be05e66d4a3d12014fea871d7c738c7`
- Continue canonical patch: `c2fe55a538dcb7fa6e78638e8dda34fcb247d1d000c4192587a1e90614310590`

The SP/MP game modules are unchanged from the exception-enabled candidate.
Chrome renders the second candidate's native “PRESS ANY KEY TO CONTINUE”
screen and keeps it there after the launch click. Enter is forwarded by the
page but not accepted by the native engine. A physical mouse drag completes
Continue and changes reported state to gameplay. The view remains black and
no advancing campaign is accepted. The earlier `game/airdefense1` autosave is
logged, but cross-reload restore is not yet tested. See the separate
[Continue Chrome result](quake4-continue-chrome-2026-09-05.json).

## Next native clock/input repairs

Two missing browser connections explain the next failures in source: SDL's
desktop window filter discards browser keyboard events, and disabling the
async worker left no caller advancing the engine's simulation tic clock.
The old linked Continue candidate reproduces missing Enter (`-1`) in an
actual native queue test. The new native artifact returns `1`, including
Enter press, control character, release and both polled keyboard entries.

The browser now uses the existing physical-scancode mapper and engine event/
keyboard queues directly; printable text remains on its separate path. The
existing bounded `common->Async()` scheduler is serviced from browser
presentation frames after initialization, including blocking wipe frames and
uncapped loading presentation. Demo/capture waits likewise service their tics.
The old production presentation function fails an extracted-method clock-hook
test, while the new function and blocking-frame hook pass. That fixture
substitutes clock/engine services and is not whole-game timing acceptance.

Native desktop mouse-grab calls are excluded from the worker frame path. Page
focus and actual pointer-lock feedback remain authoritative; capture is not
faked by a per-frame native grab request. Extracted native tests cover capture
set/release alongside existing focus tests. Device/GUI/exception, keyboard,
Continue/clock-hook, GL/focus/capture and audio tests pass. All exact patched
source trees and staged package checks pass. Chrome testing is next.

The [clock/input native record](quake4-clock-input-native-2026-09-05.json)
identifies image `sha256:3fe9f527dee9827451fd76ab5faf50c4c445e242e37d6194e2ea2bd283fded4b`
and native Wasm `656cf224473230837355fa41fa2b3956333cf234e4b3852ca1e4b21e1bf52d3b`.
The served Wasm checksum matches.

Chrome loads `game/airdefense1` in 31,802 ms, renders Continue and accepts the
actual Enter press. The cinematic advances from a star field to textured
space debris and publisher titles, and WebAudio reaches 23 sources/starts.
The desktop mouse-grab log spam is absent. About 68 seconds after Continue,
the worker crashes and reports only `Uncaught worker error`. **The error's
timestamp is 5,504.6 ms before the later Escape press**, so the evidence does
not support classifying it as a cinematic-skip bug. First-person gameplay,
controls, campaign audio quality and persistence restore remain unaccepted.
See the [clock/input Chrome record](quake4-clock-input-chrome-2026-09-05.json).

The browser's worker `onerror` uses a five-argument callback, unlike the page's
`Worker.onerror` ErrorEvent callback. The wrapper mistakenly expected the
latter and discarded the message/stack. A regression reproduces that loss;
the repaired wrapper retains the fifth-argument exception stack, message and
location, while also accepting ErrorEvent-shaped fixtures. Worker and package
checks pass. This reporting-only follow-up leaves all native artifacts
unchanged and is being used to identify the cinematic crash.

## Natural cinematic crash: exact remaining call

The reporting-only candidate is image
`sha256:ac19c62a56e93b767afbe521805c82b804703eaefb7c1c1b57be562e630181d5`,
with worker `6f70c4dc7d513e29a52a25f2c1d0d28a3e84b717f56e51f10a1ab3c9ad1268b1`
and canonical patch `97e569e632f952d221f9275aba2b1e9670a34f0457bbfe23aa4dfdc6713c2396`.
All native JS/Wasm and SP/MP game artifacts remain unchanged from the preceding
clock/input candidate. Exact source and package checks pass.

Without any skip input, the same cinematic crashes 68,062.9 ms after Continue.
The repaired handler captures `RuntimeError: null function`. Actual Wasm
export indices and disassembly identify this path:

`RB_ARB2_DrawInteractions → RB_StencilShadowPass → RB_T_Shadow`

At Wasm offset `0x651796`, the indirect call passes `34336`
(`GL_VERTEX_PROGRAM_ARB`), register `4` (`PP_LIGHT_ORIGIN`) and the local-light
vector to the missing `glProgramEnvParameter4fvARB` entry point. The existing
browser guards already disable ARB shadow-program binding in both outer
stencil paths, but `RB_T_Shadow` and shadow-volume generation still select
vertex-program shadows from the generic renderer capability/cvar.

The next repair must align shadow-volume generation and drawing with the
supported browser path. Do not replace the missing parameter upload with a
no-op or merely disable all shadows: ordinary and packed MD5R geometry both
need correctly projected volumes. `tr_turboshadow.cpp` already has CPU shadow
generation, including `R_CreateShadowCacheFromSilTraceVerts`; evaluate and
test that coherent path before rebuilding. No shadow repair has been applied
yet. Full evidence is in the [natural cinematic crash record](quake4-cinematic-error-2026-09-05.json).

All isolated candidate images are retained. No live service has changed.

## Coherent CPU shadow candidate

Shadow generation, both outer stencil passes and the inner per-surface upload
now share a shadow-specific capability policy. GLSL lighting remains enabled;
missing ARB assembly support selects the existing CPU-projected volume builder.
The Vulkan module retains its separate projection capability. Neither stencil
operations nor the global shadow enable setting are bypassed.

Packed MD5R dynamic surfaces lack the classic silhouette remap required by the
CPU builder. The browser therefore uses the model boundary's existing CPU-
skinned/classic path, also used by Vulkan, rather than emitting packed palette
draws or dropping the models. This builds the normal silhouette topology before
shadow generation; static MD5R surfaces likewise remain materialized.

The old actual linked engine fails the new native regression with missing CPU
shadow vertices (`-3`); the repaired artifact passes (`1`). Real native builders
verify ordinary and sil-trace projections, translated light origin, unused-
vertex removal, silhouette walls, cap ordering and in-range indices. The ARB-
capable GPU layout and explicit CPU selection are also checked. The extracted
model-boundary selector changes from packed (`1`) to classic (`0`) in the browser.
That selector test is not retail skeletal-animation or GPU acceptance.

All native regressions, exact source reconstruction and staged package checks
pass. The [native shadow record](quake4-shadow-native-2026-09-05.json) identifies
candidate `sha256:311d643220a2df70458e3cf447bec9db1b7b376207662e4251ff5139d9d4dfed`
and Wasm `7c7c3ea597ecbe277e6c05f13346d84c2f1bde738c1921f8e7acf4a78ebaee2b`.
The isolated HTTP-served checksum matches. No live service has been replaced.

Chrome completes the natural opening cinematic without any skip input or worker
error. Enter is accepted at `170371.2` and Continue completes at `170380` ms.
The old ~68-second failure is cleared: the transport interior and animated
marines appear, then the cinematic reaches a first-person pistol/crosshair/HUD
(health 72). At the first-person observation WebAudio has 957 buffers, 96
sources and 403 starts. This is scheduling evidence, not listening acceptance.

**World rendering is still unacceptable:** large transport areas and then the
first-person world are black. Some character surfaces also appear absent or
incorrectly shaded. A console comparison confirms `r_shadows` defaults to 1;
temporarily setting it to 0 at `506597.8` does not restore the world, and it is
restored to 1 at `564586.2`. Thus the black scene is not simply the shadow mask.
Enabling native GL error reporting yields `GL_INVALID_OPERATION` and two
`GL_INVALID_VALUE` reports per frame. The next task is to localize those calls.
Console toggling and physical character keys work; the browser's text-insertion
operation alone does not deliver native text. The shell still reports gameplay
while the console is open, confirming the separate state-reporting issue.
Full world rendering, sustained movement/combat, audio quality and restore
persistence remain unaccepted. See the [Chrome shadow record](quake4-shadow-chrome-2026-09-05.json).

Diagnostic settings were restored (`r_ignoreGLErrors 1` at `772632.2`). The
native `listVertexCache` reports GPU ARB vertex-buffer memory, with index buffers
unused; a client-only vertex cache is therefore not the observed cause. The
isolated first-person save `q4shadowdiag20260905` succeeds at `911577.5`; its
cross-reload restore is not yet verified. The completed run is closed, and a
test-only WebGL-call tracing wrapper is being used in the next isolated run.
The wrapper is not staged or included in the candidate image.

## Generated legacy shader repair

The diagnostic save subsequently restores across two reloads to the same
first-person pistol/HUD scene (health 72), without repeating the intro. This
supersedes the preceding restore-pending note; rendering remains unaccepted.

The isolated WebGL tracer identifies actual failed ambient-pass programs in
`RB_STD_T_RenderShaderPasses`, generated by Emscripten 6.0.6's legacy texture
environment compiler. Cube lookups incorrectly use `sampler2D` and `.xy`;
COMBINE texture-load hoisting truncates a matrix expression at its inner `)`.
Both fragments fail compilation, followed by invalid program and attribute
operations. See the [actual Chrome compiler output](quake4-gl-shaders-legacy-2026-09-05.json).

The canonical browser patch adds a fail-closed `--js-transform` build step:
cube sampler/coordinate types follow the actual enabled target, and the broken
regex hoist is removed, leaving optimization to the GLSL compiler. Regression
coverage also found and repaired a separate RGB/alpha interpolation temporary
name/type collision. No runtime shader rewriting or installed SDK edit is used.
Meson tracks the helper as a link dependency.

The regression executes the exact packaged `GLImmediate` shader generator and
compiles/links its output using real surfaceless EGL/GLES. It covers 24 cases:
2D, cube, and simultaneous cube/2D enablement; texture matrices on/off; modulation,
inverse modulation, interpolation with distinct RGB/alpha operand types, and
two texture units. The old artifact fails 20 cases (four controls pass); all 24
pass after the repair and in the rebuilt artifact. Source reconstruction, native
regressions and package checks pass. Staging now runs this shader regression.

Candidate image is
`sha256:2b2a54ac87595ca75b1918c23f0e2170c4acf3bc836886d4992112020ba6681e`,
engine JS `35b89da4d03f5345d939d367d3798a70f41a0cf35ef297d701e493b89e757465`.
Native Wasm remains `7c7c3ea597ecbe277e6c05f13346d84c2f1bde738c1921f8e7acf4a78ebaee2b`.
See the [shader regression/provenance record](quake4-gl-shaders-native-2026-09-05.json).
Chrome restores the saved Air Defense Bunker scene to first-person pistol/HUD
(health 72). No shader link failures or invalid program/attribute/draw calls are
reported by the same diagnostic wrapper. The world remains black; texture and
framebuffer errors remain. Temporarily changing `r_screenFraction` from its
observed value 85 to 100 at `242335.1` ms also leaves the world black, so the
upscale-copy failure is not the sole cause. See the
[repaired-shader Chrome record](quake4-gl-shaders-chrome-2026-09-05.json).
The original scale 85 is restored at `280401.6` ms. The completed diagnostic tab
and isolated container are closed; the candidate image and saved state are
retained for the next texture-upload repair. No live service has changed.

Other traced rendering errors remain separate work: unsupported desktop texture
swizzles/border parameters/byte swap, legacy alpha/luminance storage formats,
thin compressed texture allocations, and default-framebuffer copies into an
RGBA16F destination. Do not claim the shader repair alone fixes those paths.

## Native texture upload repair

The rejected 2×1 alpha texture is `_alphaNotch`, used for alpha-test clip planes;
the rejected 64×16 intensity texture is `_noFalloff`, a lighting lookup. The
browser now materializes alpha/luminance/intensity and legacy swizzle semantics
in RGBA8 uploads. RGB565 source bytes are explicitly decoded in BinaryImage's
high-byte-first order, without unsupported `UNPACK_SWAP_BYTES`.

Font green-channel coverage becomes white RGB plus the original coverage alpha.
RGB normal maps retain RGB and duplicate X into alpha. DXT1/DXT5 textures needing
those swizzles, or having WebGL-incompatible base dimensions, use the existing
native DXT decoder. Each block is cropped to the real upload rectangle; source
pitch, cube face, mip level and destination offsets are preserved. Raw DXT5
normal/YCoCg channels are not color-space decoded a second time. Valid DXT5
normal textures still use compressed GPU storage, and float/depth storage is
not replaced. The encoded cache metadata remains intact; RGBA8 GPU memory
accounting includes the expanded mip chain and all cube faces.

This follows the [WebGL 2 prohibition on texture swizzle state](https://registry.khronos.org/webgl/specs/2.0/)
and [S3TC upload dimension rules](https://registry.khronos.org/webgl/extensions/WEBGL_compressed_texture_s3tc/).
The repair does not suppress the remaining unsupported border-clamp parameters
or the separate default-framebuffer/RGBA16F copy failure.

Twenty actual-linked-engine tests cover allocation, exact uploaded bytes,
source immutability, compressed alpha/normal/coverage, thin mip chains,
pitched subrectangles, cube faces, pixel-store restoration and memory accounting.
The old actual artifact fails 18 cases; all 20 pass in the repaired artifact.
The two old controls—valid compressed DXT5 normals and floating-point storage—
remain unchanged. This uses a recording GL sink, not a fake second converter;
it does not by itself prove WebGL rendering. All other native regressions,
24 real-driver generated shader links, exact source reconstruction and package
checks pass. See the [native texture record](quake4-textures-native-2026-09-05.json).

Isolated candidate `sha256:e9db075cd19694fd5bc976cfd8ef78ba761364d941758f7a44a31ecadfa0cc14`
serves JS `9a10546a6bb49b702e80a5fda2d30d0d4ccfd887d6eedb5b7c4c43e854d5c035`
and Wasm `2dc28ae94c79546d7c8b77c96771104b0c0ec4e3c32d0f350c7ad66913527ae8`.
SP/MP game modules are unchanged. Chrome restores the saved first-person scene
at `175470.3` ms. Menu text is white/gold and pistol/hand/HUD colors are now
native brown/white instead of green/purple. Color allocation/subupload,
swizzle, byte-swap and thin-compression errors no longer appear in the trace.
The world remains black; no live game service has changed.

Remaining errors are unsupported border-clamp parameters, two 16×16
`DEPTH_COMPONENT`/`UNSIGNED_BYTE` placeholder allocations, and default-backbuffer
copies into RGBA16F. The tracer reports only the first two failures per
method/error: the old alpha/intensity failures hid these unchanged depth
allocations, so their newly visible reports are not evidence of a regression.

`r_showTris 3` at `323829.8` produces a filled white view while preserving
crosshair/HUD. This establishes visible debug draw geometry, not correct
wireframe/topology (WebGL has no line polygon mode). The original value 0 is
restored at `382153.7`. `r_skipBump 1` at `759183.8` leaves the world black;
the original 0 is restored at `796391.3` and confirmed at `818558.7`.
There are no worker errors; WebAudio is running with 223 scheduled starts,
not a listening acceptance. Full rendering/gameplay acceptance remains open.
See the [complete texture-candidate Chrome record](quake4-textures-chrome-2026-09-05.json).

## Depth texture allocation repair

The actual texture candidate reproduces invalid depth allocations using
`DEPTH_COMPONENT` with `UNSIGNED_BYTE`. Browser `FMT_DEPTH` now requests
`DEPTH_COMPONENT24` / `DEPTH_COMPONENT` / `UNSIGNED_INT`, a valid combination
in the [Khronos ES 3 format table](https://github.com/KhronosGroup/OpenGL-Refpages/blob/main/es3.0/internalformattable.xml).
Desktop behavior and packed depth-stencil/float formats are unchanged.

Two new actual-linked-engine tests cover the 16×16 placeholder, resize, all
cube faces and three mip levels. Both fail in the texture candidate and pass
after the repair. The previous 20 cases and a packed depth-stencil control
also pass (23 total). Exact source reconstruction, native shadow/device GUI/
exception/keyboard/GL/Continue/clock/audio regressions, 24 real-driver generated
shader links and staged-package checks pass. This proves allocation policy,
not correctness of later depth copies/blits/MSAA resolves. See the
[native depth record](quake4-depth-native-2026-09-05.json).

Isolated candidate is
`sha256:21f2fc06c2d77571ebe3a2501948e2b984ff45b230b84d7a81f55002df83157b`,
Wasm `7a160c7dfe6b50be7570391f03fa4daebde3ee426809952b2e53c58ab77db752`.
JavaScript, SP/MP game modules and production worker are unchanged. HTTP-served
bytes match. Chrome restores the saved first-person scene at `205621.3` ms;
the pistol/hand/HUD retain corrected colors, health 72, and no worker errors.
No texture allocation failures are reported. The remaining trace contains
only unsupported border parameters and the default-backbuffer RGBA16F copies.
The world stays black. See the [depth-candidate Chrome record](quake4-depth-chrome-2026-09-05.json).

`r_showTris` is confirmed 0 at `227469.1`; mode 1 at `241767.6` produces a
filled white view with crosshair/HUD intact. Unlike mode 3, this code path
keeps depth testing enabled (`LEQUAL`), so the map is not simply absent.
It does not verify wireframe topology or the interaction pass's `EQUAL`
depth matching. Value 0 is restored at `313249.7` and confirmed at `366688.5`.
WebAudio is running with 89 scheduled starts; listening remains unaccepted.
The completed diagnostic tab and isolated container are closed; saved state
and immutable candidates are retained. No live game service is replaced.

Next narrow hypothesis, not yet verified: the SDK-generated depth vertex
shader computes `eye = modelView * position; clip = projection * eye`, while
the browser material vertex shader uses the left-associated
`projection * modelView * position`. Floating-point depth equality across
these programs has no regression coverage. Compare actual shader position
outputs/depth-tested samples before treating this as the black-world cause.
Do not confuse the newly repaired depth texture allocation with that separate
depth-buffer comparison hypothesis. Default-backbuffer copy compatibility and
border-clamp semantics also remain independently reproducible errors.

## Position hypothesis and framebuffer-copy repair

The suspected position-expression mismatch is not reproduced in 20 synthetic
translated-world cases on either the real EGL/GLES driver or Chrome WebGL 2.
The actual packaged depth shader and linked material shader accept all 968
visible samples per case with `EQUAL`; deliberately perturbed depth rejects
all samples. Reassociating the material expression in the test changes
nothing. Production position shaders remain unchanged. This is not a proof
about every campaign surface/rotation. See the [controlled comparison](quake4-position-2026-09-05.json).

A separate Chrome API matrix reproduces `copyTexImage2D` into RGBA16F failing
for all four alpha/antialias combinations. A direct color blit works without
MSAA but fails with MSAA. A source-format-matched resolve preserving source
rectangle coordinates, followed by a normalized-to-float blit, preserves all
16 inspected pixels with no errors in all four cases. Simply requesting RGBA8
in `copyTexImage2D` also fails for alpha-free browser buffers, so that is not
used as a universal workaround. See the [API reproduction](quake4-framebuffer-api-2026-09-05.json).

Two additional Chrome cases copy RGBA16F renderbuffers with zero/four samples.
All 16 pixels retain exact `[2.5, 0.125, 4, 0.75]` values with no errors,
including values above 1; HDR storage is not silently normalized or clamped.

The browser `idImage::CopyFramebuffer` now retains the destination's HDR
storage, queries actual source samples, and uses the two-step resolve only
when multisampled. Ordinary copies use a single blit. Render-texture sources
retain their actual source storage format; default sources choose RGB8/RGBA8
from actual alpha bits. Scissor, read/draw FBO bindings, the source's read
selection and the prior draw FBO's MRT selection are preserved. Scratch
storage is reused and purged on context teardown. Desktop behavior is unchanged.

Eight actual-linked copy cases cover RGB/RGBA browser sources, RGBA8/RGBA16F
render-texture sources, zero/four samples, nonzero source offsets, scissor and
FBO/MRT state restoration, and repeated-size reuse. A ninth covers scratch
purge/recreation. All nine fail in the previous actual engine; all 32 image/
copy cases pass after repair. GLEW framebuffer-procedure readiness, other
native regressions, 24 real-driver shader links, exact source reconstruction
and package checks pass. See the [native copy record](quake4-framebuffer-native-2026-09-05.json).

Isolated candidate is
`sha256:af0bbb5da44f90fa576e1c1a3d0c2af3abacab2c92d77b560c1d388fe66e3cbb`,
Wasm `0423d20acc74fabb7c0a79e3e53edd293143367171377f08ddf61536e423cc00`.
JavaScript, SP/MP modules and production worker are unchanged; served hashes
match. Chrome restores the saved first-person scene at `475759.2` ms, retaining
the correctly colored pistol/hand, crosshair and health 72. No copy/blit,
texture-allocation, shader/program/attribute or draw errors are reported;
only the existing unsupported border parameters remain in the trace.
The world is still black. No diagnostic settings changed. WebAudio is running
with 59 scheduled starts, not a listening acceptance. See the
[complete framebuffer-candidate Chrome record](quake4-framebuffer-chrome-2026-09-05.json).
Rendering/gameplay acceptance remains open. No live service is replaced.

## Actual interaction submission and depth comparison

A test-only companion worker captures the first 32 distinct material draws'
actual uniforms, first indexed triangle, attribute layout, texture parameters
and GL state. Occlusion queries surround the original draw without substituting
shaders or state. All 32 results return: only IDs 3/4, the two weapon-depth-range
draws, pass any samples; the other 30 do not. All attribute arrays and five
material textures are bound; diffuse colors are nonzero. Only the pre-existing
border errors are recorded, with no worker errors. The scene stays black except
for the normally colored weapon/HUD. Occlusion alone does not identify which of
clipping, culling, scissor, stencil or depth rejected a draw. See the
[actual interaction record](quake4-interaction-chrome-2026-09-05.json).

The depth comparison now additionally replays those 32 captured first triangles,
model/projection matrices and depth ranges at the captured 1408×797 viewport.
Eighteen triangles have visible samples; all visible samples pass `EQUAL` and
all deliberately perturbed depth controls reject them. Twenty earlier synthetic
controls also pass. This replay uses neutral test lighting and no campaign
occluders/scissor/stencil/culling; it assumes the depth pass uses the material
pass's matrices and does not establish that it actually does. The original
position-expression hypothesis remains unreproduced. See the
[captured-geometry native comparison](quake4-position-captured-2026-09-05.json).

The paired diagnostic restores gameplay at `249298.7` ms and collects 128 legacy
depth-writing draw samples and 32 material samples. Seven exact first-triangle
matches have identical actual model/projection matrices, viewport and depth
range; two are the weapon draws. The unmatched first triangles do not prove
absent depth submission: this limited sampler filters for legacy programs with
depth testing/writes enabled. FBO bindings and depth-pass occlusion are not yet
sampled. See the [paired Chrome record](quake4-paired-depth-chrome-2026-09-05.json).

`r_useStateCaching` is confirmed at its original 1 (`413948.1` ms), temporarily
set to 0 (`426146.2`) and leaves the world black. The original 1 is restored
(`462947`) and confirmed (`477382.9`). Only the existing border errors remain
in the trace; no worker errors. WebAudio is running with 108 scheduled starts,
not a listening acceptance. No speculative position-shader repair is applied.
Next narrow check: actual framebuffer/depth-write/submission state and depth-
pass occlusion for the unpaired world draws, not another assumed-matrix replay.
The completed diagnostic tab and disposable container are closed; owner data,
saves and immutable candidates are retained. No live service changed.

## Depth-pass isolation and stale legacy vertex bindings

A visible, test-only control panel isolates depth, stencil, culling and scissor
tests on material draws, restoring the exact original GL state after each draw.
In the same saved scene, bypassing only depth makes world geometry and lighting
appear, with incorrect overlapping occlusion. Normal mode has 2/32 captured
material draws passing samples; the depth-bypass sample has 13/32. This is a
diagnostic, not a production workaround or acceptable rendering. The panel is
returned to worker-confirmed normal mode. See the
[pass-isolation record](quake4-pass-isolation-chrome-2026-09-05.json).

The preceding 145 depth draw/clear events all use the default framebuffer.
Many different-count depth draws read the same vertex buffer and first vertex.
Earlier first-triangle-deduplicating probes concealed that repetition. The SDK
updates `lastArrayBuffer` during `glBindBuffer`, and `renderer.prepare()` then
mistakes equal renderer/stride/matrices for unchanged vertex attribute state.
`prepareClientAttributes()` consumes its dirty flag without invalidating that
prepared-state cache. Buffer/offset/component changes consequently do not
reach `vertexAttribPointer` before depth submission.

The build-time SDK transform now invalidates `lastStride` when consuming a
dirty client layout. This retains cached shader programs and the unchanged-draw
fast path; production depth testing, shaders, textures and native cvars are not
bypassed. The native Wasm regression invokes the actual SDK renderer and engine
indexed-draw bridge, recording final WebGL attribute bindings. Five of ten cases
fail before repair; all ten pass after, including unchanged-state pointer reuse.
This binding test is not GPU-pixel acceptance. See the
[negative](quake4-vertex-cache-legacy-2026-09-05.json) and
[positive](quake4-vertex-cache-native-2026-09-05.json) native records.

The engine rebuild, four exact patched source trees, 24 real-driver shader
programs, 32 native image/copy cases, renderer artifact, adapter/worker and
staging/package checks pass. The packaged JS has a fail-closed cache guard.

- Candidate: `local/idtech4-wasm:quake4-vertex-cache-candidate`
- Image: `sha256:7f220d6ab480afd2e9c2631e30c1793c5167df02cccbe99c3f656e3e5901ffc5`
- JS: `c8ffe0c753f3cd1ddcb08ac00ef563f96b9fdf95e446b9815890e1dc96e4b9e9`
- Wasm (unchanged): `0423d20acc74fabb7c0a79e3e53edd293143367171377f08ddf61536e423cc00`
- Patch: `83ccd6680c10496bc2eba51a1762eeaea021775d174de1310c8424b6630adda6`

SP/MP modules and production worker are unchanged. The old isolated container was stopped and removed;
its logs, image and saved data are retained. No live service changed.

Chrome restores `q4shadowdiag20260905` at `155747.7` ms with no worker error.
The world now renders textured terrain, rock geometry, walls/structures and
effects, alongside the normally colored pistol/hand and health 72 HUD. All
diagnostic bypasses remain off. The 145-event prepass contains 142 draws; its
distinct vertex buffers rise from 13 to 77, and distinct first vertices from
46 to 131. All events still use the default framebuffer. Eleven of 32 captured
normal material draws now pass samples, versus two before. Only the previously
known border-parameter errors remain. WebAudio is running with 63 starts,
which is scheduling evidence, not listening acceptance. See the
[normal-depth Chrome record](quake4-vertex-cache-chrome-2026-09-05.json).

This fixes the demonstrated stale-binding/black-world failure, not every
rendering problem: some dark areas/apparent geometry gaps and border-clamp
semantics remain for follow-up. Full campaign/control acceptance stays open.
The normal immutable package, with no diagnostic worker/panel mounts, then
restores the same save at `144422.8` ms. Textured world terrain, rocks,
walls/structures and effects remain visible with the pistol/hand/crosshair and
health 72 HUD. Some areas remain dark and apparent geometry gaps remain. There
are no worker errors and no diagnostic log records. WebAudio has 246 starts,
again not listening acceptance. Served JS/Wasm/worker hashes match the package.
See the [uninstrumented Chrome record](quake4-vertex-cache-production-chrome-2026-09-05.json).
Escape pauses this isolated campaign at `225063.7` ms. The uninstrumented
candidate remains on `127.0.0.1:32873` for the next rendering check; no live
service is replaced and no save is overwritten or deleted.

## Shipped material-lighting parity

The next source comparison finds a separate shader mismatch. The browser's
abbreviated interaction shader does not consume `uAmbientLight` or the ambient
normal cube, normalizes stock bump normals differently, uses a power-16
specular term instead of the shipped stock term, and omits the diffuse-light
factor from specular. Existing enhancement, cel and flat-diffuse controls are
also absent. These are not texture-border errors; the unsupported border calls
remain open rather than being silently mapped to different sampling semantics.

The browser now embeds a GLSL ES port of the pinned pak0 material shaders,
retaining their lighting equations and controls. Only the GLSL interface,
texture-function spelling and explicit browser position/color/matrix inputs
change. The actual linked shaders are rendered against a syntax-only conversion
of the shipped reference on the same real EGL/GLES driver, with 128 cases
covering four bump samples, four light directions and eight lighting/control
modes. The old artifact differs in 116 cases, by up to 78/255 per channel. The
repaired artifact matches every pixel/channel exactly in all 128 cases. See the
[negative](quake4-lighting-legacy-2026-09-05.json) and
[positive](quake4-lighting-native-2026-09-05.json) GPU comparison records.

Twenty synthetic and 32 captured-geometry depth cases still pass; the fixture
now supplies the ambient cube sampler and explicit stock lighting controls.
The actual depth/position equations have not been reassociated. Ten SDK vertex
cache cases, 32 image/copy cases, 24 generated shader programs, four exact
patched source trees and staging/adapter/worker/package checks pass. Staging
now requires the shipped-material pixel comparison, not just shader linking.

- Candidate: `local/idtech4-wasm:quake4-lighting-candidate`
- Image: `sha256:e654f4ff1261c92d752dad59e65588eb00d260210ab85678d94499f595cbe849`
- JS: `11b15254ea517e1294f0435bd53bbfeeb235b1fd4652b81219e840d352e643ee`
- Wasm: `81ba77f6d322dcf6f326420fa156518d826c9b2ac339e93dc2ef5b85e2a463c9`
- Patch: `7284384924fa364e59e0199e3c59eaacffb118f7fc03c1d1b517b4c6b678d3c6`

The first Chrome attempt at verifying the lighting candidate is incomplete.
The previous uninstrumented candidate again restores the comparison save and
renders the same dark areas/apparent rock-face gap before the candidate swap.
No native graphics setting, live service, retail asset or saved game changes.

The candidate reports native menu state at `96679.4` ms with no worker errors.
The subsequent Load Game control step times out. Fresh controller connections
still list the exact game tab, but reacquiring it for a screenshot/DOM status
read and claiming the freshly listed tab also time out. Chrome running,
installation, enabled-extension and native-host checks all pass. Opening the
previously approved fresh Chrome window does not restore control of that old
tab. A subsequent agent-created blank tab responds immediately to creation,
DOM inspection, candidate navigation and the Play button. This narrows the
failure to the old tab; it does not establish a plugin-wide failure, engine
crash or visual regression. Campaign verification continues in the fresh tab.
See the [incomplete Chrome record](quake4-lighting-chrome-incomplete-2026-09-05.json)
and [retained depth regression](quake4-lighting-depth-2026-09-05.json).

### Fresh-tab campaign result

The fresh tab reaches the native menu at `94696.9` ms and restores
`q4shadowdiag20260905` through the native Load Game controls at `183681.1` ms.
Textured terrain, walls, rocks and the pistol/hand/crosshair plus health 72 HUD
render. Dark areas and apparent geometry gaps remain; this is not full renderer
acceptance. No native graphics setting changes. Escape opens the native pause
menu and publishes paused state at `271372.7` ms.

All 32 sampled draws bind the ambient cube on unit 5 and consume the stock
lighting controls, but all are point-light draws; this sample does not prove
ambient-light rendering in Chrome. Nine of 32 occlusion results pass samples.
There are no worker errors. The two known unsupported border-color/wrap call
signatures still produce error 1280; no shader or rendering-state bypass is
used. WebAudio has 57 starts at capture, not listening acceptance. See the
[fresh-tab Chrome record](quake4-lighting-chrome-2026-09-05.json).

After capturing evidence and confirming pause, this fresh test tab is navigated
to blank to release its game instance. The isolated diagnostic container is
replaced with the same immutable lighting image without diagnostic mounts for
an uninstrumented check. The old inaccessible tab is not manipulated.

### Normal-package repeat

The same immutable lighting image, with only isolated data and read-only retail
data mounts, reaches its native menu at `97734.9` ms. The native Load Game menu
restores the same save at `188524.5` ms. Textured terrain, rocks, walls, effects
and the pistol/hand/crosshair with health 72 HUD render. Dark areas and apparent
rock-face/geometry gaps remain, so complete rendering acceptance stays open.
No graphics settings are changed. Escape pauses at `222616` ms.

There are no worker errors and zero diagnostic log records. Served JS, Wasm
and worker hashes match the package. WebAudio has 209 starts at capture, again
not listening acceptance. See the
[normal-package Chrome record](quake4-lighting-production-chrome-2026-09-05.json).
The isolated uninstrumented container
`d0f9fb7c5f71266a9caf4efbe177e1b99f0e428151095837a19dc2bac4d500c5`
remains on `127.0.0.1:32873`; no live service is replaced.

No game or browser restart is inferred from an observation timeout. Live games,
owner data and saves are untouched. Border-clamp sampling and wider campaign
rendering/control acceptance remain open.

## Native reference and split-buffer sky repair

A clean native client/SP build from the same pinned engine/game source runs
offscreen on the real desktop OpenGL driver. It loads `game/airdefense1`, skips
the intro and uses the camera captured from browser material draws. This is a
fresh native map, not the browser-local saved game: dynamic actors, effects and
campaign time differ. The 1024x580 capture has nearly the browser's aspect ratio.
See the [reference record](quake4-native-reference-2026-09-05.json) and
[native screenshot](quake4-native-reference-2026-09-05.png).

The dark triangular opening under the central sloping rock appears in the
native renderer too, so this specific shape is not evidence of a browser
geometry defect. Native rendering shows bright cloudy sky and distant scenery
where the browser's comparable view is largely black. The missing background,
not general scene brightness or that rock opening, is the next rendering target.

The sky uses a mesh VBO for positions and a separate tightly packed VBO for
generated cube coordinates. The SDK stores no VBO binding with each legacy
array pointer, applies one global stride to every array, and even attempts to
restride GPU offsets as CPU addresses when the sky arrays have different
strides. A regression using actual Wasm pointer calls and the actual SDK
renderer fails four of five original cases. The split-sky case submits both
arrays from the texture-coordinate VBO with stride 24, instead of separate
buffers with strides 64 and 0. See the
[negative binding record](quake4-split-buffers-legacy-2026-09-05.json).

The build-time SDK transform now captures each array's VBO at pointer setup,
keeps GPU-only arrays out of CPU restriding, submits their own buffers/strides,
and restores the application's current array-buffer binding. The indexed bridge
and SDK DrawArrays path retain saved VBO pointers after unbinding. The existing
CPU-array path is retained; this is not a claim of complete SDK support for
arbitrary mixed CPU/GPU arrays. Seven binding cases now pass, including two
additional DrawArrays cases, as do the ten existing vertex-cache cases with
unchanged-draw pointer reuse. See the
[positive binding record](quake4-split-buffers-native-2026-09-05.json).

The engine rebuild, four exact source trees, 32 image/copy cases, depth tests,
24 generated shader links, 128 shipped-material lighting comparisons and
staging/adapter/worker/package checks pass. One staging invocation received
SIGTERM after its device assertions; the device test and complete staging rerun
both exit 0. No assertion failure was found in that interrupted invocation.

- Candidate: `local/idtech4-wasm:quake4-split-buffers-candidate`
- Image: `sha256:001f0101946d32aa7f6af315765c1a0f4feb62cf2464ed6d902bea4f9df429cc`
- JS: `f5c0bd84e0ca004836ed08453a23c65476a076dac13b313b7641d0a8183cb01c`
- Wasm: `acc83bd822c80b7c28e4868331c593951787ff69c823f3306062793c33532f62`
- Transform: `deffe6b3e595001fd9cc2cbe7ec76a40ee4809ac7c6a2e629fd3b5c40bcfd952`
- Patch: `19ed1a8e7ee35687a6f6e7769406b559b82bb2c6f66848a935cb17c004fd84fd`

For Chrome verification, the paused lighting-baseline tab is deliberately
navigated to blank, and only the isolated container on `127.0.0.1:32873` is
replaced. Live services and saved games remain untouched.

### Normal-package sky result

The uninstrumented split-buffer candidate reaches the native menu at
`110296.5` ms and restores `q4shadowdiag20260905` at `199446.6` ms. Bright cloudy
sky, distant towers/buildings and moving aircraft now render behind the textured
terrain, walls and rocks, alongside the pistol/hand/crosshair and health 72 HUD.
This verifies the missing-sky repair; it is not blanket scene-brightness or
full-campaign acceptance. The viewport is 1408x742, versus 1408x798 in the earlier
lighting check, so screenshots are not pixel-identical comparisons.

A gameplay click reports capture at `298747.2` ms. Five very short W keypresses
deliver five balanced down/up pairs; sustained movement is not established.
Relative mouse motion (`dx=40`, `dy=0` at `335253.7` ms) visibly changes camera yaw
with the sky still present. The DOM pointer-lock element nevertheless reads
null; independent DOM capture confirmation and automatic load/resume capture
remain open. Firing is not accepted by the initial capture click.

Escape delivers native scan 41, opens the native pause menu and publishes paused
state at `419827.7` ms, followed by capture release at `419828.2` ms. Worker errors
are empty and diagnostic records zero. WebAudio reaches 311 starts with a running
context; this is scheduling evidence, not listening acceptance. See the
[normal-package sky record](quake4-split-buffers-chrome-2026-09-05.json).

The isolated container is now
`4e9cc0c7b71f826abee21551c0c993cd00e808abc8ef5ee0497f5f52fea4f164`
on `127.0.0.1:32873`, with only isolated data and read-only retail mounts. A later
request to retain the paused tab returns an instruction to update the Chrome
extension. No browser recovery loop or external installation is attempted;
this does not invalidate the already captured sky result or establish a game
failure. Border sampling, sustained controls and broader campaign checks remain
open. Blood stays deferred and RTCW's user-confirmed renderer is untouched.

### Border-sampling follow-up

Local work continues while new Chrome checks await extension availability.
The [border checkpoint](QUAKE4-BORDER-2026-09-05.md) adds a real desktop GL oracle,
negative controls for inadequate substitutes, and a test-only isotropic sampler
that matches 128 cases on each of desktop GL and GLES 3. Enabling 8x anisotropic
filtering exposes 30 mismatches per API, so no prototype is integrated into the
engine or immutable sky candidate. This is progress toward the remaining border
repair, not rendering acceptance or a reason to disable an existing setting.

The next local checkpoint adds real multi-tap anisotropic filtering and shader
source conversion. All 16 settings pass 4,096 desktop/GLES border comparisons
against native filtering at matching tap positions. Vendor anisotropic-kernel
differences are retained separately; no exact campaign image parity is claimed.
Generated/material shader linking, disabled-border lighting and synthetic/
captured depth regressions pass. See the border checkpoint's latest section for
the remaining texture-state integration and quality/performance gates. The
production patch and retained sky candidate remained unchanged at that checkpoint.

The subsequent integration updates the canonical patch and rebuilds the engine.
Cached sampler metadata now reaches shader conversion and draws through actual
SDK paths; image, native API, format, packaged-GPU and prior regression gates
pass. A separate immutable `local/idtech4-wasm:quake4-border-candidate` is built
but its application has not been launched. The running Chrome-verified sky
candidate remains unchanged. See the border checkpoint's integrated-build
section and identity record; this is not new campaign or performance acceptance.

Chrome control is subsequently restored. Launching the initial border image
reveals a fatal GLSL 130 rejection before the menu. A new complete shipped-shader
inventory also catches sampler helper, MRT and normal-matrix defects. Repairs
are rebuilt and packaged separately on port 32875; all 33 shipped pairs and the
renderer/staging regression gates pass. The native animated menu now renders
in Chrome without a worker exception. A fresh campaign subsequently completes
its full natural intro and renders textured first-person world, bright sky,
smoke/aircraft and pistol/HUD. Native pause/resume preserves the world. The
capture click instead opens pause, so sustained movement/firing and capture
remain unaccepted. The paused test tab, browser proof and screenshot are retained.
See the border checkpoint's shader-startup section for the negative browser
record, fixes and new exact identities. The retained sky image and live services
remain unchanged.

The subsequent [capture checkpoint](QUAKE4-CAPTURE-2026-09-05.md) repairs native
input-mode/resume reporting and delays capture until native gameplay confirms
the menu/console/Continue transition. Negative/positive native and adapter
tests plus staging pass. Chrome verifies root/submenu resume intent and native
menu-to-gameplay transitions. A separate re-lock correction removes an overly
strict activation guard. An engine-free browser control rejects immediate and
delayed trusted capture clicks with `WrongDocumentError`, so capture is still
unaccepted and not blamed solely on native handoff. Only port 32875 is replaced,
retaining preceding images and stopped containers. The sky candidate and live
services are unchanged. Save-preview thumbnail corruption is separately open.
