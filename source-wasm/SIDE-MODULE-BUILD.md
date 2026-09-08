# Private Source side-module build

`scripts/build-side-modules.sh` builds a pinned HL2 baseline with separate client, server, engine and support wasm modules. It requires a private source checkout and private output directory outside this repository. It neither applies the existing monolithic patcher nor downloads game data.

The final-presentation patch is applied and checked by the normal build. It uses a cached fullscreen transfer only when actual runtime queries report an sRGB source and linear default framebuffer, preserves alpha and GL state, and retains the original blit on unsupported or failed paths. See [the final presentation audit](FINAL-PRESENTATION-AUDIT.md) for the frozen v12 composition, automated C++/headless GLES validation, and the explicit deferral of final Chrome testing at the user's request.

The reference is [weliveinhell/source-engine at 63f8364](https://github.com/weliveinhell/source-engine/tree/63f8364fe7b22b239e72dfb5f1024665b3a91567). That port was tested upstream with Portal; compiling its HL2 targets does not establish working HL2 gameplay. Source, submodule, SDK and patch hashes are recorded in `side-module-reference.json`.

## Prepare the private inputs

Use a separate checkout at commit `63f8364fe7b22b239e72dfb5f1024665b3a91567`, with its three submodules at the recorded gitlinks. Do not use the recovered monolithic source tree. No native source or generated artifacts belong in this repository.

The supported toolchain is the exact image:

```text
emscripten/emsdk:4.0.9@sha256:3c853ef9c3b4c2708da1adac2fdfdba49c775fdc4144ceef4989423963e96811
```

Inside a fresh container, mount the private source at `/source-engine`, this repository read-only at `/wasm-games`, and a private output directory at `/private-output`. Install the utilities and run the SDK preparation script. It applies the reference patches plus the worker message-box fix; the build script verifies the resulting file hashes.

```sh
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends git curl wget python3 xz-utils llvm binutils pkg-config patch
git config --global --add safe.directory /source-engine
SOURCE_ENGINE_ROOT=/source-engine \
bash /wasm-games/source-wasm/scripts/prepare-side-module-sdk.sh
```

The SDL audio change dispatches AudioContext access to the main thread. The SDK's `SDL_ShowSimpleMessageBox` also ran browser `alert` inside the worker, hiding startup failures behind `alert is not defined`. The preparation script sends that message to the main thread's `err` handler instead, preserving `Module.printErr` reporting. The reference WebGL patch permits the write mapping flags used by ToGLES while preserving rejection of read maps. These are SDK changes, not generated-engine patches. Other versions must be evaluated separately; the script deliberately rejects them.

## Build or relink

Within that prepared container:

```sh
SOURCE_ENGINE_ROOT=/source-engine \
SOURCE_WASM_WEB_DIR=/private-output/hl2-side \
SOURCE_WASM_JOBS=12 \
bash /wasm-games/source-wasm/scripts/build-side-modules.sh
```

The script runs Waf directly with `--notests -4 --togles --emscripten --build-games=hl2`. Its default build directory is `/source-engine/build-side-hl2`; `SOURCE_WASM_BUILD_DIR` can select another private directory. The reference `emscripten/pkgconfig` directory supplies the SDL configuration. Neither `emscripten/build.sh` nor its Portal pre/post scripts are modified or used.

Before building, `apply-side-module-patches.py` installs the authored module-name helper and patches the private loader at two checked anchors. It resolves `/game/bin/filesystem_stdio.so`, mod-relative paths and backslash paths to the preloaded basename. The upstream loader only removed an initial `/bin/`, which broke the adapter's absolute VFS paths. Patch application is idempotent and rejects unknown contexts; `--relink-only` verifies that the native patch is already present.

The build also applies `apply-thread-bridge.py`. Its authored engine code publishes native state and receives commands through a shared-memory mailbox drained on the engine thread. The SDL wrapper defers pointer-lock ownership to the framework. This bridge is separate from the old monolithic exports and requires the matching adapter callbacks before `callMain`.

`apply-render-target-depth-patches.py` reports mixed-size framebuffer attachments as unsupported on WebGL. This selects Source's existing separate-depth allocation for targets smaller than the backbuffer. A native camera diagnostic showed a 256×256 color target attached to a 1280×720 depth buffer, yielding `FRAMEBUFFER_INCOMPLETE_DIMENSIONS`. The separate-depth path allocates from the color target's actual dimensions; desktop capability reporting, camera behavior, texture quality, and targets without depth are preserved.

`apply-renderer-address-patches.py` corrects two active ToGLES address paths. WebGL indexed draws apply the signed base vertex once to each stream's byte offset and invalidate cached attributes when the base changes. Explicit D3D declaration offsets are preserved, including aliased compressed normal/tangent data and gaps. The authored address helper checks widened arithmetic before narrowing; negative bases remain valid when compensated by stream offsets. Invalid buffer addresses produce a specific native error. The patch targets `public/togles`, which is the header namespace used by the GLES renderer.

`apply-texture-upload-patches.py` preserves writable dynamic texture contents across Emscripten's transient PBO maps. Ordinary lightmap updates lock a whole page but change only selected rectangles; the reference SDK otherwise uploads uninitialized allocation bytes over the remaining page. A texture-owned CPU shadow restores and captures complete slices around the existing map/unmap operations, without GPU readback. It is allocated once at the texture's storage size, zeroed on creation or resized storage, and freed by its owner. Mapped rectangle locks return the rectangle's byte offset with the full-page pitch; uploads set matching row length and skips, then restore all modified pixel-store state. Full mapped texture uploads pass PBO offset zero, never a freed heap pointer. This adds one CPU backing allocation per writable non-render-target dynamic texture and two slice copies per lock; it leaves texture precision, HDR, facial flex and dynamic lighting enabled.

`apply-srgb-write-patches.py` removes duplicate output conversion observed on G-Man and world draws. Software sRGB encoding is enabled only when requested and the bound attachment is linear; sRGB attachments perform their own conversion. Per-FBO and default-framebuffer caches avoid repeated encoding queries, with invalidation on attachment/layout changes and context reset. Uniform updates occur only when the active program's value changes. Cache fields are appended to preserve existing member offsets. Texture formats, HDR, exposure and shader bodies remain unchanged. WebGL still cannot switch off automatic hardware conversion on an sRGB attachment; post-processing and gamma-space blend paths require separate evidence before further changes. See [HL2_GAMMA_AUDIT.md](HL2_GAMMA_AUDIT.md).

`apply-server-cvar-patches.py` restores the server's normal `InitializeCvars` registration, which the reference disabled under Emscripten. Without it, skill configuration commands cannot set server health, damage and pickup variables; NPC health defaults can remain zero through a scripted sequence. The fix registers existing variables through their existing server accessor before game-system initialization. It does not replace skill values or damage behavior. Registration restoration currently exposes a startup crash: a later libserver static constructor overwrites `ai_task_pre_script` after its valid construction. The current default build is an investigation candidate until the corrupting initializer is fixed; do not ship it or skip the damaged variable. See [HL2_RUNBOOK.md](HL2_RUNBOOK.md) for frozen playable candidates and current evidence. After the initialization fix, verify with a fresh game: saves made with zero-health NPCs may retain that state.

`apply-audio-contract-patches.py` keeps SDL's application callback at the engine's fixed 44100 Hz, signed 16-bit stereo format. The reference allowed SDL to change that format, while the engine continued filling a signed-16 ring buffer. Emscripten SDL selects 32-bit float output and the browser's native rate; accepting those changes suppresses SDL's conversion stream and makes the backend interpret PCM bytes as floats. Disallowing callback format changes enables the existing SDL conversion/resampling path. One startup log records the requested and obtained callback formats. DSP behavior and codecs are unchanged by this patch.

To repeat only the main-module link and staging after a successful side-module build:

```sh
SOURCE_ENGINE_ROOT=/source-engine \
SOURCE_WASM_BUILD_DIR=/source-engine/build-side-hl2 \
SOURCE_WASM_WEB_DIR=/private-output/hl2-side-relink \
bash /wasm-games/source-wasm/scripts/build-side-modules.sh --relink-only
```

The output contains `source-engine.js`, `source-engine.wasm`, exactly 25 matching `.so` wasm modules, the pin manifest and `SHA256SUMS`. Keep the entire set together. The SDK emits no separate worker file: pthread workers load the same JavaScript entry point. `MAIN_MODULE=1` exports native symbols required by dynamic linking, including the main entry; explicit `EXPORTED_FUNCTIONS` is unnecessary in that mode.

The modular factory is `createSourceEngineModule`. It exports `FS`, `IDBFS`, `callMain`, `ccall`, `cwrap`, `PThread`, `HEAPU8` and `HEAP32`, with `Module.sourceWasmRuntime = 'pthread-side-module-v1'`. Pass `noInitialRun: true`, mount the owned data tree, install `Module.downloadMap`, and only then call `callMain`.

## Browser contract and limits

- Use a canvas with `id="canvas"`; the link transfers `#canvas` to the engine worker. Serve COOP/COEP isolation headers for shared memory.
- `locateFile` must resolve `.so` names as well as the main `.wasm`, all from the same artifact set.
- Native `FindMap` sends `Module.downloadMap(lockWordIndex, mapName)` to the main thread and waits. The handler must release valid locks through `Atomics.store(Module.HEAP32, lockWordIndex, 0)` and `Atomics.notify`, including when reporting a missing map.
- Emscripten's JavaScript filesystem lives on the main thread and worker file syscalls proxy there synchronously. Lazy synchronous network reads still block the UI; this build does not solve asset packaging or prefetching.
- The reference uses a fixed 2047 MiB shared heap, eight pooled workers and a 4 MiB stack. Emscripten warns that combining pthreads and dynamic modules is experimental.
- Install `sourceWasmBridgeReady`, `sourceWasmState` and `sourceWasmCommandResult` callbacks before starting the native main function. Native state and command acknowledgments arrive through these handlers; engine commands must use the shared mailbox. The legacy direct state/command exports are not linked.

The first private build compiled under exact SDK 4.0.9 without compiler compatibility fixes. Browser startup then exposed the module-path and worker-message-box failures above. The corrected candidate completed both the full build and relink-only path; all 26 wasm binaries passed `WebAssembly.validate` and generated JavaScript passed `node --check`. These checks establish build integrity, not map rendering, gameplay, audio or save correctness.

The focused regression checks compile the authored C++ helper against absolute, relative and mixed-separator module paths, and verify patch idempotency and rejection of unknown source contexts:

```sh
node --test source-wasm/test/side-module-name.test.mjs
node --test source-wasm/test/renderer-address.test.mjs
node --test source-wasm/test/texture-upload.test.mjs
bash -n source-wasm/scripts/build-side-modules.sh source-wasm/scripts/prepare-side-module-sdk.sh
```

The renderer test uses synthetic indexed geometry and facial-delta streams with different strides, checks aliased declarations and padded extents, and exercises signed address boundaries under UBSan. Facial flex, eyes, teeth, game-system initialization and shader MOVA behavior are unchanged by these two address fixes. Stable facial animation still requires visible runtime verification.

The texture test poisons transient allocations and verifies full-page partial updates, nonzero-origin strided rectangles, untouched texels, full overwrites, separate slices, reallocation, destruction, and unpack-state restoration under AddressSanitizer and UBSan. The original failure was also reproduced by evaluating the exact retained SDK glue's map/unmap functions with a mock GL buffer: a 2×2 update of an 8×4 RGBA page replaced 112 untouched bytes with allocator poison. Native and browser checks remain necessary to establish the complete rendering result.

The scene parser patch keeps tier3's parser class and instance inside an anonymous namespace while preserving its public wrapper functions. The game modules contain a different parser with the same original class/global names and a smaller object layout. With the reference build's multiple-definition linker option, tier3's 256-byte delimiter-table initializer previously wrote beyond the game parser into neighboring server variables and scene data maps. Both client and server must be rebuilt; server ConVar registration is restored in conjunction with this fix. The authored two-translation-unit regression reproduces the overwrite and verifies separate parser storage, dispatch, and state with ASan/UBSan after isolation. Private constructor traces identified the writer; temporary trace code is excluded from normal builds.
