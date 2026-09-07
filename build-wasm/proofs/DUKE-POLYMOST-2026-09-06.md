# Duke Polymost bring-up — 2026-09-06

Historical bring-up checkpoint. See [visible-renderer progress](DUKE-VISIBLE-2026-09-06.md)
for subsequent matrix/texture/projection repairs and the recovered skyline.

Status at this checkpoint: **in progress, not Modernized acceptance and not deployed**. The live
Classic service remains unchanged. The isolated GPU build advances beyond two
native startup traps, shader compilation failures, and a first-frame JavaScript
exception. Its loop now advances, but the menu image is still completely black.
Do not mark the requested widescreen/OpenGL/mouselook profile complete.

## Verified changes

- `polymost_initdrawpoly` guards sync-object cleanup with the actual capability.
  Initial Chrome probe traps at its unconditional `glIsSync`; the guarded build
  gets past that call and exposes the next missing function. Exact-method
  native ASan/UBSan and Wasm SAFE_HEAP/UBSan tests pass 32 cases, with 16 expected
  failures when the guard is removed.
- Four fog functions are bound directly to the SDK's existing implementations.
  Emscripten 6.0.6 implements them in `libglemu.js` but omits them from its proc
  lookup. Chrome's second trap is the `glFogi` call in video setup. The repaired
  build starts audio and the game loop. The actual GLAD loader plus actual SDK
  fog functions pass eight state checks; removing the bindings fails.
- A renderer-scoped JS library converts the two Polymost shaders to ESSL 3,
  retaining palette lookup, gradients, detail/glow, fog, and color correction.
  It uses the fixed-function bridge's attribute/uniform names without replacing
  SDK or WebGL methods. Basic and extended pairs compile/link on AMD and
  llvmpipe; the original desktop versions fail those checks. A reserved macro
  introduced by the first translator attempt was reproduced and corrected.
- The browser path keeps linked shader attachments. The SDK's first-draw
  renderer initialization requires their metadata even after linking. The old
  detach path throws while reading the first shader's `type`; the repaired
  Chrome build advances beyond one frame without that exception. Native
  `glDeleteShader` calls still mark attached shaders for eventual deletion with
  their program. Desktop detachment is unchanged.
- The cooperative frontend now clears the black fade left by `G_DisplayLogo`.
  This corrects a missing transition but **does not itself fix the black image**.
  It is folded into the existing Duke browser patch because layering an edit
  inside that patch's large added function broke the preparer's reverse-check
  idempotence. The repaired ordered series passes the exact source audit.

## Browser observations and isolated services

All captures use the existing Chrome-control connection, real Play clicks,
DOM-authored telemetry/logs, and screenshots. No engine globals, browser storage,
synthetic input, or browser-security changes were used for browser control.

| Port | Probe | Observed result |
| --- | --- | --- |
| 18007 | Live Classic baseline | Native menu and Hollywood Holocaust; actual left click changes pistol ammo 48 to 47; Escape menu |
| 32963 | Initial GPU | `glIsSync` null-function trap |
| 32964 | Sync guard | Past sync reset; `glFogi` null-function trap |
| 32965 | Fog bindings | Loop starts; desktop shader compilation fails |
| 32966 | First ESSL translator | Reserved `GL_` macro rejected |
| 32967 | Corrected ESSL | Shader errors gone; first frame stops |
| 32968 | Error-log observer | Missing attachment metadata exception captured |
| 32969 | Attachment repair | Loop advances; image black |
| 32970 | Frontend fade repair | Loop advances; image still black |
| 32971 | Draw-state observer | Driver errors and zero texture-matrix uniforms recorded |

Files `duke-modern-classic-*` contain the four baseline pairs. The nine
`duke-polymost-*` observation pairs retain the failures as well as progress.
[Evidence audit](duke-polymost-evidence-2026-09-06.json) checks 13 pairs and
33 hashes and explicitly records `modernizedAccepted: false`.

The current non-draw-observer candidate is
`duke-polymost-frontend-proof-20260906` on 32970, image
`sha256:bb09663de0205d81561ec71aa8f144af7f16c8e4752c0cb46a3dfbf1f3dafcb8`.
Its [package audit](duke-polymost-frontend-package-2026-09-06.json) verifies that
only Duke JS/Wasm differ from live; 19 other installed files are identical.
The retained adapter is the live adapter, not the separately modified source
adapter. Both packages retain the old Classic-only launcher description.

The draw observer is `duke-polymost-draw-proof-20260906` on 32971, image
`sha256:0761cd6d4c20bce9bbe2325513344985163feedbc0cf84cfa420b3530986fb19`.
Its [package audit](duke-polymost-draw-package-2026-09-06.json) confirms the same
native Wasm as 32970 and a JS-only diagnostic addition. It consumes GL error
flags and **cannot be used for gameplay acceptance**. Each package mounts only
the Duke owner-data directory read-only, has a read-only root, and binds localhost.

## Exact next investigation

The [draw trace](duke-polymost-draw-trace-2026-09-06.json) reports driver errors
while processing texture uploads/vertex setup. Its current hook reads errors
after the observed call, so an error may originate in an earlier unobserved call;
do not yet claim a specific texture format caused it. Improve attribution with
pre-call error reporting and bounded numeric argument logging.

All six captured draws have an entirely zero `u_textureMatrix0`, despite valid
modelview, projection, rotation, and color-correction uniforms. In the installed
SDK, renderer texture-matrix versions and initial matrix versions start at zero;
the upload is conditional on a version change. Test explicit browser texture
matrix initialization (through normal GL calls) against the retained negative
case. Also check the native `GL_RED` texture allocations and upload dimensions
against actual WebGL errors. Do not hide errors, disable effects, or substitute
software rendering for the requested GPU profile.

After visible rendering works: verify the first level, real firing, pitch/yaw,
pause/resume, save/full-reload, then implement the selectable widescreen
Modernized profile while preserving Classic. Blood's crash remains deferred;
RTCW SP remains protected and untouched. No live service changed in this work.

## Reproduce the current source/build checks

The source pin is `f8639031546ccea8964c2d63c9d09944c8a4a67c`. The current
[source proof](duke-polymost-source-2026-09-06.json) compares 1,702 files and
records tree `61fb0d161fd207509733f4d39b1808244a0ccbc9` plus ordered patch hashes.

```sh
node build-wasm/scripts/test-source.mjs
node build-wasm/scripts/test-polymost-stream-reset.mjs
node build-wasm/scripts/test-polymost-fog-loader.mjs
node build-wasm/scripts/test-polymost-glsl.mjs
LIBGL_ALWAYS_SOFTWARE=1 node build-wasm/scripts/test-polymost-glsl.mjs
node build-wasm/scripts/test-variant-adapters.js
node build-wasm/scripts/verify-site-contract.js
node build-wasm/scripts/test-duke-polymost-evidence.mjs
node build-wasm/scripts/test-duke-modernized-package.mjs duke-polymost-frontend-proof-20260906 32970
```

Build with `scripts/build-duke-modernized-candidate.sh` inside the existing
`d3wasm-build-session` Emscripten 6.0.6 container, scoped Git trust for
`/src/build-wasm/.work/source`, and the existing 6.0.6 cache. It does not stage
Classic or Blood. `DUKE_POLYMOST_TRACE=1` adds the diagnostic draw observer.
The current `.work/duke-modernized/dist` is that **trace** build, not the 32970
candidate; do not promote it. Build logs are `/tmp/duke-modernized-build-20260906-*.log`.
All build/test processes from this checkpoint have terminated. Retain the
isolated containers and evidence; the owned Chrome tab is left blank afterward.
