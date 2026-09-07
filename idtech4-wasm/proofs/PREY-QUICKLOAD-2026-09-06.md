# Prey quickload prompt and save/map lifecycle — 2026-09-06

## Result and current runtime

The blank key in Prey's quickload confirmation is fixed in canonical source
and the rebuilt isolated candidate on **127.0.0.1:32877**. Actual Chrome now
shows **“Press [f9] again to load game.”** The prompt expires without loading;
confirming it restores the newest quicksave's distinct saved position.

The same rebuilt candidate loads the prior build's second-map autosave and
quickloads back to the first map, then pauses, resumes and quits normally.
Across the baseline and repaired sequences, **39 Chrome JSON/JPEG pairs and
88 hashes** cover seven native SaveGame loads, one diagnostic new-map load and
two native quits, with **zero uncached-trace-model warnings**.

This supersedes the runtime identity in the
[trace-cache checkpoint](PREY-TRACE-CACHE-2026-09-06.md), not its historical
evidence. Live Prey **8087** and protected RTCW SP **8085** are untouched;
Blood remains deferred for the user's reproduction. No live promotion or
combined-site restaging was performed. The owned Chrome tab is now blank.

## Reproduced bug and narrow repair

The shipped `default.cfg` binds F9 to `loadgame quick`. The original
`idSessionLocal::QuickLoad` asked `MaterialKeyForBinding` for `loadgame`.
The native lookup is exact, case-insensitive matching, so the key was absent
and the GUI drew a blank key. The existing source even marked this with a
FIXME. Compare the retained
[blank baseline prompt](prey-lifecycle-quickload-prompt-2026-09-06.jpg) and
[repaired prompt](prey-quickload-prompt-2026-09-06.jpg).

`neo/framework/Session.cpp` now chooses `loadgame quick` when that exact
binding exists, falling back to `loadgame` for a valid bare-command binding.
It does not mistake a named-save binding for quickload. The actual native
key/material lookup still handles function, letter and mouse bindings.
Bindings, cvars, save selection/serialization, the four-second confirmation
timer and renderer are unchanged. The trace-cache ownership repair is intact.

Only Session.cpp differs from the preceding prepared source tree: four
insertions and one deletion. The incremental change is appended to
`patches/prey2006-browser.patch`, its checksum is updated, and the prompt
regression joins normal `build-all.sh` immediately after the ownership test.

- Upstream: `5a55c48254e0d847fae533d62a5cf9623999ec04`.
- Prepared tree: `b357d204276159a734675952608b49cdc43e92c3`.
- Patch SHA-256: `a04328250e4a966dc467ffd893d7e32e683f39829c4df6694ecb7ff38b74931e`.
- [Exact-source proof](prey-quickload-source-2026-09-06.json) checks full-tree
  equality to the canonical patch using private indexes; the real Git index
  is untouched.

## Native/Wasm regression and packaging

`test-prey-quickload-prompt.mjs` compiles the actual QuickLoad confirmation
block plus complete native `NumBinds`, `IN_FirstKeyFromBinding` and
`MaterialKeyForBinding` methods. The fixture supplies key-name/localization
primitives and a GUI state recorder. All **26 positive cases** pass: thirteen
each under native ASan/UBSan and Wasm SAFE_HEAP/UBSan. They include default F9,
bare command, explicit binding preference, custom function/letter/mouse/wheel,
case-insensitive matching, unbound invocation, named-save exclusion, already
confirmed and absent-GUI paths. Restoring only the wrong lookup argument
reproduces **14 expected failures**, seven on each target.

The [legacy reproduction](prey-quickload-prompt-legacy-2026-09-06.json) and
[repaired/negative regression](prey-quickload-prompt-native-2026-09-06.json)
are retained. This fixture tests confirmation state and timer assignment, not
file loading, save rotation or the session timeout loop; Chrome supplies the
real runtime observations below. It does not compile a substitute game engine.

The existing build container completed both incremental build steps: Session
compilation and final linking. Seven existing compile warnings remain.

