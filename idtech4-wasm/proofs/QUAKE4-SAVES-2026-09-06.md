# Quake 4 current-renderer save regression — 2026-09-06

## Result

The uninstrumented [quad-repair candidate](QUAKE4-QUAD-2026-09-06.md) passes
native named save → full page reload → native load in Chrome. Its correct
preview survives reload; both the cold load and a second comparison load
restore the original printed view position and health-72 pistol/world view.
Native pause, Return to Game and Quit Current Game → Yes also pass.
No engine, renderer, adapter, image or live service changed in this checkpoint.

Chrome control used normal Play, native menus and physical keypress calls.
Observations are screenshots and app-authored DOM logs/datasets, not browser
storage or engine-global inspection. The retained Map Start slot was loaded
first; Escape skipped that intro for this save-focused pass. The preceding
quad checkpoint, not this pass, supplies the natural-intro proof.

## Package and sequence

The unchanged service is `q4-quad-proof-20260906`, **127.0.0.1:32961**,
image `sha256:fc651e2b5697e8605f53566d1e1d67b600e09d3c7166a51d3292cabc519d932a`.
The exact canonical-source/build/image/HTTP package audit passes before and
after the browser test. Owner Q4 data remains read-only. Combined release
staging and every live service are untouched.

- The initial native list contains only Map Start. A new, distinct slot
  `q4quad906a` is entered in Save Game and logged as `Saved 'q4quad906a'`.
  The UI dates it September 6, 12:04pm EDT. No slot is overwritten or deleted.
- [The selected preview](quake4-save-preview-2026-09-06.jpg) shows the upright
  sky, terrain/wall, pistol and HUD, without the historical white stripes.
- A full navigation to the same URL returns the launcher with an empty native
  log and no previous audio counter. Normal Play starts a fresh worker and
  logs `Save/config persistence restored at /save/quake4.` Both slots remain.
  [The selected reloaded preview](quake4-save-reloaded-preview-2026-09-06.jpg)
  retains the same visible image and timestamp.
- Native Load Game initializes `Game Map Init SaveGame`, taking **38,138 ms**
  to restore `game/airdefense1`. There is no new-map fallback or replayed intro.
  Native `getviewpos` prints **`(10325.03 -6962.78 6.95) -105.0`**, exactly
  matching the pre-save query at its printed precision.
- Eight ordinary W taps leave that position unchanged. The retained
  `moved-position` pair records this **failed movement attempt**, not a pass.
  These calls are short taps, not held-input acceptance.
- For the save-only comparison, native console command
  `setviewpos 10309 -6962.78 6.95 -105` changes the measured view to
  **`(10309 -6962.78 7.45) -105.0`**. The native diagnostic reports no touched
  triggers. No second save is written and no binding/cvar override is installed.
- Selecting the original slot again restores it in **2,811 ms**. The
  [second printed position](quake4-save-second-position-2026-09-06.jpg) is
  exactly the original coordinate/yaw, undoing the diagnostic teleport.
  This is save-state comparison evidence, **not normal movement evidence**.
- Final pause/resume retains first-person world/pistol/72 health. Normal quit
  logs map shutdown and returns an intact main menu. The owned tab is now
  `about:blank`; the service remains running unchanged.

## Repeatable audit

```sh
node idtech4-wasm/scripts/test-q4-save-evidence.mjs
node idtech4-wasm/scripts/test-q4-quad-package.mjs
```

The [retained-evidence audit](quake4-save-evidence-2026-09-06.json) checks
**19 ordered Chrome DOM/JPEG pairs and 40 hashes**, fresh-page reset, actual
SaveGame initialization, the unchanged short-tap result, diagnostic displacement,
exact restoration and pause/resume/quit. Negative controls reject unchanged
comparison positions, failed restoration and new-map fallback. Screenshots
were visually inspected; the script does not OCR names/health or compare
preview pixels. The early `original-position` capture precedes the asynchronous
query result; `before-entry` contains the completed pre-save output.

## Remaining work and packaging gap

Capture stays false and fullscreen stays null. The existing
[engine-free pointer-lock failure](QUAKE4-CAPTURE-2026-09-05.md) remains the
capture checkpoint; it was not repeatedly retested here. Held controls,
audible listening, broader rendering/campaign progression, quickload,
map-transition autosaves, arbitrary old saves and live promotion remain open.
Startup/missing-media/MSAA/unsupported-syscall warnings remain in the complete
logs; no save corruption, worker abort or uncached trace-model warning appears
in this save/load/quit sequence. Advancing audio counters are not listening proof.

An unrelated adapter check exposed a concrete **integration gap**:
`test-adapter.mjs` defaults to the older combined `build/site`, whose adapter
hash is `f22fe9ce14fd3e15b4e199a70fd405364ebfb47997b199295f9b46c6072dc597`.
It fails the physical ControlLeft regression. Explicitly testing current
`site/game-adapter.js` passes the complete six-variant suite; its hash is
`ef44838bdad4bc65530ad030942e0f8ad7088f82c1a49b025c6368738a367b8a`.
The current Q4 candidate also retains the earlier adapter
`d62d59bf8efea30fa73065964ab7c3dc5768eec51332d08ed0c70b12dfd47ef3`, including
the old blanket Ctrl/Alt guard. The [existing source repair](IDTECH4-MODIFIER-KEYS-2026-09-05.md)
must be integrated into a follow-up Q4 package and tested; this is not a reason
to rewrite a passing source fix or claim the current candidate has it.
The current source also contains later Prey-audio and Doom 3 managed-wake
branches, so any shared-adapter package update needs the whole suite gate.

RTCW SP remains untouched. Blood's pitchfork crash remains deferred at the
user's request. The new save and all historical proof images are retained.
