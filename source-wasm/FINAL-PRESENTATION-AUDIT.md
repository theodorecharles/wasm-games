# Final presentation encoding audit

The user reported an overly dark image in v8/v9 after the demonstrated duplicate scene-output encoding was removed. The final **v12present** candidate adds a conditional presentation transfer while preserving that scene correction. The user then explicitly requested deployment and stopping, with **no more Chrome testing**. Final-release Chrome verification is deferred; the automated checks and runtime guard below define the stopping point.

The pinned native path is `IDirect3DDevice9::Present` → `GLMContext::Present` → `GLMContext::Blit2` with a null destination texture. `gl_blitmode` defaults to 1. Blit2 binds the source as the read framebuffer and framebuffer 0 as the draw framebuffer, selects `GL_BACK`, then calls `glBlitFramebuffer`; equal dimensions select `GL_NEAREST`. The active Wasm `CSDLMgr::ShowPixels` subsequently swaps the SDL window. Source locations are `togles/linuxwin/dxabstract.cpp:2930`, `togles/linuxwin/glmgr.cpp:906`, `:1176`, `:2204`, and `appframework/sdlmgr.cpp:1218` in the private pinned tree. Line numbers can move as diagnostics are applied.

[OpenGL ES 3.0.6 §4.3.3, printed page 197](https://registry.khronos.org/OpenGL/specs/es/3.0/es_spec_3.0.pdf) specifies decoding when the read attachment is sRGB and destination sRGB conversion during blits. Section 6.1.13 makes the default framebuffer's encoding implementation-dependent. [WebGL 2.0's blitFramebuffer definition](https://registry.khronos.org/webgl/specs/latest/2.0/#3.7.4) references this ES section. Therefore sRGB-to-linear presentation can leave linear numeric values in the canvas. Nearest filtering does not disable that conversion.

The root agent's separate Chrome WebGL2 probe on port 33038 measured this browser's behavior: rendering linear gray 0.18 into an sRGB attachment produced byte value 118, while blitting into the linear default framebuffer produced 46. Queried encodings were `0x8c40` and `0x2601`, with no GL errors. The private probe is `/home/ted/.local/state/hl2-resume-20260907/gamma-probe/index.html`. This establishes browser behavior; the engine's actual final attachments still require the native observation below.

[apply-present-diagnostics.py](scripts/apply-present-diagnostics.py) inserts a query immediately before Blit2's final operation, after framebuffer selection and filter adjustment. Only color blits to the backbuffer qualify. It records the actual read/draw bindings, selected buffers and attachment encodings alongside source texture/renderbuffer IDs, format, flags, size, rectangles, filter and resolve information. It makes no GL state writes, reads no pixels, consumes no GL error flags, and stops after eight distinct configurations. Unknown query results remain zero in the log. No new native structure members or GL entry points are needed.

The [focused tests](test/present-diagnostics.test.mjs) compile the actual snippet against a query-only GL interface. They cover distinct read/default encodings, absent buffers, unknown results, scaling filters, 100,000 repeated/offscreen calls, the finite query budget, preservation of existing diagnostic hooks, and strict patch planning without partial writes.

Apply and verify against the private pinned source with:

```sh
python3 scripts/apply-present-diagnostics.py "$SOURCE_ENGINE_ROOT"
python3 scripts/apply-present-diagnostics.py --check "$SOURCE_ENGINE_ROOT"
```

This diagnostic makes no presentation compensation. The separate production patch below implements the conditional transfer.

## Implemented conditional correction

[apply-present-transfer-patches.py](scripts/apply-present-transfer-patches.py) replaces the final transfer only when actual runtime queries report an sRGB read attachment and a linear default draw attachment. Its fullscreen triangle samples the resolved source with a dedicated sampler, applies the standard piecewise sRGB output transfer to RGB, and preserves alpha. Other read/draw encoding combinations retain their existing blit. The Y flip and nearest/linear scaling choice are preserved. The supported path is the full-source, 2D, mip-zero presentation used by `Present`; offscreen and partial-source copies retain their original behavior.

The program, empty VAO and two filtering samplers are cached per GL context in a private registry, preserving public native class layouts. Context destruction deletes the resources and encoding cache before window teardown. Encoding cache keys include source identity, allocation metadata and resolve mode. Unresolved queries disable the correction for that context. Shader compile/link or resource-creation failures release partial resources and issue one diagnostic, retaining the original visible blit.

The helper exactly restores the current program, VAO, active texture unit, unit-zero texture and sampler, viewport, color masks, and all nine raster capabilities it temporarily changes, keeping the engine's caches accurate. Dedicated samplers preserve source texture parameters. The correction uses no vertex/index buffer or CPU image readback.

For multisampled final color presentation, the patch selects the engine's existing two-step resolve-to-texture path. The helper refuses unresolved renderbuffers. Native MSAA presentation has not been visually tested. Unsupported filters, nonpositive dimensions, partial-source/mip/face paths, and query/resource failures retain the original blit.

The [automated tests](test/present-transfer.test.mjs) passed: transfer-function boundaries and monotonicity, linear gray 0.18 → byte 118, state restoration from non-default bindings, 10,000 repeated frames without resource recreation or repeated encoding queries, partial initialization failures, context deletion/recreation, encoding transitions, and scaling selection. A separate [headless EGL/GLES3 test](test/present-transfer-gles.py) compiled the actual authored GLSL and verified encoded gray 118, RGB values, exact alpha and Y flip. It uses no Chrome or browser. The pinned Emscripten build and WebAssembly validation passed.

The frozen artifact is `/home/ted/.local/share/source-wasm/hl2-side-63f8364-20260907/adapter-module-v12present`. Only `libtogl.so` differs from parser-fixed `adapter-module-v10scene-token`; its SHA-256 is `fe417d47ee64281bb63e2494916f7d8955225c870e105e322094a34642e894c4`. It preserves the fixed engine/client/server, corrected audio, matching camera depth, and `c71f607c…` adapter. Unmeasured v11 facial and sampler-input diagnostics are excluded. `candidate.json` and `SHA256SUMS` record the composition; the inherited side-module reference describes its frozen base, with this additional transfer recorded in the candidate receipt. Future normal builds now apply/check the transfer patch and include `final-srgb-presentation` in the authored reference.

No final native Chrome image comparison or native presentation-encoding log was collected after the user's stop-testing instruction. The earlier standalone Chrome probe supports the diagnosis; the new correction also checks actual runtime attachment encodings. Final appearance and native MSAA acceptance are deferred to a later explicitly authorized session.
