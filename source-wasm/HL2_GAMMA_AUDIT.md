# HL2 brightness audit — v4/v5 reference runtime

Read-only source audit, 2026-09-07. Evidence image: private `browser/side-v4-opening-03.png` under `/home/ted/.local/state/hl2-resume-20260907/`. Source references below are relative to `/home/ted/.local/share/source-wasm/hl2-side-63f8364-20260907/source`, pinned at `63f8364fe7b22b239e72dfb5f1024665b3a91567` plus the recorded native patches. No gamma adjustment, native edit, build, or browser interaction was performed for this audit.

## Confirmed state defect

The active renderer is **`togles/`**, selected by `--togles` in [build-side-modules.sh](scripts/build-side-modules.sh).

| Source | Evidence |
| --- | --- |
| `togles/linuxwin/dxabstract.cpp:3896` | For `IsWasm()`, every named pixel shader except `engine_post` receives the software sRGB-write suffix. |
| `togles/linuxwin/dx9asmtogl2.cpp:3927` | That suffix mixes linear output with `exp(log(color) × 0.454545)` using `flSRGBWrite`. |
| `togles/linuxwin/cglmprogram.cpp:852` | Under `__EMSCRIPTEN__`, the linked program's `flSRGBWrite` is immediately set to **1.0**. |
| `public/togles/linuxwin/glmgr.h:1416` | Requested `D3DRS_SRGBWRITEENABLE` updates the tracked hardware state or `m_FakeBlendEnableSRGB`. A search of the active renderer finds **no draw-time code propagating either state to `flSRGBWrite`**. |

Therefore shaders with the suffix encode their output even when a pass requests sRGB writes disabled. This is a concrete state-contract defect. It is **not yet proof that this alone causes the pale G-Man draw**, which may legitimately request sRGB output.

There is also a possible duplicate conversion: `appframework/glmdisplaydb_linuxwin.inl:44` advertises gamma writes and permits sRGB attachments; `togles/linuxwin/dxabstract.cpp:1206` simultaneously advertises fake sRGB writes. `CreateRenderTarget` at line 3136 marks targets sRGB, while the shader suffix remains active. Record the actual bound attachment's color encoding before deciding whether that draw is encoded twice. The desktop-style `GL_FRAMEBUFFER_SRGB_EXT` setter at `public/togles/linuxwin/glmgr.h:721` is not adequate evidence of the resulting WebGL attachment behavior.

## Startup flags do not establish active HDR mode

The frozen adapter supplies `+mat_hdr_level 0`, but `launcher/launcher.cpp:1274` removes that parameter under `POSIX`; the WASM branch in `wscript:269` defines `POSIX=1`. The engine and shader-device defaults are **2** (`engine/matsys_interface.cpp:196`, `materialsystem/shaderapidx9/shaderdevicedx8.cpp:562`). Actual mode still depends on restored configuration, `GetHDREnabled()`, hardware support, and the loaded map.

`materialsystem/shaderapidx9/hardwareconfig.cpp:1241` gates active HDR on the current cvar and map state. Integer HDR additionally requires actual `GL_EXT_texture_norm16` support (`togles/linuxwin/dxabstract.cpp:1209`, `materialsystem/shaderapidx9/shaderdevicedx8.cpp:1051`). `SetToneMappingScaleLinear` at `materialsystem/shaderapidx9/shaderapidx8.cpp:13147` uses output scale **1** in LDR and the supplied scale in HDR; its lightmap/reflection scales also change with mode. Thus neither HDR nor a broken exposure value should be assumed from the adapter arguments.

## Minimal next diagnostics

Keep v5's lightmap upload fix isolated. For a subsequent diagnostic build, emit one startup record and at most 16 distinct draw/texture records:

1. **Actual mode:** `mat_hdr_level`, `GetHDRType()`, `GetHardwareHDRType()`, `GetHDREnabled()`, `mat_fullbright`, `mat_monitorgamma`, `r_shader_srgb`, norm16/decode extension flags, and the four tone-map scale values when they change.
2. **G-Man and first world draws:** pixel-shader name/combo, requested sRGB-write bit, applied `flSRGBWrite`, target ID/format and attachment color encoding. Query default framebuffer and texture FBO attachments with their respective attachment enums. This distinguishes missing state propagation from duplicate encoding.
3. **Matching base texture and lightmap uploads:** label, D3D format, sRGB flag, final GL internal/data format/type, dimensions, and a bounded sample before conversion. Compare with the corresponding owned material/texture bytes. Base textures normally request `TEXTUREFLAGS_SRGB`; the DXT fallback preserves the sRGB internal format, so compressed fallback alone does not prove a missing decode.

