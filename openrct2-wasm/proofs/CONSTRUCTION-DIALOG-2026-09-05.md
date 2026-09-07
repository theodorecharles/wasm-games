# OpenRCT2 construction and browser dialogs — 2026-09-05

The [sprite-path checkpoint](RCT1-SPRITE-PATH-2026-09-05.md) exposed two
remaining native defects: entrance/exit preview cleanup used the newly
selected tool's identity, and save/load probed desktop programs from a browser
worker. Both are repaired and tested in isolated Chrome candidate 32938.
RCT1 Forest Frontiers still starts cleanly. RCT2 construction, completed ride
trips, native Save As, full-page reload, native Load and resumed operation pass
without either diagnostic. Live 8026 and owner installation data are unchanged.

Work began September 5 local time and continued after midnight September 6.
Artifact names retain the starting date; JSON observations carry UTC times.

## Construction: retain the placed preview's identity

`RideConstruction.cpp::EntranceClick()` and `ExitClick()` change
`_currentRideIndex` and `gRideEntranceExitPlaceType` before invalidating the
old construction preview. `world/Entrance.cpp` retained the preview's position
and station but used those current selection globals to remove or restore it.
Switching tools could therefore remove an exit where an entrance preview
actually existed, producing `Entrance/exit element not found` and leaving the
old ghost element behind. The [preceding Chrome trace](rct2-sprite-path-saved-2026-09-05.json)
records this at x=960, y=2272, ride=2, station=0.

`construction-ghost-identity.patch` records the ride ID and entrance/exit type
when placement succeeds. Removal and provisional restoration use that saved
identity, independently of the next selected tool. Existing ghost flags and
temporary-remove/restore behavior remain intact. The patch does not change
real placement/removal actions, their validation or diagnostic messages.

`test-construction-ghost.mjs` compiles the exact native ghost functions,
construction cleanup and both actual UI click handlers. Its action fixture
checks identity, ghost flags and preservation of real elements. Twenty-eight
cases cover both tool directions, same/changed ride, stations, provisional
remove/restore, rejected replacement and the empty lifecycle. The fixture runs
with ASan and UBSan; existing desktop interposers remain loaded behind the
compiler's ASan runtime. Source guards compare real action code against the pin.

The old source compiles but fails the actual tool-switch cleanup:
`missing removals=1 real removals=0 elements=2`. The repaired 28 cases pass.
This is a bounded exact-method test, not a complete map-engine replacement.

## Browser dialogs: report the actual capability

`FileBrowser::OpenPreferred()` asks `HasFilePicker()` even when the built-in
browser is preferred. The compiled Linux UI context's `GetDialogApp()` probed
`zenity --version` and `kdialog --version`; the Wasm platform cannot spawn them.
The [old saved trace](rct2-sprite-path-saved-2026-09-05.json) retains both warnings.

`browser-dialog-capability.patch` makes `GetDialogApp()` return `none` under
`__EMSCRIPTEN__`. This correctly reports absent external file/menu-dialog
capability and uses the existing built-in UI. Desktop zenity preference and
kdialog fallback remain unchanged. No user configuration is forced or
rewritten, no log is filtered and the built-in save/load implementation is
unchanged.

`test-browser-dialog.mjs` compiles the actual capability methods and complete
`FileBrowser::OpenPreferred()` with controlled system/UI dependencies. Sixteen
browser and sixteen desktop cases cover all zenity/kdialog availability pairs,
both native-dialog preferences, and load/save. Checks include zero browser
probes, desktop preference/fallback, capability caching, menu capability,
null/output path handling, preservation of config and complete forwarding of
the built-in window arguments. The old source compiles but fails the browser
case with two desktop probes; all 32 repaired cases pass.

## Build, package and isolation

Both patches are listed in `patches/series` and `sources.json`, following
`browser.patch` and `rct1-sprite-path.patch`. The source remains owned pin
`4a7ee146caab8888eb31e56a33c0559db89b17bd`; `fetch-source` is idempotent.
The existing build completes its 28 incremental compile/link steps and exits
0 with the same pinned OpenRCT2 toolchain as the sprite-path checkpoint.
A separate link warning is preserved below, not treated as a clean build.

