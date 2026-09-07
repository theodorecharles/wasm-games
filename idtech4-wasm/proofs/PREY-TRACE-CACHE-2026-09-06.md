# Prey saved trace-cache ownership repair — 2026-09-06

## Result

The [reproduced save-cleanup warning](PREY-SAVES-2026-09-06.md) is fixed in
canonical Prey source and the rebuilt isolated candidate on **127.0.0.1:32877**.
Actual Chrome completes five native SaveGame loads and two native quits with
**zero uncached-trace-model warnings**. Both retained pre-repair saves load;
a distinct new save survives full page reload with its correct preview and
position. Loading the old save again restores its different original position.
Native pause/resume works. The existing shared-adapter Ctrl/Alt repair is also
now packaged here, and Chrome records matched press/release edges for both.

This is not live promotion or full-game acceptance. Live Prey **8087** and
RTCW SP **8085** are untouched. Blood remains deferred for the user's repro.

## Ownership repair

Prey's clip initialization creates a default trace model before saved cache
records are read. The old static restore call replaced that cache without
releasing and reacquiring the clip-owned reference. Saved indices can differ
from the old live index; the later shutdown released stale ownership.

- `idClip::FreeTraceModels` now owns the existing temporary/default release
  sequence, shared by Shutdown and the new clip-level restore entry point.
- `idClip::RestoreTraceModels` releases those live references before replacing
  the cache, then reacquires the default model by its original shape.
- `idRestoreGame::RestoreObjects` calls `gameLocal.clip.RestoreTraceModels`
  before restoring entity references.

Saved cache/entity indices and serialization are unchanged. The original
invalid-reference warning guard is retained and tested, not suppressed.
Human Head-specific collision code, renderer, default cvars and bindings are
unchanged. The three-file change is included in `patches/prey2006-browser.patch`
and `patches/SHA256SUMS`; the ownership regression joins normal `build-all.sh`.

The [exact-source audit](prey-trace-cache-source-2026-09-06.json) verifies the
entire prepared tree against the canonical patch with private Git indexes;
the real checkout index is untouched:

- Upstream commit: `5a55c48254e0d847fae533d62a5cf9623999ec04`.
- Prepared tree: `8d794259ea6265a2813b1f0a23ec4ec7d5c57fc9`.
- Patch SHA-256: `0568eeba348e6b0d083f7165299256d9c0a93ab78e577e4922f5ed8c7c8fccf3`.

## Native/Wasm regression and build

`test-prey-trace-cache.mjs` extracts actual Prey cache, LoadModel, Shutdown,
ownership, Init-default, entity-reference restore and SaveGame-call code. It
reuses only the Doom 3 fixture's dependencies and typed-record scenarios, not
Doom 3 production method bodies. Eight original cache/serialization methods
must remain byte-identical to pinned Prey upstream.

All **22 repaired cases** pass: eleven each under native ASan/UBSan and Wasm
SAFE_HEAP/UBSan. Nine cache/ownership scenarios each repeat three loads; fresh
shutdown and the original invalid-reference guard are also tested. Reverting
only the production restore call reproduces **18 expected failures**, nine per
target. The [pre-edit legacy reproduction](prey-trace-cache-legacy-2026-09-06.json)
and [repaired/negative results](prey-trace-cache-native-2026-09-06.json) are retained.
These tests model ownership and typed records, not collision math or arbitrary
on-disk save compatibility; the Chrome sequence below supplies real-save proof.

The full Prey binary was rebuilt in the existing `d3wasm-build-session`:

```sh
docker exec -u 0:0 \
  -e EM_CACHE=/src/idtech4-wasm/.work/emscripten-cache-6.0.6 \
  -w /src/idtech4-wasm/.work/prey-d3wasm/build/web-d3wasm \
  d3wasm-build-session /src/idtech4-wasm/scripts/ninja -j 4
```

All 232 build steps completed. The first invocation without this cache setting
failed on mismatched libc++ header paths; using the configured cache resolved
that environment issue without source workarounds. Existing compiler warnings
remain. No combined-site staging was run.

## Exact isolated runtime

- Running container: `prey-trace-cache-proof-20260906`.
- ID: `d3904e7e47fbf29e8677674a34fb9985d0decb2e94dc2d1e70b04e8a1ad44e55`.
- Image: `sha256:73534e2ca76cd98ea89ab904fe13aeeb65139fdb0ac8b49cb05a53f6202d1ffd`.
- Tag: `local/idtech4-wasm:prey-trace-cache-candidate`.
- Started `2026-09-06T17:00:32.724719355Z`; zero restarts.
- Read-only root; `/tmp` tmpfs. All 13 owner files are ready, with
  `/home/ted/wasm-game-data/prey/base` → `/data/prey/base` still read-only.
- The old `prey-menu-cache-proof-20260905` was stopped, **not deleted**, to reuse
  its exact browser-save origin. Its container and image remain recoverable.