The RGBA16-to-byte fallback and BGRA reinterpretation in `cglmtex.cpp:3338` remain secondary suspects requiring an actual affected upload. Global brightness reduction would hide these distinctions. Hardware gamma-ramp calls reach SDL (`appframework/sdlmgr.cpp:2188`); successful browser correction must not be inferred from the call alone.

## Diagnostic candidate, 2026-09-07

The authored [diagnostic patcher](scripts/apply-brightness-diagnostics.py) and four `patches/files/source_wasm_brightness_*` helpers are applied to the private reference tree. They emit bounded `[source-brightness]` mode, upload and draw observations without changing rendering state. Separate quotas reserve G-Man and world records after menu activity; draw labels inspect only active fragment samplers. The new uniform query is appended to the entry-point structure, preserving every existing field offset used by frozen modules. Unknown source anchors, later entry-point fields and changed tone-map register assumptions are rejected before mutation.

The isolated preview at `http://127.0.0.1:33028` uses frozen **v5b**, replacing only `libtogl.so` and `libshaderapidx9.so`. Its artifact directory is `/home/ted/.local/share/source-wasm/hl2-side-63f8364-20260907/adapter-module-v6gamma`; the exact HTTP receipt is `/home/ted/.local/state/hl2-resume-20260907/hl2-modular-v6gamma-proof-20260907-http-receipt.json`. The server, launcher, owner data and frontend match v5b, excluding pending server-registration, audio and persistence work. All 26 WASM files validate; all 27 native assets match their served hashes, and raw/base64 owner ranges and cross-origin isolation pass. The [three focused tests](test/brightness-diagnostics.test.mjs) cover quota behavior, patch atomicity/idempotence, entry-point placement and absence of render-state writes.

At diagnostic staging, browser observations were still required before attributing the pale image to a particular conversion. This candidate changes no gamma or exposure values. Texture observations report formats and dimensions rather than copying owner pixel payloads into logs; each category stops after its quota, so absence of a later texture label is not evidence that it was never uploaded.

## Confirmed runtime cause and correction

The private `browser/side-v6gamma-opening.json` captures G-Man's face, eyes, briefcase and suit with `requestedSRGB=1`, **`appliedSRGB=1`** and **`encoding=0x8c40` (`GL_SRGB`)** on FBO 17. World lightmapped draws also show this combination on FBOs 17 and 150. Thus the shader and attachment both encode the same output. Actual mode is LDR (`hdr=0`, `fullbright=0`, output tone scale 1); the monitor gamma remains 2.2. G-Man's base texture upload is correctly marked sRGB while its normal texture is linear. These observations identify duplicate output conversion as a concrete cause of the washed-out image, rather than establishing an exposure or owner-data defect.

[apply-srgb-write-patches.py](scripts/apply-srgb-write-patches.py) removes the forced link-time value and sets the uniform at draw time: use software encoding only when the pass requests it and the actual attachment is linear. An sRGB attachment performs the conversion itself. The patch preserves texture storage, shader bodies, HDR settings and exposure. Each FBO owns its encoding cache; color reattachment, layout changes and context reset invalidate it. A separate cache belongs to the default framebuffer's context. Cache members are appended, preserving existing member offsets, and unchanged draws make neither a new encoding query nor an unnecessary uniform write.

The correction preview is **`http://127.0.0.1:33032`**, container `hl2-modular-v8srgb-proof-20260907`. It uses the frozen **v7 audio/persistence** base and matching `c71f607c…` adapter, replacing only `libtogl.so` and `libshaderapidx9.so`; it retains the v5b server. Bounded monitor and brightness observations remain present. Artifacts: `/home/ted/.local/share/source-wasm/hl2-side-63f8364-20260907/adapter-module-v8srgb`. Receipt: `/home/ted/.local/state/hl2-resume-20260907/hl2-modular-v8srgb-proof-20260907-http-receipt.json`. All 26 WASM files validate; all 27 served native hashes and owner range checks pass. The [sRGB tests](test/srgb-write.test.mjs) cover target/program/request transitions, cache lifecycle, failed queries, repeated draws, and patch guards.

The root agent's Chrome comparison accepted this correction: `browser/side-v8-fixed-opening.json` records G-Man's face at `requestedSRGB=1`, **`appliedSRGB=0`**, `encoding=0x8c40`, with matching world/menu behavior. The paired `side-v8-fixed-opening.png` shows substantially less washed-out facial shading. The normal build now applies/verifies the sRGB patcher, and the reference registry includes `target-aware-srgb-writes`; shell syntax, reference JSON and the private patch check pass. Brightness/sRGB tests are included in the normal test command.