| Native artifact | SHA-256 |
| --- | --- |
| JS | `3804c09d04c17a601b612a7df114597dc2cf81536d6bf0aeb0a44e40f54c6672` |
| Wasm | `8687a1f0a25531e5dabec16a81180700e2112469eeda48b8dfc7641ac7cc987f` |
| Data, unchanged | `67d5eb15e5b656782492409c31241d4451bda0dff6ea9de845c94050a22b74a8` |

The full `test-framework-package` suite passes, including both new tests,
eight sprite-path cases, private-object/audio/cache tests, installation
validation, threaded Wasm validation and native export/persistence contracts.
Fresh `test-framework-image` checks pass for range/isolation, empty media,
innoextract and private boundaries.

The [19-file served package comparison](rct2-construction-dialog-package-2026-09-05.json)
checks the prior 32937 candidate against its recorded hashes and the new
32938 candidate against `.work/site`. Only native JS/Wasm change. Native data,
worker, adapter, framework, icons and other public files are unchanged. All
22 private supplement payload paths remain 404; extensionless fallbacks return
the exact launcher HTML, not an installation listing.

Candidate `http://127.0.0.1:32938/`:

- Image `local/openrct2-wasm:construction-dialog-candidate`, SHA-256
  `71012d0e9e7a371c0852b6f570d38266c4fad17e3bd53cce1254afd72807833b`.
- Container `openrct2-construction-dialog-chrome-proof-20260905`, ID
  `a9b2972eb994a0606098b2c832265fbe12377e16535bc5bbec71388582861cba`,
  started `2026-09-06T03:53:15.08104871Z`, restart count 0.
- Read-only root, temporary `/tmp`, read-only private data bind from
  `/home/ted/wasm-game-data/openrct2-objects-proof-20260905-v2`.
- Same private entry `c198ff7ec1c45e01be311b1906e75c66`, 2,975 files /
  1,228,645,759 bytes as candidate 32937.

The prior staged site is retained at
`/tmp/openrct2-construction-dialog.4XWG2O/previous-site`; its image and container
remain available. Historical package checkers target their own checkpoint;
do not weaken their old hashes to match newly staged native output.

Live `wasm-openrct2` remains ID
`5b5cd120543143acf8f46e0a2527ee7f823c0ff648aeea62c6138b92fccdfade`, image
`e00af4e3735efae516493824168208c57f1c41b47d43a679beb777957d942493`, started
`2026-09-03T21:52:26.394730615Z`, restart count 0. Its original data bind and
the prior candidates are unchanged. No live promotion was performed.

## Actual Chrome regression and persistence

Chrome-control supplies normal Play, native canvas clicks/keypresses and
full-page navigation. No hidden engine/storage access, simulation acceleration
or input-timing workaround is used. Read-only DOM checks inspect existing
mirrored telemetry and the loading log. Screenshots are manually reviewed;
their hashes are provenance, not a visual oracle.

The [initial title trace](rct2-construction-dialog-title-2026-09-05.json)
completes 2,506-object / 143-scenario indexing. Native New Game → RCT1 →
Forest Frontiers renders the [park/objective](rct1-construction-dialog-start-2026-09-05.jpg)
with no fallback-sprite or missing-object warning. Native New Game → RCT2 →
Electric Fields renders its [park/objective](rct2-construction-dialog-start-2026-09-05.jpg).

At 1424×1057, a new blue/white merry-go-round is placed near the path at
(937,569), initially zoomed out. The earlier problematic sequence is repeated:
toggle the automatically selected Entrance tool off, click the world, zoom
in once, click (1096,642) while the tool is off, reactivate Entrance and click
(1096,642) again. Then toggle the automatically selected Exit tool off, click
(1128,658), reactivate Exit and click that tile again. The
[completed entrance/exit](rct2-construction-dialog-built-2026-09-05.jpg) and
[native trace](rct2-construction-dialog-built-2026-09-05.json) have no missing-element
error. Historical Chrome is not claimed to have identical frame timing; the
compiled negative control independently establishes the causal tool-state bug.

Two queue tiles at (1064,658)/(1032,674) and two ordinary path tiles at
(1096,674)/(1064,690) connect the entrance and exit to the existing park path.
Native ride status advances through testing to open. Normal-speed simulation
boards guests and completes trips. The
[operation screenshot](rct2-construction-dialog-operated-2026-09-05.jpg) shows
10 currently aboard, five total completed customers, 160/hour and a two-minute
queue. The [corresponding trace](rct2-construction-dialog-operated-2026-09-05.json)
still contains no warning/error. Native `Guest::onExitRide()` increments total
customers, distinguishing completed trips from the aboard count.

