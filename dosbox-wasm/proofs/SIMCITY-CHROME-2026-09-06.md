# SimCity 2000 timing and Chrome checkpoint — 2026-09-06

## Result and boundary

The isolated candidate on **32944** applies the existing DOSBox CPU timing
repair to SimCity 2000. In a matched native test it reaches the main menu by
the 25-second capture; the installed engine is still at the registration splash
at 30 seconds. This is native Wasm with a simulated 4 ms timer minimum, **not
a controlled Chrome load-time benchmark**.

Actual Chrome creates a city in both builds. The candidate accepts a unique
name and the 1950 starting year, renders the city, advances its date, selects
the road tool and places one $10 road tile at the clicked location. A later
[save investigation](SIMCITY-SAVE-2026-09-06.md) establishes native shortcuts
and explains why reloading before dismissing `Game Saved As` loses map state.
Completed-save restoration now passes with matching terrain, three roads,
date and cash, followed by resumed simulation. The timing candidate was
installed on **8025 at 07:46:57 UTC**; see the linked deployment record.
Chrome held top-menu operation, broad pointer alignment, audible playback and
performance acceptance remain open.
No new native workaround or input-duration modification was added.

## Native timing comparison

Both sequential runs use the same 30 owner files, fresh in-memory DOS drives,
no input, a 30-second observation window and the same minimum timer setting:

```sh
DOSBOX_NATIVE_MIN_TIMER_MS=4 DOSBOX_NATIVE_KEYS='[]' \
DOSBOX_NATIVE_REPORT_DIR=REPORT DOSBOX_NATIVE_SAMPLE_MS=5000 \
node dosbox-wasm/scripts/test-installed-runtime.js SITE simcity2000 \
  /home/ted/wasm-game-data/dosbox 30000
```

`SITE` is the exact live extraction for the baseline, and `dosbox-wasm/web/dist`
for the repaired native pair. Scratch evidence is retained under
`/tmp/simcity-runtime-proof.rCxfCQ/{old,old-run,current-run}`.

| At 30 seconds | Installed native engine | Timing-fixed native engine |
| --- | --- | --- |
| Inspected screen | Registration splash | Main menu |
| Native audio callbacks | 1,297 | 1,297 |
| Nonzero native callbacks | 2 | 1,196 |
| Nonzero page audio buffers | 2 | 1,115 |
| CPU-cycle diagnostic | Not exported | 24,640 |

The repaired cycle samples range from 24,640 to 32,607. These are governor
settings, not MHz or FPS. The baseline's unavailable cycle export is recorded
as null, not zero. Fewer changing frames in the candidate reflect reaching a
static menu earlier; they do not establish worse frame rate. Nonzero PCM is
not a listening check.

Repository evidence: [baseline samples](simcity-native-baseline-samples-2026-09-06.json),
[candidate samples](simcity-native-candidate-samples-2026-09-06.json),
[baseline 30-second screen](simcity-native-baseline-30s-2026-09-06.png), and
[candidate 30-second screen](simcity-native-candidate-30s-2026-09-06.png).
The existing [GTA timing checkpoint](GTA-2026-09-04.md) describes the exact
production governor repair and old-source negative control; it is reused here.

## Actual Chrome observations

The Chrome-control skill was used through normal launcher/native controls and
read-only visible DOM inspection. No hidden engine calls, console commands,
browser-storage reads or synthetic page input were used.

- Installed 8025 reaches its native main menu, then Start New City opens the
  options dialog. Individual key presses enter `simp906`; clicking 1950 selects
  that year. Done starts the city and its founding newspaper. Escape dismisses
  the newspaper; the native map shows the city name, September 1950 and $20,000.
  This throwaway city was not saved and contained no construction.
- Candidate Play was issued at approximately 06:33:24 UTC. The 06:33:42 capture
  is still the registration splash; 06:33:52 shows the actual main menu.
  These observations bound this run, not an exact time-to-menu measurement or
  a paired cold-cache comparison with the installed origin.
- Candidate Start New City, name `simf906`, 1950 and Done all work. The native
  city and founding newspaper render. Escape/Enter dismiss annual dialogs.
- A single unobstructed road-tool click selects **Road $10**. After an annual
  budget dialog is dismissed, clicking open land at CSS `(675,400)` places a
  small road tile there. Cash changes from $20,000 to **$19,990**; moving the
  pointer away leaves the tile visible. Later captures retain it as time advances.
- The 640×480 native canvas is displayed at approximately 1410×1057 CSS pixels,
  offset `(7,0.3)`. No pointer lock is requested. Read-only hit testing confirms
  the top File target and the road toolbar are both on the game canvas, with
  no page overlay above either target.

Useful inspected captures:
[installed typed name](simcity-installed-name-keys-2026-09-06.jpg),
[installed city](simcity-installed-newspaper-dismiss-2026-09-06.jpg),
[candidate main menu](simcity-candidate-main-menu-2026-09-06.jpg),
[candidate options](simcity-candidate-city-options-2026-09-06.jpg),
[selected road tool](simcity-candidate-road-retry-2026-09-06.jpg),
[placed road and cash](simcity-candidate-road-placed-check-2026-09-06.jpg), and
[tile with pointer moved away](simcity-candidate-file-click-2026-09-06.jpg).
Each has a matching JSON observation; the shell's `gameplay` dataset means only
that the DOS executable launched, not that a specific native screen was reached.