```sh
docker exec -u 0:0 \
  -e EM_CACHE=/src/idtech4-wasm/.work/emscripten-cache-6.0.6 \
  -w /src/idtech4-wasm/.work/prey-d3wasm/build/web-d3wasm \
  d3wasm-build-session /src/idtech4-wasm/scripts/ninja -j 4
```

Current package identity:

- Container: `prey-quickload-proof-20260906`.
- ID: `36fdc84f82d71e4f99cdfa3dde5b05beb0dd9bf809699ee534085f842182d8c6`.
- Image: `sha256:41d07774c9a0e43859437cc9278dc7bd035e6b0c0cc3219da34259a218e63685`.
- Tag: `local/idtech4-wasm:prey-quickload-candidate`.
- Started `2026-09-06T17:37:46.511204309Z`; zero restarts.
- Read-only root, `/tmp` tmpfs, localhost-only port 32877. All thirteen owner
  files are ready; `/home/ted/wasm-game-data/prey/base` remains a read-only bind.
- JS: `8a99eed0f4e019b1cf6fee22dac1595323afeaf4ec9c0abf8dd3ed3c838434ca`.
- Wasm: `f95b9ea8ca1fe84ee5f3cac1671c89d9a7061fbed7486d4b2cd989c7300662fc`.

The [candidate Dockerfile](prey-quickload-candidate-2026-09-06.Dockerfile) adds
one native-pair layer to the exact trace-cache image. **Both JS and Wasm changed
on this rebuild; do not mix the new Wasm with old JS.** The other **45 installed
files are byte-identical**, including worker, adapter, framework and assets.
The [package audit](prey-quickload-package-2026-09-06.json) checks all 47 files,
six HTTP identities, source/regression/native agreement, unchanged trace-cache
source and all six adapter variants using the actual installed files.

The previous `prey-trace-cache-proof-20260906` container and image are retained
**stopped, not deleted**, to keep the same browser-save origin. The still older
menu/cache container also remains stopped. No browser saves were overwritten
or deleted. Historical trace/save package scripts intentionally pin earlier
trees and containers: use the new package audit for current runtime identity,
and their unchanged evidence audits for historical observations.

## Actual Chrome sequences

The Chrome-control skill was used for native menus, physical key taps,
screenshots and read-only DOM proof/log observations. No engine-global calls,
direct browser-storage reads/writes, synthetic page input or security overrides
were used. Console diagnostics were typed through native physical input.

### Baseline, before prompt repair

`prey-lifecycle-*` ran on trace image `73534e2c…` from 17:22–17:33 UTC,
before its container was stopped. Exact package checks passed before and near
the end of this sequence.

1. Native Load restores named save `prey906a` at `(-282 -340 68.25) 180`.
   Read-only console queries show F5=`savegame quick`, F9=`loadgame quick`,
   and `com_numQuicksaves=4` (its default).
2. Physical F5 creates `QuickSave` at 1:24pm. A diagnostic native-console
   `setviewpos -282 -356 68.25 180` changes the printed position to
   `(-282 -356 68.5) 180`; another F5 creates distinct `QuickSave2` at 1:25pm.
   Returning diagnostically to Y=-340 gives Z=68.5, unlike the original save's
   Z=68.25. These are explicit test displacements, not held movement.
3. One F9 shows the blank key. After more than four seconds, the prompt is gone
   and no load occurred. A new F9 pair, 85.5ms apart, restores newest
   `QuickSave2` and its exact Y=-356/Z=68.5 position.
4. Native-console `trigger rhEndLevel` reports one triggered entity. The owner
   roadhouse map's endlevel entity targets `game/feedingtowera.map`. This runs
   the actual endlevel/session map path, including persistent-player handoff,
   rather than a direct `map`/`devmap` command. The new map spawns 2,747 entities
   (79 inhibited), shows its scripted introduction and later first-person
   wrench/HUD view, and creates `AutoSave: Escape Velocity` at 1:27pm.
   **This deliberately skips roadhouse gameplay; it is not normal campaign
   progression or full second-map rendering/control acceptance.**
