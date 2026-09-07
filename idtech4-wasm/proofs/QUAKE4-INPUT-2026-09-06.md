# Quake 4 physical-modifier integration — 2026-09-06

## Result

The existing shared-adapter Ctrl/Alt repair is now installed in an isolated
Quake 4 candidate on **127.0.0.1:32962**. Actual Chrome comparison reproduces
the old package dropping both key presses, while the new package forwards
both presses and releases. A sole physical Ctrl tap completes Quake 4's
native loading Continue gate. First-person world/pistol/HUD, pause, Return to
Game and Quit Current Game → Yes pass afterward.

This closes the integration gap found in the [save checkpoint](QUAKE4-SAVES-2026-09-06.md),
not the separate pointer-lock or held-control gates. No engine/renderer repair,
live promotion or combined-site restaging was performed here.

## Exact package

- Container: `q4-input-proof-20260906`, ID
  `b07b5b40f898b2d77673549641b5f41ab5ebb6e8f32286ae13e1607ca362649f`.
- Image: `local/idtech4-wasm:quake4-input-candidate`,
  `sha256:1bfbdfd01881aff9e821d850c912307780c36e3dad4c36c7d73c43b6fee67618`.
- Started: `2026-09-06T16:19:44.303363427Z`; zero restarts at verification.
- Exact base: unchanged quad-repair image
  `sha256:fc651e2b5697e8605f53566d1e1d67b600e09d3c7166a51d3292cabc519d932a`.
  The [Dockerfile](quake4-input-candidate-2026-09-06.Dockerfile) copies only
  current `site/game-adapter.js`; its base tag was verified before building.
- Only `/opt/game-site/game-adapter.js` changes. All **46 other installed
  files**, including native JS/Wasm, worker, manifests and shared framework,
  are byte-identical to the base. Installed adapter, current source and HTTP
  response share SHA-256
  `ef44838bdad4bc65530ad030942e0f8ad7088f82c1a49b025c6368738a367b8a`.
- Root filesystem is read-only, with a 512 MiB `/tmp` tmpfs. Owner data bind
  `/home/ted/wasm-game-data/quake4/q4base` → `/data/q4base` remains read-only;
  all 32 required files are ready. The inherited anonymous `/data` volume is
  separately writable; this is not a claim that all of `/data` is read-only.

The old **32961** container, its renderer proof and `q4quad906a` save remain
untouched. The combined `build/site` adapter remains older and still fails the
physical-modifier regression; default staging is not claimed current. The
new package's installed bytes pass the complete six-variant adapter fixture,
covering the source's later Prey and Doom 3 branches as well as Quake 4.

## Chrome observations

Chrome control used normal Play, visible native menus and physical keypress
calls. Retained observations use app-authored DOM logs/datasets and screenshots;
no engine globals, browser storage inspection or synthetic events were used.

- On old 32961 at the main menu, Ctrl then Alt produce **zero key-downs and
  two key-ups**, SDL scans 224 and 226. No campaign or save is loaded there.
- On new 32962 at the main menu, the same calls produce **two key-downs and
  two key-ups**, in matched Ctrl/Alt pairs, with no text event. Measured taps
  last approximately **1.1 and 1.5 ms**, not held keys.
- Normal Single Player → Story Campaign → default Corporal/Start reaches
  `game/airdefense1`. The native Continue state first disallows resume, then
  marks it ready. No automatic-Continue override is enabled.
- A **Ctrl-only 1.6 ms tap** completes that gate. The event delta contains
  only Ctrl down/up: no Enter, competing click or text event. Native gameplay
  acknowledgement occurs at **228531.7 ms**; capture is requested afterward
  at **228532.1 ms** and denied at **228533.3 ms**. Thus input reaches the
  native game, but this browser still does not grant pointer lock.
- Escape skips the intro for this input-focused test. The earlier quad proof,
  not this test, supplies natural-intro acceptance. The observed first-person
  view has textured terrain, sky/smoke, pistol, crosshair and health 72.
- Escape opens the intact native pause menu; Return to Game restores the
  world view. Native Quit Current Game → Yes logs map shutdown and returns
  the intact main menu. Both owned comparison tabs are now `about:blank`.

The new origin creates its normal first-map autosave. No named save is created,
overwritten or deleted; no bindings or gameplay cvars are changed. This is not
a new named-save regression on 32962. All ten observations have empty worker
error lists, capture false, and null pointer-lock/fullscreen elements.

## Repeatable checks

```sh
node idtech4-wasm/scripts/test-modifier-keys.mjs
node idtech4-wasm/scripts/test-q4-input-package.mjs
node idtech4-wasm/scripts/test-q4-input-evidence.mjs
node idtech4-wasm/scripts/test-q4-quad-package.mjs
node idtech4-wasm/scripts/test-q4-quad-evidence.mjs
node idtech4-wasm/scripts/test-q4-save-evidence.mjs
```

The [package audit](quake4-input-package-2026-09-06.json) verifies actual
container/HTTP bytes and exercises the installed adapter across all six
variants. The old installed adapter fails the same fixture at physical
ControlLeft. The dedicated source regression passes **402 modifier cases**
and rejects the restored old guard. Native/Wasm Q4 state (**24 cases**) and
Continue production-method/clock fixtures also pass with the existing SDK 6
host-tool wrapper.

The [Chrome audit](quake4-input-evidence-2026-09-06.json) checks **10 ordered
DOM/JPEG pairs and 26 hashes**, exact old/new edges, the sole-Ctrl native
Continue transition, capture ordering, and world/pause/resume/quit state.
It rejects the legacy observation as repaired input. Screenshots were visually
inspected; the script does not OCR them or prove rendering correctness itself.

## Remaining work

Pointer lock/fullscreen, held movement/firing, mouse-look, audible listening,
broader renderer/campaign progression and live promotion remain open. Audio
counters are not listening evidence. Startup/media warnings remain in the
full logs; the sequence has no worker abort or out-of-bounds error.

Next useful coverage is Prey's native save/load/full-reload lifecycle on its
existing isolated menu/cache candidate, after revalidating its identity.
Do not keep retrying denied capture or rewrite immutable older proofs.
RTCW single-player remains protected and Blood's pitchfork crash deferred.
