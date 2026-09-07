# Quake 4 border sampling: software-driver discrepancy — 2026-09-05

Follow-up: [the September 6 mip-size repair](QUAKE4-BORDER-SIZE-2026-09-06.md)
isolates and fixes the large per-fragment size-query error. All 4,096
same-footprint comparisons now pass on old llvmpipe; nine smaller implicit-filter
differences still fail the unchanged strict gate. The record below is historical.

Status: unresolved platform-specific oracle failure; no shader changes or
relaxed expectations were made during the Doom 3 integration work.

Running the existing `test-q4-border-sampling.mjs` inside the Emscripten build
container exposed 14 mismatches in 128 isotropic border cases with Mesa 25.2.8,
llvmpipe/LLVM 20.1.2. The maximum channel difference is 117. The same-footprint
anisotropic implementations also show the discrepancy at anisotropy one:
[software-driver result](quake4-border-llvmpipe-2026-09-05.json).

The unchanged test on the host AMD Radeon 890M with Mesa 26.1.6 passes all 128
cases, maximum channel difference one:
[paired host recheck](quake4-border-amd-recheck-2026-09-05.json).

Full id Tech 4 staging passes on the host GPU, using a container wrapper for
Emscripten 6.0.6 compilation. This is not a software-renderer parity claim or
evidence that the llvmpipe discrepancy cannot affect browser rendering.
The driver/reference/fixture edge behavior still needs isolation. Existing
Chrome Quake 4 world/save-preview proofs remain historical observations of
their recorded runtime, not blanket acceptance across drivers.

Reproduce (repository root):

```sh
docker exec -u 0:0 -w /src/idtech4-wasm d3wasm-build-session \
  node scripts/test-q4-border-sampling.mjs
node idtech4-wasm/scripts/test-q4-border-sampling.mjs
```

The owned build container has EGL/GLES/Mesa packages installed for these tests.
The tests use actual surfaceless rendering, not Chrome or a screenshot mock.
