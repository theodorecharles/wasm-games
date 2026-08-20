# idtech4-wasm runbook

## Purpose

Maintain one repeatable id Tech 4 browser pipeline for Doom 3 SP/MP, Resurrection of Evil, Quake 4 SP/MP, and Prey (2006) SP. Keep the engine work at this family layer and let `wasm-game-framework` own the page shell, data provisioning, IndexedDB cache, identity/quality/fullscreen preferences, responsive canvas, input-capture lifecycle, PWA generation, service worker, and static container server.

Do not submit anything upstream. All work is local downstream work and all generated source checkouts have a disabled push URL.

## Exact inputs

`source-lock.json` is authoritative. A build must stop if the framework is not version `0.9.2` at commit `53bc7e6eeef1ae35dcf3b25dea4e3ec0ab46726f`. It must also stop if a native checkout or patch checksum differs from the lock.

The family repository stores neither complete source forks nor retail content. It reconstructs the browser ports by checking out exact native commits, verifying `patches/SHA256SUMS`, and applying the committed patch queues in `.work/`.

## Build flow

1. `scripts/fetch-sources.sh` creates detached dhewm3, openQ4, openQ4-game, and Prey2006 checkouts and disables their push URLs.
2. `scripts/apply-patches.sh` verifies and applies the three browser patch queues idempotently.
3. `scripts/build-all.sh` invokes the native Emscripten builds using the exact framework checkout.
4. `scripts/stage-site.sh` combines the engine artifacts, source-derived icons/background, exact data manifests, notices, and framework metadata. It asserts that no downstream HTML, CSS, web manifest, or service worker exists.
5. `scripts/build-docker.sh` builds the suite image and six locked variants.
6. `scripts/test-http.sh` checks all images, framework metadata, canonical bootstrap, WASM and PK4 range responses, and the `/data` denial contract.

## Data and security contract

Retail files exist only in the operator's `/data` volume and the user's browser cache. The static site contains no retail PK4. The server exposes validated file endpoints used by the framework, while `/data` and all descendants return 404. Do not add a static mount, symlink, copy, or image build context that can expose that volume.

The exact owner-file sizes and SHA-256 values live in the generated `wasm-game-data.json`. Variants share namespaces so SP and MP do not redownload identical files. Optional Quake 4 patch PK4s remain optional. RoE includes both its expansion files and the exact Doom 3 base set.

## Quake 4 source packages

The openQ4 build must create both source-derived packages under `baseoq4`:

| Package | Bytes | MD5 |
| --- | ---: | --- |
| `pak0.pk4` | 4,285,437 | `17550cb028326cdf1cee440bc5d73d74` |
| `pak1.pk4` | 641,646,791 | `c3434e1d28bebdc367d6e50f3b1fda3a` |

`pak1.pk4` supplies the SDK-derived runtime game content required by openQ4. Never weaken or bypass the engine's package validation. Build, staging, Docker, and HTTP checks must fail if either package is absent or corrupt.

## Runtime boundary

| Variant | Status |
| --- | --- |
| Doom 3 | Still in development |
| Doom 3 multiplayer | Still in development |
| Resurrection of Evil | Still in development |
| Quake 4 | Still in development |
| Quake 4 multiplayer | Still in development |
| Prey (2006) | Still in development |

Verified browser progress includes PK4 restoration, worker startup, a direct WebGL 2 `OffscreenCanvas` context, filesystem initialization, source game-module loading, declarations, configuration, input bridge, and renderer capability probing. Prey compiles with its gamecode hardlinked. The last serialized Chrome smoke stopped at `R_ReloadARBPrograms` because Emscripten exposes the ARB entry-point names for linking but `glBindProgramARB` only accepts program zero; that capability was not a working ARB-program implementation. The browser patch queue now uses real GLSL ES 3.0 vertex and fragment shaders for the stock lighting interaction and fails closed if they do not compile or link. No new browser pass was performed in this renderer change.

All browser executables use growable wasm32 memory with an explicit 2 GiB maximum. Doom 3/RoE start at 128 MiB; Quake 4 and Prey start at 256 MiB. Retail PK4 `File`/`Blob` objects and Quake 4's source-derived PK4s mount through `WORKERFS`; they must not be materialized as whole-package `Uint8Array` files in MEMFS.

The renderer acceptance test extracts the exact shader strings from all three patched native trees, compiles and links them in a surfaceless OpenGL ES 3 context, and inspects Doom 3, RoE, Quake 4, and Prey Wasm imports for real shader create/compile/link/use/uniform calls. The main stock interaction no longer binds a nonzero ARB program in browser builds, and stencil shadows use the fixed fallback instead of the unavailable ARB shadow program. Remaining renderer work is explicit: Doom 3/Prey custom ARB material stages still need GLSL ES equivalents, while Quake 4 skips generated or GPU-posed interaction geometry until an ES skinning/upload path is implemented. These gaps keep every variant `Still in development` until a later serialized browser gameplay pass proves the needed content paths.

## Browser verification discipline

Browser testing is serialized across the larger WASM workspace. Obtain the coordinator's Chrome slot before opening a test tab, exercise only this family, capture console/runtime evidence, close every tab, and explicitly release the slot. HTTP/container tests do not require the slot.

## Change checklist

- Preserve native builds on non-Emscripten targets.
- Put browser-only native changes behind `__EMSCRIPTEN__` where appropriate.
- Update a patch queue and `patches/SHA256SUMS` together.
- Keep manifest paths, sizes, and digests exact and variant-aware.
- Use source-derived title visual assets.
- Build suite and every locked variant.
- Run static syntax, package integrity, HTTP range, and `/data` isolation tests.
- Use only `Live` or `Still in development` for title status.
- Commit locally in focused checkpoints; do not push or contact upstream.
