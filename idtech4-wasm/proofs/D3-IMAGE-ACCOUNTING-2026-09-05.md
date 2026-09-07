# d3wasm-family image accounting — 2026-09-05

Follow-up: the [audio/intro checkpoint](PREY-AUDIO-INTRO-2026-09-05.md) traces
the remaining black scene to the first voice-completion wait. Identities below
describe the preceding ownership candidate, before that audio repair.

Status: missing RGBA accounting repaired in both the Doom 3/RoE and Prey
renderer sources. All 46 CPU regression cases pass; all three clients rebuild,
four exact patch trees verify, and full staging passes. Chrome exposes a second,
Prey-specific missing-image ownership defect after the format repair; that is
also repaired and covered by 11 GLES-backed cases. Chrome now runs native draw
statistics without either crash. The black scene is isolated to the view-effects
path: temporarily bypassing it reveals textured, lit world geometry. The actual
effect/intro-state repair remains open; the bypass is restored to its default.

## Reproduction and cause

While inspecting Prey's black Roadhouse through its native console,
`r_showPrimitives 1` crashes with
`R_BitsForInternalFormat: BAD FORMAT:6408`. The
[actual Chrome negative record](prey-renderer-diagnostics-crash-2026-09-05.json)
identifies the preceding input candidate and retains the native failure.
The worker exits, so subsequent reset commands cannot execute; the two
diagnostic cvars are not archived and reset on the next page load.

Both `GenerateImage` and `GenerateCubeImage` store `GL_RGBA` (6408) as the
internal format and upload unsigned-byte pixels. `BitsForInternalFormat`
recognizes legacy numeric formats and two packed formats, but not RGBA.
`StorageSize` calls it from draw statistics, image listing and memory reports.
The same function in the common Doom 3/RoE source has the same omission.

The repair adds RGBA to the existing 32-bit branch in both copies. It does not
change uploads, filtering, image contents, draw calls or the renderer's existing
approximate mip-size calculation. Invalid formats still take the error path.

## Verification

- [Negative CPU record](d3-image-accounting-legacy-2026-09-05.json): each source
  fails three of 23 cases: RGBA format size, 2D storage and cube storage.
- [Positive CPU record](d3-image-accounting-native-2026-09-05.json): both sets
  of 23 cases pass. Exact production functions are compiled with image-field
  surroundings and a throwing error handler. Legacy formats, invalid-format
  rejection and unloaded-image early return remain covered. These are logical
  accounting checks, not physical GPU memory measurements or full engine runs.
- The regression is now a `stage-site.sh` gate. All prior renderer, shader,
  image, adapter, worker, device and package gates pass, as do all four exact
  patch trees. Doom 3, RoE and Prey native clients are rebuilt with the pinned
  Emscripten 6.0.6 toolchain.

Run the CPU regression on a host with C++ and GLES2 headers:

```sh
node idtech4-wasm/scripts/test-d3-image-accounting.mjs
```

Current canonical patch hashes:

- d3wasm: `f9cc0d4dc91cdf5e8bc2af4af88d72d84ea240fe33863a50141f969052fcbc2e`
- Prey: `298593777d72c2c5e1184a68dab97475527a87cacfd25c669533debeac6fab7a`

The previous Prey input image is retained. Only an isolated test service may
change for browser acceptance; live games, Quake 4 binaries, RTCW and owner
archives are untouched. The Blood repro remains deferred.

## Missing-image follow-up

The [accounting-only image](d3-image-accounting-build-2026-09-05.json) reaches
Roadhouse at 438662.7 ms. Native diagnostics then fail with format **0**, not
6408; the worker exits at 463516.3 ms. This
[second negative Chrome record](prey-image-default-crash-2026-09-05.json) is
retained rather than counting the first repair as full diagnostic acceptance.

Prey's `MakeDefault` borrows `_default`'s texture ID without copying the format.
Its constructor leaves `internalFormat` at zero. Worse, `PurgeImage` deletes
every image's texture unconditionally, so a missing image can delete the
fallback used by other images. The common Doom 3/RoE implementation does not
have this aliasing shortcut.

Removing the shortcut uses the existing 16×16 fallback generator and normal
texture ownership. Transparent non-developer fallback pixels and the existing
developer checker are preserved. No texture-quality setting is changed.

- [Old ownership regression](prey-default-images-legacy-2026-09-05.json):
  seven of 11 cases fail.
- [Repaired ownership regression](prey-default-images-native-2026-09-05.json):
  all 11 pass on real EGL/GLES textures. Exact production `MakeDefault`,
  `PurgeImage` and accounting functions are exercised. The fixture supplies a
  minimal texture uploader, not the complete engine mip/downsize implementation.
- `test-prey-default-images.mjs` is now a staging gate. Prey rebuild, all four
  exact patch trees and full staging pass again. Doom 3/RoE do not need another
  rebuild for this Prey-only follow-up.

Read-only archive inspection also locates the console's `textures/gfx/bigchars.tga`
and `textures/gfx/console.tga` in deferred `pak004.pk4`. Mounting the archive does
not itself reload cached missing images. The comparison below confirms the
console issue but separates it from the black world.

## Chrome acceptance and next rendering cause

The [ownership candidate build record](prey-default-images-build-2026-09-05.json)
identifies image `04e41a70727078d605e9c6530e905eb3179533a6e3650437518c01dccc3c0f0a`
and matches all eight packaged artifacts to staged outputs. Native New Game →
Normal reaches Roadhouse at 136881.2 ms.

[Native diagnostic acceptance](prey-default-images-chrome-2026-09-05.json)
records continued scene draws, shadow triangles and image memory totals after
`r_showPrimitives 1`, with neither prior `BAD FORMAT` error nor worker failure.
The retained sample includes `views:2 draws:89 tris:10762 (shdw:5272)` and
20.1 MB image accounting. No `GL_CheckErrors` output occurs in this sample with
error checking enabled; that is not a whole-game guarantee. Both diagnostic
cvars are restored and queried to confirm their defaults at 178124–178265 ms.

Native `reloadImages all` at 193623 ms restores the
[console text](prey-reload-images-console-2026-09-05.jpg), but the
[world remains black](prey-reload-images-world-2026-09-05.jpg).
The [reload record](prey-reload-images-chrome-2026-09-05.json) retains the test.
Automatic recovery of early defaulted textures after archive mounting still
needs implementation; manual reload is not the shipped solution.

The next [view-effects isolation](prey-view-effects-isolation-chrome-2026-09-05.json)
temporarily sets `g_skipViewEffects 1`. A
[lit, textured bathroom sink and surrounding tiles](prey-view-effects-isolation-world-2026-09-05.jpg)
appear. Restoring it to zero makes the scene black again. `r_showTris 1` with
effects enabled stays black. All modified cvars are restored and queried;
Escape pauses at 345506.6 ms without worker errors. No view-effect bypass,
quality downgrade or gameplay workaround is installed. Trace the native
effect/fade/intro state next, and repair deferred-texture recovery separately.