5. F9 twice, 92.3ms apart, loads `QuickSave2` across maps, restoring the exact
   saved roadhouse position. The native save list shows all six slots and the
   selected quicksave's correct preview. Native quit returns to the intact menu.

### Repaired build

`prey-quickload-*` starts in a fresh page/worker after the new container starts,
using the same origin and retained saves. It does not use `setviewpos`, `trigger`
or a new-map fallback.

1. Native Load selects original `QuickSave`, shows its centered mirror preview
   and 1:24pm timestamp, and restores Y=-340/Z=68.25.
2. F9 displays the correctly labeled wide F9 key. It disappears after the
   unconfirmed wait (18.1 seconds between retained observations), without
   loading. The second prompt plus confirmation, 78.2ms apart, loads newest
   `QuickSave2`: correct offset mirror and Y=-356/Z=68.5.
3. Native Load selects the old `AutoSave: Escape Velocity`, with its correct
   thumbnail and 1:27pm timestamp. The first `autosave-world` record is still
   loading and **is not counted as a completed world**. `autosave-loaded`
   records a completed native SaveGame restore and the dark scripted capsule
   scene. This verifies restoration, not broad lighting/gameplay acceptance.
4. The F9 prompt is also correct in the second map. Two F9 presses 75.5ms apart
   quickload back to the exact Y=-356/Z=68.5 roadhouse position. Normal native
   pause/resume/quit passes. All four loads are SaveGame restores, not fresh
   map initialization.

| Native load | Baseline image | Repaired image |
| --- | --- | --- |
| First roadhouse save | 14,409ms, `prey906a` | 14,574ms, `QuickSave` |
| Newest quicksave | 303ms, `QuickSave2` | 313ms, `QuickSave2` |
| Second map | 17,534ms, diagnostic new-map transition | 16,368ms, old autosave restore |
| Cross-map return | 6,818ms, `QuickSave2` | 6,823ms, `QuickSave2` |

The [evidence audit](prey-quickload-evidence-2026-09-06.json) verifies ordered
observations, fresh launches, persistence readiness, completed loads, distinct
positions, physical press/release pairs, confirmation intervals, no fallback,
two final shutdowns and file hashes. Negative audit controls reject incomplete
loads, missing press edges, fresh-map substitution and a cleanup warning.
Screenshots were manually inspected; the auditor does not OCR their labels.

Six retained slots: `QuickSave`, `QuickSave2`, `prey906a`, `prey906b`,
`AutoSave: Last Call`, and `AutoSave: Escape Velocity`. Only the two new
quicksaves and second-map autosave were created during this checkpoint, before
the prompt rebuild. Two empty quicksave slots were used; four-slot ring wrap
and oldest-slot overwrite were **not** exercised.

## Repeat checks and remaining gates

From the repository root:

```sh
node idtech4-wasm/scripts/test-prey-quickload-prompt.mjs
node idtech4-wasm/scripts/test-prey-trace-cache.mjs
node idtech4-wasm/scripts/test-prey-quickload-package.mjs
node idtech4-wasm/scripts/test-prey-quickload-evidence.mjs
node idtech4-wasm/scripts/test-prey-trace-evidence.mjs
```

Do not use `--record` again on retained proofs. Prompt 26/14 and ownership
22/18 positive/expected-negative cases pass. Input (43), archive cache (65),
deferred media (46), and the actual audio bridge/SDK-negative regression pass
again. For older scripts that default to `em++`, set
`EMXX=/home/ted/Development/wasm-games/idtech4-wasm/.work/host-tools/emxx-6`;
the first input invocation without that setting could not find its compiler,
then passed with the existing wrapper. No source workaround was needed.

Held movement/firing, pointer capture, fullscreen, audible listening, normal
campaign completion, broader second-map rendering and live promotion remain
open. Chrome keypresses here are approximately 1ms taps, not held controls.
Audio counters and this save lifecycle do not prove audible output. Do not
repeat unchanged browser-security failures or widen scope into RTCW SP/Blood.
