# Prey native saves and cleanup regression — 2026-09-06

## Result

The existing [menu/cache candidate](PREY-MENU-CACHE-2026-09-05.md) passes
native named save → full page reload → native load in actual Chrome. Its
correct bathroom preview survives reload, and two loads restore the exact
printed position. A small native-console displacement is undone by the
second load. Pause, Resume Game and Quit Game → Yes return the expected UI.

The sequence also **reproduces an unfixed cleanup bug**:
`idClipModel::FreeTraceModel: tried to free uncached trace model` appears
when the first loaded state is unloaded for the second load, and again at
final quit. The saved state is usable in this test, but cleanup is not accepted
as correct. No source, engine, image, staging or live service changes were
made in this checkpoint.

## Exact runtime

- `prey-menu-cache-proof-20260905`, **127.0.0.1:32877**.
- Container `cbc952395c1acbcacf23d6809bf6d27e6abc69247449d36885694b72ea994ad7`.
- Image `sha256:8571367ae10dae7267c67a28dfdf4031eaf588ee622e1171c9286be2ff5e1e6d`.
- Started `2026-09-05T18:21:51.711095249Z`; still running, zero restarts.
- Owner bind `/home/ted/wasm-game-data/prey/base` → `/data/prey/base`
  remains read-only; all 13 owner files are ready. The separate inherited
  anonymous `/data` volume is writable, not the owner bind.
- Current native `prey06.js` / `prey06.wasm`, current Prey worker and canonical
  Prey patch match the historical build record and installed artifacts.
  All 47 installed files are recorded; six key HTTP responses match them.
  The current native outputs are under `.work/prey-d3wasm/output/emscripten/`.

The installed shared adapter remains the historical
`a1a1377e46664c42d90e25880d66a034ca5c28828c4a82925c9288cc58d96733`, not the
later current-source adapter. This checkpoint does not claim the later
Ctrl/Alt fix is packaged in Prey. Live Prey on 8087 is unchanged.

## Chrome sequence

Chrome control used normal Play, visible native menus and physical keypresses.
Evidence consists of screenshots and app-authored DOM logs/datasets, not
engine globals, browser-storage inspection or synthetic event injection.

1. The initial Load Game list contains only **AutoSave: Last Call**, dated
   September 5, 2:25pm. Selecting it and confirming Load performs real
   `Game Map Init SaveGame` initialization in **15,257 ms**. Its normal
   intro/fade reaches the textured, lit bathroom; no intro skip is sent.
2. Native `getviewpos` reports **`(-282 -340 68.25) 180.0`** before saving.
   The first text-paste attempt produces no native text, and its early
   `original-position` pair intentionally contains no coordinate result.
   Physical letter keys execute the query successfully; `before-entry`
   contains the completed original result.
3. Save Game creates the distinct slot **`prey906a`**, September 6, **12:41pm**.
   The old autosave stays in the list with its original date. No save is
   overwritten or deleted. Selecting the new slot in Load Game populates
   [its correct upright bathroom/mirror preview](prey-save-preview-2026-09-06.jpg).
4. Full navigation to the same URL returns a fresh launcher with an empty
   native log and no previous audio counter. Normal Play creates a fresh
   worker and logs `Save/config persistence restored at /save/prey.`
   Both slots remain. [The selected preview after reload](prey-save-reloaded-preview-2026-09-06.jpg)
   retains the correct scene and original timestamp.
5. Selecting `prey906a` and confirming native Load initializes SaveGame in
   **14,880 ms**, returning the saved bathroom view without replaying the
   opening animation. The printed view position exactly matches the original.
6. For state-restoration comparison only, native console command
   `setviewpos -282 -356 68.25 180` yields measured
   **`(-282 -356 68.5) 180.0`**. No second save or binding/cvar override is
   written. This is a diagnostic displacement, not normal movement proof.
7. The same named slot loads a second time in **349 ms**. Its native position
   returns exactly to **`(-282 -340 68.25) 180.0`**, undoing the displacement.
   The prior-state shutdown emits one uncached-trace-model warning.
8. Native pause and Resume Game retain the restored scene. Quit Game → Yes
   returns an intact main menu and emits the same warning a second time.
   The owned test tab is now `about:blank`; the named save and autosave remain.

## Cleanup finding and next repair

Current source confirms the same ownership pattern previously repaired in
[Doom 3/RoE](D3-TRACE-CACHE-2026-09-06.md):

- Prey's `idClip::Init` creates `defaultClipModel` in the live trace cache.
- `idRestoreGame::RestoreObjects` still calls the static
  `idClipModel::RestoreTraceModels(this)` entry point directly.
- That replaces the cache and resets restored reference counts without
  reacquiring the clip-owned default model. Saved indices need not match the
  live pre-load cache. The clip's later Shutdown releases its stale ownership.

The next task is a **Prey-specific native/Wasm regression and ownership repair**,
then an isolated rebuilt candidate that loads these retained saves and repeats
load/quit without warnings. Preserve serialized cache/entity indices and the
original invalid-reference warning guard; do not hide the warning. Reuse the
Doom 3 fixture where applicable, but extract and test actual Prey methods and
account for its Human Head-specific clip code. This is not yet implemented or
claimed fixed by the passing evidence audit below.

## Repeatable verification

```sh
node idtech4-wasm/scripts/test-prey-save-package.mjs
node idtech4-wasm/scripts/test-prey-save-evidence.mjs
node idtech4-wasm/scripts/test-prey-archive-cache.mjs
EMXX="$PWD/idtech4-wasm/.work/host-tools/emxx-6" node idtech4-wasm/scripts/test-prey-input.mjs
EMXX="$PWD/idtech4-wasm/.work/host-tools/emxx-6" node idtech4-wasm/scripts/test-prey-deferred-media.mjs
EMXX="$PWD/idtech4-wasm/.work/host-tools/emxx-6" node idtech4-wasm/scripts/test-prey-audio.mjs
```

All commands pass on this unchanged candidate/source. Input covers **43**
real-SDL Wasm cases, archive cache **65**, deferred media **46**, and the audio
fixture exercises the exact bridge plus failing SDK worker-device control.
Those fixtures are not held-input, audible-listening or full-game acceptance.

The [retained-evidence audit](prey-save-evidence-2026-09-06.json) verifies
**20 ordered Chrome DOM/JPEG pairs and 43 hashes**, fresh-page reset, native
SaveGame initialization, measured displacement/restoration, pause/resume/quit
and the two reproduced warnings. Negative controls reject unchanged comparison
positions, wrong restoration and new-map fallback. A passing audit validates
the retained observations, **including the unfixed bug**; it does not convert
that warning into an acceptable game result. Screenshots were visually
inspected; the script does not OCR slot names or compare preview pixels.

The [package audit](prey-save-package-2026-09-06.json) passes before and after
Chrome. It pins this historical source/build, so a later canonical repair will
need a new package audit rather than rewriting this evidence as current.

Capture remains false and pointer-lock/fullscreen elements null throughout.
Held movement/firing, mouse-look, listening, campaign progression, quickload,
map transitions, arbitrary save compatibility and live promotion remain open.
Startup missing-media warnings and a later default map-load music warning are
retained; no worker abort, persistence failure or save-version fallback occurs.
RTCW single-player remains untouched; Blood stays deferred.
