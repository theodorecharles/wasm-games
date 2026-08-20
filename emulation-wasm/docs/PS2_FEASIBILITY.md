# PlayStation 2 feasibility gate

PlayStation 2 in a browser is technically credible, but it is not a short host
port and this repository does not treat a successful link or boot logo as a
playable milestone.

## Evidence for the source choice

The locked Play! 0.77 tree has a native `PlayCore` target and a WebAssembly
code generator in its pinned CodeGen dependency. Its primary build
documentation also identifies Emscripten as a supported target. This is strong
evidence that the emulator internals can live in a WASM process.

This repository deliberately excludes Play!'s `Source/ui_js`,
`js/play_browser`, and generated browser artifacts. Those paths prove source
viability but are not this project's host, adapter, UI, or packaging. The new
host must link the native EE, IOP, GS, input, audio, state, save, and disc-image
components through `engine/include/emulation_host.h`.

## Hard gates

1. **Guest-code invalidation:** Play!'s own browser notes warn that memory-page
   write protection is unavailable, so games that replace EE modules may leave
   generated code stale. The native host needs an explicit dirty-range
   invalidation path and a repeatable module-reload test.
2. **Floating-point behavior:** browsers do not expose the native floating-point
   environment used by desktop builds. At least one FPU-heavy title must be
   compared frame-by-frame against a native Play! run before compatibility is
   claimed.
3. **Disc access:** multi-gigabyte images cannot be copied into MEMFS or eagerly
   cached in linear memory. The framework must provide bounded random reads
   backed by OPFS or validated HTTP ranges, and the host must adapt that handle
   to Play!'s disc-image layer.
4. **Address-space pressure:** the first target is wasm32. Heap growth, GS
   surfaces, generated-code storage, audio queues, states, and media caches need
   separate budgets. A disc image must never count against this heap.
5. **Graphics:** the new host must connect Play!'s native GS/OpenGL renderer to
   a WebGL 2 context without importing `GSH_OpenGLJs`. Shader translation,
   framebuffer formats, context loss, resize, and fullscreen exit all need
   isolated tests.
6. **Threads and audio:** the native core and graphics path use worker-friendly
   execution, but a threaded deployment requires cross-origin isolation. A
   single-origin framework image must emit the correct headers, and audio must
   remain stable through suspension, controller prompts, and tab visibility
   changes.
7. **Persistent state:** memory cards, configuration, and states must attach and
   restore before boot. Their flush lifecycle is independent of disc caching.
8. **Performance:** one representative 3D game must sustain usable input,
   graphics, and audio over a ten-minute run on the minimum supported desktop.
   A menu or boot screen does not satisfy this gate.

## Ordered proof targets

1. Build `PlayCore` and CodeGen for Emscripten without an executable UI target.
2. Link a new headless host that boots the high-level system implementation.
3. Run the CodeGen tests and a guest module-reload invalidation test.
4. Read ISO9660 sectors through a synthetic bounded random-access provider.
5. Render a GS test through the repository-owned WebGL 2 seam.
6. Attach framework controller snapshots and persistent memory cards.
7. Boot one disc and collect frame-time, heap, cache, and audio-underrun data.

Until all seven targets pass, `ps2-wasm` remains **Still in development** and
`scripts/build-images.sh` must reject it.
