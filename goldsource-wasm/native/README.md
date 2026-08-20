# Patched Xash core

`xash-framework.wasm` is the Xash3D-FWGS 1.2.2 core rebuilt from native
commit `f85aa0c8f7d46c27191132b44d872c8e331308de`, the exact native revision used
by the locked `xash3d-fwgs` package. The focused patch exports synchronous
browser-framework state, capture-intent, player-name status, menu-pointer,
pointer-lock, and controller-input seams. It changes only browser I/O bridging;
simulation, networking, menu content, and renderer behavior remain native.

Rebuild it with the original package toolchain:

```bash
XASH_SOURCE_DIR=/path/to/xash3d-fwgs ./scripts/build-xash-framework.sh
```

The script rejects any other native revision and uses the package's original
Emscripten 4.0.23 container. All recursively pinned source submodules must be
initialized. The resulting core remains covered by the Xash3D-FWGS GPL notice;
see `THIRD_PARTY_NOTICES.md`.