This change removes the demonstrated duplicate conversion. It does not make WebGL's hardware conversion on an sRGB attachment switchable for a pass requesting sRGB writes off. Shaders without the suffix, including `engine_post`, remain untouched; any residual post-processing brightness requires separate evidence.

## Remaining post-processing and requested-off paths

The exact source does **not** establish that `engine_post` always encodes its own output. `Engine_Post_dx9.cpp:90–103` chooses `LINEAR_INPUT`, `LINEAR_OUTPUT` and forced sRGB reads/writes only for `IsOSX()`. That is false in this WASM build (`public/tier0/platform.h:164`). Observed `r_shader_srgb=0` makes `NeedsShaderSRGBConversion()` false (`hardwareconfig.cpp:892`), selecting `CONVERT_TO_SRGB=0`; `common_ps_fxc.h:287–310` then makes `SRGBOutput` the identity. Consequently the WASM path selects zero for all three conversion combos.

The concrete residual concern is the **space in which effects run**. `Engine_Post_ps2x.fxc:393–428` expects gamma-space AA, bloom addition and color-correction lookup, with optional conversions around that work. Runtime reports `srgbDecode=0`; `public/togles/linuxwin/cglmtex.h:416` can only disable texture decoding when that extension exists, and the alternative texture-mismatch handler is OSX-only (`glmgr_flush.inl:275,309`). Thus an sRGB input texture still decodes automatically despite a requested-off sampler. An sRGB output attachment encodes automatically. These conversions can cancel for an otherwise plain copy; AA, bloom and lookup-table operations between them may differ from the intended gamma-space behavior. This is a source-supported compatibility risk, not proof of current residual brightness. Existing draw quotas may fill the shared post/RT category before `engine_post`; absence from those logs does not prove it did not run.

| Requested-off path | Concrete behavior and remaining scope |
| --- | --- |
| `DecalModulate_dx9.cpp:73–79` | Deliberately requests no sRGB reads/writes and blends with destination/source color in gamma space. Automatic attachment conversion and linear-space blending can differ. The fix removes the extra software encoding but does not emulate that legacy blending model. |
| `introscreenspaceeffect.cpp:49–68` | Its compensation for mandatory sRGB texture reads is OSX-only. For `ENABLESRGB=0`, WASM omits that adapter; a visible difference must be tied to the actual material/combo before changing it. |
| `eyeglint_dx9.cpp:49`, linear framebuffer transitions in `TransitionTable.cpp:503–515` | Requested-off draws to a genuinely linear attachment now correctly keep software encoding off. An sRGB target would require a separate target-allocation/state investigation. |
| Color clears in `shaderapidx8.cpp:11837–11848` | The engine temporarily requests sRGB writes off for clears. The new draw-time uniform logic does not change `glClear`; this remains outside its scope. |
| `r_shader_srgb=1` in `hardwareconfig.cpp:892` and `TransitionTable.cpp:523–528` | Selects shader-baked conversion while requesting hardware writes off. This differs from the observed setting of zero and is not corrected by controlling the translator suffix. |

No post-process, blend, sampler or clear behavior was patched during this audit. The accepted normal-build wiring is also preserved as `/home/ted/.local/state/hl2-resume-20260907/srgb-normal-build-wiring.patch`.

## Stopping-point status, 2026-09-08 UTC

The user subsequently confirmed that the station remained **too dark** on the next comparison. The intermediate duplicate-conversion correction remains supported by measured draw state, but overall brightness is unresolved. A separate actual Chrome probe reproduced a final-presentation loss: blitting an sRGB attachment containing encoded gray 118 to the linear default framebuffer produced gray 46 with no GL error. See [the final-presentation audit](FINAL-PRESENTATION-AUDIT.md) for the conditional transfer correction and its validation status. This is separate from changing global gamma, exposure or intermediate texture formats.

The combined diagnostic build is frozen privately at `/home/ted/.local/share/source-wasm/hl2-side-63f8364-20260907/adapter-module-v11timing-input`, based on the repaired `v10scene-token` baseline. Only engine, client and ToGLES modules differ. It adds bounded mouth/callback/frame timing, active sampler-read observations and final-presentation encoding records; all 26 WASM assets validate and three focused diagnostic regression tests pass. No preview was started and no runtime timing conclusions were drawn. The user's stopping-point instruction prohibits further Chrome testing; mouth timing and deeper sampler/post-process audits are deferred. The shipping candidate can retain the repaired baseline engine/client and select the separately validated final-presentation module.
