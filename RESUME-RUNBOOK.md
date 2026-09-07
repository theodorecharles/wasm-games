# Game Lab recovery and progress runbook

Checkpoint: **2026-09-06, approximately 20:18 America/New_York** (2026-09-07 UTC).
The user requested this handoff and then asked to get to a stopping point.
**Work is stopped at that request; resume when directed. The overall goal is incomplete.**

## Read this first

Publication update: the user subsequently requested the public README and **all
accumulated changes pushed to GitHub**. That publication does not resume game
development or deploy new game images. The game-data/build caches stay local;
the source, tests, evidence, runbook and explicitly untested recovery patch are
included in the checkpoint.

The tested shared-framework working changes are now recorded in commit
`0413f4db7535f5068dcc3469c1ebdc3afdfbfb8a`; the default branch also includes the
upstream URL migration through merge `fd32c16a166bb44ac840e93c29108db0c3afe1d8`.
The full framework test suite passes before and after that merge. Runtime JS
bytes did not change in the merge. The lab merge preserves current monorepo
image contracts and passes `validate.sh --images`.

**Build-pin caveat after publication:** existing engine scripts still require
framework HEAD `ebb1ebe35ad8224a9080279a6529414db42d3284`. Those historical
source/image pins have not been silently changed. The now-committed framework
checkout has a newer HEAD, so do not expect the old exact-HEAD gate to pass there.
To reproduce the previously tested framework without resetting the main checkout,
use a separate build worktree at that pinned commit and apply the exact binary
diff from it to `0413f4db7535f5068dcc3469c1ebdc3afdfbfb8a`. This reconstructs the
old pinned-HEAD-plus-working-changes state from published commits. Set
`WASM_FRAMEWORK_DIR` (and the build container's framework mount) to that separate
worktree. Check the chosen worktree path is unused first. A future release can
coordinate new consumer pins and images; this push is not that release.

Goal: fix all documented problems and prove as many games working through real
Chrome control as possible. The scope remains the whole portfolio, not only Wolf.

Current live releases are intact. The interrupted task was Wolf/Spear config
persistence. Three prepared native source files contain **untested draft edits**;
they are **not in the canonical patch series, not built, and not deployed**.
Their complete recovery diff is saved outside the ignored `.work` directory:
[CONFIG-PERSISTENCE-WIP-2026-09-06.patch](wolf3d-wasm/proofs/CONFIG-PERSISTENCE-WIP-2026-09-06.patch).

Do not run Wolf source preparation/build blindly: the safe preparation script
will correctly reject this noncanonical draft. Do not reset the source tree to
make that rejection disappear. Review and integrate the draft first.

Handoff verification passed: 33 local documentation links resolve. A disposable
reconstruction of the pinned source plus all six canonical patches accepts the
saved recovery patch and reproduces all three draft files byte-for-byte. This
checks recoverability only; the draft still has no compile or behavioral test pass.

No new build was launched for persistence, and no unified-exec process is awaiting
polling at this stop. The previous binding build is terminal, exit 0. Retained
game/proof containers are intentionally running; this is not authorization to
stop, prune, delete or restart them.

Repositories:

- Source: `/home/ted/Development/wasm-games`
- Shared runtime: `/home/ted/Development/wasm-game-framework`
- Lab/Compose: `/home/ted/Development/wasm-game-lab` (`compose.yaml`)
- Owner data: `/home/ted/wasm-game-data`

The worktrees are extensively dirty with accumulated work. Preserve unrelated
changes. No subagents are authorized. Use `apply_patch` for authored edits. No
reset, broad Compose restart, owner-data rewrite, browser-storage clearing, or
commit/push was performed for this handoff. Blood's pitchfork-crash reproduction
remains deferred at the user's request. Do not resume that investigation loop.

## Full progress report: deployed work

The last read-only lab check found **32/32 services running**. `./validate.sh
--images` passed **45 shortcuts, 30 runnable endpoints/image contracts, 32
services and 28 inventoried icons**. This is deployment consistency, not a claim
that all games pass gameplay acceptance.

| Family / game | Completed work and established evidence |
| --- | --- |
| Doom, Doom II, TNT, Plutonia, Heretic, Hexen, Chex | Fixed Original/Smooth startup deadlock and bad default saved key codes; duplicate physical input; Modernized menu/cursor/state, wrong-game match selection and browser audio. Added managed Original/Smooth bots. All seven titles have real first-map Chrome deathmatch checks across Original/Smooth/Modernized; Classic single-player startup also passes. [Managed release](idtech1-wasm/proofs/CLASSIC-MANAGED-2026-09-05.md). |
| RTCW SP, 8085 | Fixed startup packet-drain trap, renderer binding via pinned GL4ES, briefing hit coordinates, SP menu and capture timing. Chrome verifies intro, first level, short movement/knife, native save/full reload/load and capture transitions in that test session. User confirmed the renderer looks good. [Renderer record](idtech3-wasm/games/rtcw/RENDERER-REFERENCE.md). |
| RTCW MP, 18085 | Managed Join works; fixed triangular lightmap corruption by isolating legacy array state. Chrome verifies team/class selection, spawn, short firing, disconnect/rejoin and seven bots. [Release](idtech3-wasm/proofs/RTCW-MP-LIGHTMAP-2026-09-06.md). |
| Quake III, 8083 | Rebuilt pinned source; first-click cold join verified; fixed stale JOINING status after disconnect. Live Chrome verifies world, pause/resume, clean departure and rejoin with seven bots. [Release](idtech3-wasm/proofs/QUAKE3-CHROME-2026-09-06.md). |
| Blood / Duke3D, 8007 / 18007 | Selectable Classic/Modernized profiles are live. Widescreen GPU renderer and pitch/yaw work in isolated Chrome. Fixed texture upload/matrix/NPOT/palette/clipping/alpha problems, Duke save-name typing and Blood binding-slot diagnostics. All four live first-level/profile combinations render and move; Duke primary firing passes both profiles. Isolated saves survive reload. Classic remains default; wider fidelity/capture/listening and Blood firing/crash acceptance remain open. [Release](build-wasm/proofs/BUILD-RELEASE-2026-09-06.md). |
| Wolf3D / Spear, 8011 / 8012 | Fixed cursor/row clicks, episode hit boxes, A/D turn-plus-strafe, quick input loss, palette dialogs/stale clears and blank SDK special-key names. Live Chrome verifies labels, first levels, W movement, firing 8 to 7 and pause/resume. Isolated Wolf Ctrl-to-F editing, F firing and Ctrl restoration pass in one session. [Current release](wolf3d-wasm/proofs/BINDINGS-RELEASE-2026-09-06.md). |
| Half-Life / Blue Shift / Opposing Force, 8017 | Rebuilt engine; stored-WAD packaging removes repeated archive decompression, improving expansion native map start from about 15–20 seconds to about 1 second in matched observations. Fixed native save-key hints, logger selection behavior and loading/capture request defects. Chrome verifies rendered intros/Half-Life progression and Blue Shift save/full reload restoration. Actual mouse capture remains unresolved. [Release](goldsource-wasm/proofs/RELEASE-2026-09-06.md). |
| Counter-Strike, 8017 plus host | Repaired dead-match recovery, signaling configuration, selected-host fallback, menu/client global-symbol collision and Join/Resume keyboard focus. Installed compact managed menu. Live Chrome verifies join, first-person spawn, nine bots, pointer/keyboard Resume, Console and Disconnect. Original MAX_MODELS initiating cause is not proven fixed. [Latest release](goldsource-wasm/proofs/CS-MANAGED-MENU-2026-09-06.md). |
| OpenRCT2, 8026 | Existing entry supports RCT1/RCT2. Fixed private scenery indexing, RCT1 sprites, construction-preview cleanup, browser dialogs, callback build signature and needless index rebuilding. Chrome verifies construction, passenger trips, save/full reload restoration and running restored parks. Original files preserved; versioned private installation adds checked missing objects. Listening/wider parks remain open. [Release](openrct2-wasm/proofs/RELEASE-2026-09-06.md). |
| SimCity 2000, 8025 | Timing/startup repair deployed. Chrome creates a city, places roads with correct cost, completes the guest's save confirmation, reloads and restores terrain/roads/date/cash, then resumes. Broad pointer/performance/listening acceptance remains. [Save record](dosbox-wasm/proofs/SIMCITY-SAVE-2026-09-06.md). |
| Quake II / Reckoning / Ground Zero | Non-root managed q2ded session fixes HTTP 500 startup. All three live services updated; six real-server wake/map-reply/idle-cleanup cases pass. Fresh comprehensive Chrome gameplay/bot/capture acceptance is not supplied by those server checks. [Record](idtech2-wasm/proofs/README.md). |
| DOSBox keyboard / GTA / NFS | Correct SDK keyboard constants and Backspace deployed. Title-specific mouse/timing fixes deployed. Native-Wasm GTA reaches streets with non-silent PCM; NFS starts a race, drives around 82–83 mph and pauses/resumes. These are not completed Chrome controls/performance/listening checks. [GTA](dosbox-wasm/proofs/GTA-2026-09-04.md), [NFS](dosbox-wasm/proofs/NFS-2026-09-04.md). |

Supporting work includes reproducible source/image checks, real regressions with
old-code negative controls, source-note preservation, deterministic RTCW menu
packaging and scoped deployments retaining rollback images and owner data.

## Implemented and tested, but not deployed

### Doom 3 multiplayer

Isolated managed MP wakes/autoconnects through the authenticated relay, cleans up
disconnects, sleeps when idle and reconnects. Fixed the first-snapshot crash and
native/browser class parity; ported real SABot AI. Eight actual Chrome clients
reach gameplay, with 2/1/0 bots for 6/7/8 humans and refill after departures.
Fixed bot vote eligibility and stale API map state. Repaired MP skipping the
inline sound mixer, then reproduced and verified its sound-driven lighting
blackout repair across a Delta/Tomiko roundtrip. Current mixer candidate is
32950; older population/voting candidates remain retained.

Still needs wider visual/map/combat/control checks, capture, actual listening and
promotion. [Lighting](idtech4-wasm/proofs/D3-LIGHT-CLOCK-2026-09-06.md),
[audio](idtech4-wasm/proofs/D3-MP-AUDIO-2026-09-06.md),
[population](idtech4-wasm/proofs/D3-SABOT-POPULATION-2026-09-05.md).

### Doom 3 SP / Resurrection of Evil

Isolated v8 on 32953/32954 includes letter/modifier and pause/console fixes and
the trace-cache ownership repair. Natural intros, first-map native named saves,
previews, full reload/restored positions, repeated old/new save loads and clean
quits pass Chrome without trace-cleanup warnings. Live campaign services do not
contain these new candidate changes. Wider regression/control/listening and
promotion remain. [Record](idtech4-wasm/proofs/D3-TRACE-CACHE-2026-09-06.md).

### Quake 4

Repaired GL capability/procedure handling, exception support, audio device list,
Continue, keyboard delivery and simulation timing. Subsequent fixes cover shadows,
shader translation, texture/depth formats, framebuffer copies, vertex bindings,
lighting, sky streams, border/mipmap sampling, preview readback and gray intro
geometry. Actual Chrome now completes the natural intro into textured
world/sky/pistol/HUD and passes pause/resume and native save/full reload/load.
32961 is the saved current-renderer baseline; 32962 adds Ctrl/Alt integration.

Still needs sustained movement/firing, capture, listening, wider renderer and
campaign validation, actual MP acceptance, and deployment. Do not describe SP
intro success as MP acceptance. [Current index](idtech4-wasm/proofs/README.md),
[renderer](idtech4-wasm/proofs/QUAKE4-QUAD-2026-09-06.md),
[input](idtech4-wasm/proofs/QUAKE4-INPUT-2026-09-06.md).

### Prey

Fixed New Game's black-screen wait for voice completion by supplying real audio
completion through a worker/page bridge. Repaired media/default-texture ownership,
keyboard routing, deferred startup resources and bounded archive caching. Current
isolated 32877 also fixes saved trace-cache ownership and the blank F9 prompt.
Chrome verifies normal intro/world, pause/resume, named saves, distinct quicksaves,
reload restoration and cross-map loading. The next-map path was diagnostically
triggered; it is not normal campaign-progression proof. Held controls, capture,
listening, quicksave ring wrap, wider campaign and deployment remain.
[Latest record](idtech4-wasm/proofs/PREY-QUICKLOAD-2026-09-06.md).

### DOSBox WASD / typing

Isolated v3 has explicit movement-mode switches for Jill 1–3, Jazz and Duke 1–2,
off by default so letters/menu shortcuts/save names remain intact. Arrows retain
their meanings; alias ownership and focus/mode changes handle releases correctly.
All six switches are Chrome-checked and adapter-to-native BIOS tests pass. Native
Jazz menu, text/Backspace, movement and save restoration also pass. Browser
gameplay/save acceptance and promotion remain.
[Policy](dosbox-wasm/proofs/WASD-POLICY-2026-09-06.md),
[Jazz](dosbox-wasm/proofs/JAZZ-NATIVE-INPUT-2026-09-06.md).

## Remaining portfolio work

1. Finish the interrupted Wolf/Spear config and save/full-reload/load work below.
2. Resolve pointer-lock/fullscreen and game-specific capture timing. Engine-free
   controls also reject trusted requests in this Chrome context (WrongDocumentError
   for lock, TypeError/not granted for fullscreen). Underlying cause is not proven;
   do not bypass browser security or count native GrabInput as actual lock.
3. Finish acceptance and promote Doom 3/RoE/managed MP, Quake 4 and Prey.
4. Finish DOS Chrome movement/typing/save checks; GTA performance/controls/audio;
   NFS race/cursor/capture; wider SimCity mouse/performance/listening.
5. Retest Quake/Quake II lifecycle, capture and both expansion gameplay paths.
6. Investigate Counter-Strike's original MAX_MODELS initiator; recovery is not a
   demonstrated prevention fix. Wider GoldSource controls/campaigns remain.
7. Broad held-input, multiple-map/extended combat, save edge-case and listening
   acceptance across families. Short taps and audio scheduling do not prove these.
8. Blood starting-pitchfork crash remains open and deferred by the user.
9. HL2 and CoD2 still have diagnostic runtimes, not playable engines. NES/SNES/PS1/
   PS2 are catalog-only without runtime images; other catalog source/runtime ports
   were not completed by this repair pass. WolfET was previously owner-accepted.
10. Reconcile older README/checklist rows that still describe superseded failures.
    Use the latest release records, not stale aggregate pass/fail counts.

Full chronological ledger: [GAME-LAB-FIX-TODO.md](GAME-LAB-FIX-TODO.md).
Original requirements: [GAME-LAB-TEST-ISSUES.md](GAME-LAB-TEST-ISSUES.md).

## Exact interrupted task: Wolf/Spear persistence

### Browser state at stop

Chrome-control connection remains established in the persistent Node REPL:
`q4Chrome`; owned tab `1938017857` is `dukeModernTab` (also `preySaveTab`). The
name is historical; it currently displays **Spear** at **http://127.0.0.1:32997/**.
Owned tabs 1938017848/1938017854 are blank. Verify tab IDs/state before resuming;
bindings do not survive every new session. Use the Chrome-control skill and its
documented reconnection path if needed; no engine-global injection or alternate
browser-control backdoor.

Current screen: **Customize**, after a full page reload and normal cached Play.
Native defaults are visible: Open=Space, Fire=Ctrl, Left=Left arrow. Before reload,
ordinary native editing changed **Open to F** and **Left to J**. Both were lost.
The early `spear-config-fire-before-reload` filename is misleading: the screenshot
actually shows **Open=F**, not Fire=F. One arrow tap was lost during row entry;
do not turn that filename into a false firing claim.

- [Before reload](wolf3d-wasm/proofs/spear-config-custom-before-reload-2026-09-06.jpg)
- [After reload](wolf3d-wasm/proofs/spear-config-reloaded-defaults-2026-09-06.jpg)

Each has a same-stem JSON observation. The after-reload pair was saved while
writing this handoff using screenshots/read-only DOM observation only.
Current DOM: variant=spear, data=cache, engineState=menu, controlsMask=31/valid,
audio=running/prepared40; actual pointerLockElement and fullscreenElement null.
No live save/binding changes and no browser-storage clearing were performed.

Before editing bindings, native New Game/Bring 'em on reached the first corridor,
a W tap moved slightly, and an empty first save slot was named **s6** using S then
6 and committed with Enter. Native save returned to Options. The slot has **not
yet been inspected or loaded after reload**; save durability remains unproven.
Proof stems: `spear-save-initial-world`, `spear-save-position`,
`spear-save-empty-slots`, `spear-save-entered-name`, `spear-save-committed`, all
dated 2026-09-06 under `wolf3d-wasm/proofs`.

Next browser action: Escape from Customize, Escape from Control to Options,
then Load Game; inspect s6 and restore it. Capture fresh screens between native
menu transitions. Preserve the slot; don't overwrite it or clear the origin.

Known viewport is 1424x1058, canvas 1410x1057 CSS / 960x720 native. Grounded menu
coordinates (recheck after navigation): Control (630,384), Load (638,442), Save
(638,497), Back to Game (671,668); Customize (720,577); action row (860,698),
movement row (330,810); first save/load slot (800,270), following rows +57 px.
EnterCtrlData starts at the first allowed column regardless of click X. Use
separate observed arrow taps; tightly batched inputs can be swallowed by WaitKeyUp.
Real keypresses are taps, not held-key proof.

`wolfReleaseRecord(stem)` is the existing screenshot/JSON helper, using exclusive
creation, with `d3ProofFS` for output. New stems should use `wolf-save-*`,
`spear-save-*`, `wolf-config-*`, `spear-config-*`. Do not add new `*-bindings-*`,
`*-capture-*`, `*-input-*` or `*-palette-*` evidence to frozen autodiscovery sets.

### Draft edits already applied, not tested

Prepared source: `wolf3d-wasm/.work/wolf4sdl`, HEAD
`3d41ccce8f8fecbed83aa9d8d42734c2c7e62374`.

- `wl_main.cpp`: adds trailing 32-bit config marker `0x57424331`, preserves the
  original record layout, and migrates only unmarked exact W,D,S,A directions to
  arrows. Marked intentional WASD and other custom layouts are preserved. Adds
  a length check for the initial config magic read; this is not complete corrupt
  config hardening. Calls `WolfWebRestoreDirections(configVersion)` instead of
  unconditionally resetting all directions at every startup.
- `wl_menu.cpp`: adds browser-only `WriteConfig()` through `SaveBrowserConfig`
  at accepted sound choices, mouse/joystick enable toggles, accepted sensitivity,
  mouse/joystick/action/movement bindings, and accepted view-size changes. Desktop
  helper is a no-op. Sensitivity/view cancellation should remain noncommitting;
  this still needs tests and actual browser checks.
- `wl_play.cpp`: `WolfWebHasKeyBinding` checks all direction/action bindings.
  WASD fallback applies only if the key has no explicit binding, preventing a
  custom W action from moving as well, W direction from moving twice, or custom
  A/D turning from also strafing. This intended precedence requires regression
  tests; no new gameplay acceptance has occurred.

Existing adapter `trackPersistentWrites` wraps native FS.write and marks the
framework mount dirty; the framework debounces sync at 750 ms, periodically
saves at 5 s and saves on lifecycle events. The adapter/framework have not been
edited for this draft. Do not assume those paths prove storage durability.

The canonical series still has six patches. `test-source.mjs` passed 6 patches /
13 files immediately before these three edits. It is expected to reject current
draft source until a seventh canonical patch is reviewed and registered. Old
passing tests are not evidence for the new code.

Recovery patch SHA256:
`cadbe60266e52bff5295e9a59f89ab21f927fc44916ab392ea07bb7278b0e046`.
The patch is deliberately **not** listed in `patches/series`.
`git apply --check --reverse` against the current prepared tree passes (check
only, no reversal performed). A temporary baseline copy of all three six-patch
files remains at `/tmp/wolf-config-prefix-KHQFXs`; do not rely solely on /tmp.

Prepared draft file SHA256:

```text
64c720216bfe8055b1968501b8ae6a85372306cd29e241d0f3d58cec9e507934  wl_main.cpp
3ed138ce3fc0c93d0fae5250b9c581e64e7d63fa846c7513333ba1e5fe229edc  wl_menu.cpp
c47bea7f3b5e3c396188e950e8ff18095acf1d50582e2866a34db539d1455e6e  wl_play.cpp
```

### Next implementation and verification steps

1. Finish the old-build s6 load check and retain the config-loss evidence.
2. Review the draft's migration, binding precedence and commit/cancel semantics.
3. Add real ReadConfig/WriteConfig roundtrip tests with actual SDK key enums;
   cover defaults, legacy exact-WASD migration, arbitrary custom directions,
   marked intentional WASD, action/mouse bindings, settings, repeated writes and
   old-code negative controls. Do not imply entire corrupt-file handling is fixed.
4. Update `scripts/test-keyboard-movement.mjs`: it currently extracts only four
   unconditional reset lines; it must test the actual migration and fallback.
   Update its fixture for action bindings and customized-layout cases.
5. Update `scripts/test-gameplay-input.mjs` to extract/include the new helper
   with PollKeyboardMove (including desktop and real SDK modes). Update the
   old unconditional-reset assertion in `scripts/test-adapter-contract.js`.
   Add the persistence suite to root `wolf3d-wasm/build-web.sh`.
6. Register a reviewed seventh canonical patch, preserving original patch bytes
   and all earlier changes. Validate exact reconstruction and all prefix/source
   preparation tests. When generating unified patches, preserve trailing blank
   context lines: trimming them makes patches corrupt.
7. Clean-build both variants, run the complete suite, assemble new isolated
   images and check their exact installed/effective-framework bytes. Fresh ports
   32998/32999 were only proposed, not reserved; check availability first.
8. Real Chrome acceptance on both: native save/full reload/load, custom action
   and movement binding durability, accepted settings, canceled changes, default
   WASD behavior, first-level movement/firing/pause/resume. No live promotion
   until the new source/build/image/browser evidence supports it.
9. Scoped live promotion, if ready, must preserve mounts/volumes/owner data and
   other containers, retain rollback, pin exact lab IDs, and validate afterward.

## Build and release references

Live Wolf image: `sha256:8cf8bfa5554c763718a0b423f8b248b15acae777a67e69fbb190aba633a885f5`.
Live Spear image: `sha256:94477cd29268528896f64ad1dce7a9b032a7013913b16e83b18e9d696be47a88`.
Both were rechecked with Docker inspect at handoff. Tags:
`local/wolf3d-wasm:keys-context-20260906` and
`local/spear-wasm:keys-context-20260906`, also the canonical `*:dev` tags.
Rollback IDs/tags and scope are in the [binding release](wolf3d-wasm/proofs/BINDINGS-RELEASE-2026-09-06.md).

Retained final proof containers:

- `wolf-keys-context-proof-20260906`: 32996
- `spear-keys-context-proof-20260906`: 32997 (current browser)
- Earlier diagnostic 32994/32995, input 32992/32993 and palette 32990/32991 remain.
- `wolf-family-keys-build-20260906`: exited 0. Its log is
  `/tmp/wolf-family-keys-build-20260906.log`.

SDK toolchain: `local/build-wasm-toolchain:6.0.6`, verified image
`sha256:9bc6c7b128b567c4001321ef4167356b672e8129673991f6aec946ba53a393e0`.
Existing effective framework image:
`local/wasm-game-framework:wolf-capture-context-20260906`,
`sha256:73821385112cb6df46f650859a4cc0e6718b3e6aef07f70cf1d58e08c287f330`.
The shared checkout is version 0.9.6 at `ebb1ebe35ad8224a9080279a6529414db42d3284`
with accumulated local fixes. Preserve them; a clean upstream image is not the
same package. Real SDL key headers are under
`idtech4-wasm/.work/emscripten-cache-6.0.6/sysroot/include/SDL`.

After canonicalizing and testing the draft, use a new unique build container:

```sh
docker run --name wolf-config-build-NEXT --user 0:0 \
  --mount type=bind,src=/home/ted/Development/wasm-games,dst=/src \
  --mount type=bind,src=/home/ted/Development/wasm-game-framework,dst=/framework,readonly \
  -e WASM_FRAMEWORK_DIR=/framework -e JOBS=4 \
  -e EM_CACHE=/src/idtech4-wasm/.work/emscripten-cache-6.0.6 \
  -e GIT_CONFIG_COUNT=2 \
  -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0=/src/wolf3d-wasm/.work/wolf4sdl \
  -e GIT_CONFIG_KEY_1=safe.directory -e GIT_CONFIG_VALUE_1=/framework \
  -w /src local/build-wasm-toolchain:6.0.6 \
  bash /src/wolf3d-wasm/scripts/test-web.sh
```

This command has **not** been run for the draft. Replace NEXT with a unique
identifier after checking existing containers. Poll an actual returned process
handle until terminal; do not start duplicate builds because an observation
times out. Capture a new log and preserve failures.

Read-only lab audit: `./validate.sh --images` in the lab directory. Do not rerun
historical before/after release audits against a changed source/dist/container
inventory. Frozen Wolf binding evidence covers 39 pairs/82 hashes; earlier input
and palette records are historical. Reusing their autodiscovery stems can corrupt
the meaning of those frozen evidence sets.