Native pause → Save Game As opens the built-in browser without desktop probes.
Fifteen Backspaces and the twelve-character unique name
[`RCT2Ghost905`](rct2-construction-dialog-save-name-final-2026-09-05.jpg) produce
54 native key edges. The [saved park](rct2-construction-dialog-saved-2026-09-05.jpg)
has $9,178.50, 93 guests and April 10, Year 1. Its
[persistence is flushed](rct2-construction-dialog-saved-2026-09-05.json) before
the entire page is reloaded; no existing named save is overwritten.

Fresh Play → native Load lists the [30 KiB park](rct2-construction-dialog-load-menu-2026-09-05.jpg),
again without desktop probes. Loading restores the
[same paused park](rct2-construction-dialog-reloaded-2026-09-05.jpg): exact cash,
guest count and date, plus the carousel, entrance/exit and connections.
[Fresh native counters](rct2-construction-dialog-reloaded-2026-09-05.json) reset
to zero key edges and a lower draw count. Native resume returns to
[gameplay](rct2-construction-dialog-resumed-2026-09-05.json); the
[restored ride pane](rct2-construction-dialog-restored-ride-2026-09-05.jpg) shows
a green open flag, `Rotating` and ten people on the ride.

The [recorded evidence checker](rct2-construction-dialog-chrome-2026-09-05.json)
passes chronology, clean diagnostics, native input, flushed save and
fresh-engine reload/resume checks. It does not independently recognize park
or ride imagery. The proof tab was paused and navigated to `about:blank` after
testing. `RCT2Ghost905` remains in Chrome on origin 32938; earlier saves on
32937 remain untouched.

## Remaining observations and next work

Follow-up: the [ride-music checkpoint](RIDE-MUSIC-2026-09-06.md) repairs the
signature warning below, with complete old/new strict-link controls and
Chrome Diamond Heights music-setting/save/reload coverage. This section
retains the observations made at the construction/dialog checkpoint.

The successful native link emits a function-signature mismatch for
`OpenRCT2::RideAudio::RideMusicGetTrackOffsetLength_Default(const Ride&)`:
`() -> void` from `EditorInventionsList.cpp.o` versus `(i32, i32) -> void` from
`libopenrct2.a(RideAudio.cpp.o)`. Its source declaration/definition both return
`std::pair<size_t, size_t>`. The GUI object is ThinLTO bitcode while the core
object is ordinary Wasm, both unchanged from the preceding native build.
Reading the stored GUI bitcode with the pinned clang and explicit
`--target=wasm32-unknown-emscripten -S -emit-llvm -x ir` confirms the external
declaration has already become `declare void ...()` there. The first inspection
omitted the target and warned about overriding it; the corrected inspection
confirms the same declaration with the original Wasm target. No clean rebuild,
optimization disabling or signature workaround has been applied. The impact
on ride-music callbacks remains unverified and is the next bounded native lead.

Reload also says `object index out of date` and rebuilds 2,506 objects in 2.45
seconds; startup/cache invalidation behavior is not fixed or accepted here.
Audio runs at 48 kHz with nonzero drops/underruns; there is no listening or
audible-playback acceptance. Wider construction, longer parks and live
promotion remain open. Neither fixed diagnostic implies full-game acceptance.

Re-run from `openrct2-wasm` without replacing the live service:

```sh
games/openrct2/scripts/test-framework-package
node games/openrct2/scripts/test-construction-ghost.mjs
node games/openrct2/scripts/test-browser-dialog.mjs
# Both old-source controls are expected to exit 1 after successful compilation.
OPENRCT2_GHOST_LEGACY=1 node games/openrct2/scripts/test-construction-ghost.mjs
OPENRCT2_DIALOG_LEGACY=1 node games/openrct2/scripts/test-browser-dialog.mjs
games/openrct2/scripts/test-framework-image local/openrct2-wasm:construction-dialog-candidate
node games/openrct2/scripts/test-construction-dialog-package.mjs
node games/openrct2/scripts/test-construction-dialog-evidence.mjs
```