## Input limitations and unsuccessful checks

Early File and Speed clicks/short drag gestures did not establish a usable pull-down
in either browser run. A candidate capture during a normal File drag likewise
shows no pull-down. Early Ctrl+S and Alt+S attempts did not establish a save
dialog. Later clean Alt+S testing creates a save, as detailed in the linked
follow-up; its confirmation must be dismissed to complete the write. These
early results are not a diagnosed native menu defect.

Several early capture names describe the attempted operation, **not its result**.
In particular, installed `city-view` shows another newspaper; `speed-shortcut`,
`save-dialog`, `file-menu` and `speed-gesture` show annual budget dialogs.
Candidate `menu` is the registration splash; `main-menu` is the real menu.
Candidate `road-click` and `road-placement` show budgets, whereas `road-retry`
and `road-placed-check` establish the later successful operations. Delays between
actions allowed additional annual dialogs to appear; those clicks cannot be
used as clean menu/pointer failures. An installed budget-dismiss drag also moved
the underlying map window; it is not a precise-click acceptance result.

An engine-free [mouse-event page](../tests/mouse-browser.html) receives normal
trusted mouse events without synthesizing them. The same click operation held
the left button for **1.9 ms**; the four-point drag held it for **2,026.4 ms**.
[Recorded events](chrome-mouse-timing-2026-09-06.json) contain coordinates, button
bits and timestamps. This characterizes the control gesture, not all in-game
delivery or the cause of the top-menu result. No minimum hold hack was applied.
Pasted `cua.type` text did not populate the DOS name field; individual key presses
did. That does not establish that ordinary physical typing is broken.

Additional fixed-time native menu probes did not reach a clean menu test: their
inspected captures still show the new-city dialog or the founding newspaper
when the Speed input is sent. They are **not menu failures or passes**. Retained
scratch directories are `/tmp/simcity-menu-native.lUWZvH`,
`/tmp/simcity-menu-native-repeat.BGYsKa`,
`/tmp/simcity-menu-native-spaced.e3CTaA`, and
`/tmp/simcity-menu-native-settled.IJQ5jN`. The separate
`/tmp/simcity-menu-native-final.DWbtUT` process ended with SIGTERM after its
56-second sample, before the planned menu input; it is not a completed run or
evidence of a game crash. A future probe must confirm/dismiss each actual
dialog instead of assuming a timestamp establishes its state.

## Package, source and tests

Candidate `simcity-timing-chrome-proof-20260906` uses image
`1125605b4db5cd0746ad13dc2f5b108f17ca0f267a7d0baceadb41114590a96c`,
tag `local/dosbox-wasm:simcity-timing-candidate`. It derives from the exact live
image `41790b80c75753cbe03ef523cf44490078101e33c8fada0678ea0eac15446a09`
and mounts the same owner DOS data read-only. Build context:
`/tmp/simcity-timing-candidate.39RixT`.

`node dosbox-wasm/scripts/test-simcity-package.js` passes: 28 packaged files
compared, **only `dosbox.js` and `dosbox.wasm` change**, 26 files stay identical,
13 public HTTP payloads match, all 30 SimCity data entries are ready, and raw
data roots plus private package metadata return 404. The candidate retains the
installed adapter, framework, pointer config and manifest. See the
[exact package record](simcity-package-2026-09-06.json).

Reused source is canonical owner commit
`8bde9c0d99858cd7bced3887885f6d4cd0a9efd3`, with runtime patch
`fd71f43e942b6a938296b31d0fe38b91889c404321c03009076402eeea507869`
and keyboard patch
`16a0eda0a0b8eb80028ffd9ac51a37420a5ff3d65409f0a97bd21d69171aff03`.
No native rebuild was needed. Candidate/staged Wasm SHA-256:
`968e799bacb2a42c3e5260457e220c9a7421b55d095832db1bfe1b731aaf386f`.

The complete no-rebuild DOS suite passes, including nine adapter/data variants,
the production governor, 70 DOS BIOS keys, scaled native absolute pointer and
first-click state, Wasm validation, package contracts and HTTP/private-data
checks. Its initial run found the generated staged shell predating the adjacent
framework's earlier capture changes. Refreshing only that generated shell copy
with the existing installer resolved the mismatch. This does **not** change the
candidate or live shell. The legacy extracted engine cannot run the full current
pointer test because it lacks the required CPU-cycle export; that failed
capability check is not counted as a pointer pass and the release gate was not
relaxed.

The basic BIOS probe's fake canvas also accumulated duplicate SDL handlers
across video-mode changes and did not implement listener removal. Corrected
that test double to match the installed-game probe's existing deduplication
and removal behavior. `test-canvas-listeners.js` exercises both exact factories
for three mouse event types, repeated registration, independent callbacks and
removal; old-policy negative controls fail as expected. It runs in the full
DOS suite. This does not change production code and **cannot explain the
installed-game menu result**, whose harness already deduplicated handlers.

## Next checks

Native top-menu consumption, File/save, completed-save full Chrome reload and
resumed simulation are established in the linked follow-up. The original
timing candidate is now installed, with all other containers unchanged. Do not
infer general pointer correctness from the checked road placements or mark row
34 fully fixed. Blood remains deferred; RTCW single-player, existing user saves
and host owner files are unchanged. Broader mouse, listening and performance
checks remain.