The [package audit](prey-trace-cache-package-2026-09-06.json) verifies all 47
installed files. Only `prey06.wasm` and `game-adapter.js` differ from the old
candidate; **45 files are unchanged**, including native JS, worker, framework,
manifests and assets. Six key HTTP responses match installed bytes, which match
current source/native outputs. The complete six-variant adapter suite passes
against files copied from the actual running package.

- Wasm: `3be6e4dc9c3012abb0b2ea42abcaa81302f3b2eb8ef62552ada58dc16515cb8b`.
- JS: `5f1d5a4dc782b83d90f8da2ba77b71d33356d5f4f2891d4e51f712ce85b03d46`.
- Adapter: `ef44838bdad4bc65530ad030942e0f8ad7088f82c1a49b025c6368738a367b8a`.

The [candidate Dockerfile](prey-trace-cache-candidate-2026-09-06.Dockerfile)
adds one layer to the exact old image. Historical save-package/source pins are
not rewritten; use the new trace-package audit for current runtime identity.

## Actual Chrome sequence

Chrome control used normal Play, visible native menus and physical keypresses.
Evidence is screenshots plus app-authored DOM logs/datasets, without engine
globals, browser-storage inspection, synthetic input or security overrides.

1. Fresh menu records start with no key events. Ctrl and Alt taps produce
   matched down/up scans **224/226**, each about **1.4 ms**. This proves tap
   delivery, not held crouching/strafing or capture.
2. Pre-repair **`prey906a`**, September 6 **12:41pm**, retains its upright mirror
   preview. A native SaveGame load completes in **14,604 ms** and restores
   **`(-282 -340 68.25) 180.0`**. The early `old-world` record was captured while
   loading, before completion; it is explicitly rejected as world proof by
   the auditor. Its early console query was retried after the load completed.
3. **AutoSave: Last Call**, September 5 **2:25pm**, loads in **335 ms**. Its
   normal opening fade/animation reaches the textured bathroom without an
   intro skip. Reloading `prey906a` in **326 ms** restores the original scene
   and printed position. No cleanup warning occurs during either repeat load.
4. A native-console diagnostic displacement, `setviewpos -282 -356 68.25 180`,
   yields **`(-282 -356 68.5) 180.0`**. Native Save Game writes distinct
   **`prey906b`**, September 6 **1:09pm**, with the correspondingly offset
   [bathroom preview](prey-trace-new-preview-2026-09-06.jpg). Neither older slot
   is overwritten or deleted. Quit Game → Yes returns an intact main menu,
   again without the warning.
5. Full page navigation returns a fresh launcher with empty native log and no
   old audio/input counters. Normal Play restores `/save/prey`. All three
   slots and the [selected new preview](prey-trace-reloaded-preview-2026-09-06.jpg)
   survive, with original timestamps.
6. The new save loads in **14,241 ms** and restores its exact distinct position.
   The old named save then loads in **332 ms**, restoring the original position
   and scene. No further teleport is issued in this fresh worker.
7. Native pause, Resume Game and final Quit Game → Yes pass. Both sessions'
   complete retained logs contain **zero trace-cache warnings**. The owned
   test tab is left `about:blank`; all three saves remain.

The [evidence audit](prey-trace-cache-evidence-2026-09-06.json) verifies **28
ordered DOM/JPEG pairs and 65 hashes**, the five completed loads, distinct
positions, fresh-page reset, two clean quits and modifier edges. Negative
controls reject up-only modifiers, the in-flight load, a new-map fallback and
the actual historical warning-bearing quit. Native slot names, timestamps and
previews were visually inspected; the script does not OCR or compare pixels.

## Repeatable checks and remaining scope

```sh
node idtech4-wasm/scripts/test-prey-trace-cache.mjs
node idtech4-wasm/scripts/test-prey-trace-source.mjs
node idtech4-wasm/scripts/test-prey-trace-package.mjs
node idtech4-wasm/scripts/test-prey-trace-evidence.mjs
node idtech4-wasm/scripts/test-prey-save-evidence.mjs
node idtech4-wasm/scripts/test-prey-archive-cache.mjs
EMXX="$PWD/idtech4-wasm/.work/host-tools/emxx-6" node idtech4-wasm/scripts/test-prey-input.mjs
EMXX="$PWD/idtech4-wasm/.work/host-tools/emxx-6" node idtech4-wasm/scripts/test-prey-deferred-media.mjs
EMXX="$PWD/idtech4-wasm/.work/host-tools/emxx-6" node idtech4-wasm/scripts/test-prey-audio.mjs
```

All pass. The unchanged historical save-evidence audit still validates the
earlier reproduction, including its two warnings. Other regressions cover 43
input cases, 65 archive-cache cases, 46 deferred-media cases and the exact
audio bridge with its failing SDK worker-device control.

Capture stays false; pointer-lock/fullscreen elements remain null. Held
movement/firing, mouse-look, audible listening, campaign progression, quickload,
map transitions, arbitrary old saves and live promotion remain open. Startup
missing-media/master-server warnings and the default map-load music warning
are retained, not reclassified as trace-cache errors or claimed fixed here.
Continue with independently testable remaining gates from the main TODO;
do not retry the unchanged browser capture denial or deferred Blood crash.
