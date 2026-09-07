# SimCity save completion and diagnostic controls — 2026-09-06

## Finding

**Dismiss the native `Game Saved As` confirmation before reloading or closing
the page.** SimCity has not finished its save while that confirmation is open.
Allow the page's normal persistence sync to finish after dismissal.

The earlier Chrome test on timing candidate **32944** reloaded with this
confirmation still visible. `SIMF906.SC2` survived, as did its April 1961 date
and $19,990 cash, but its map did not restore. Loading the supplied HAPPYLND
city worked; loading SIMF906 afterward changed the header but left HAPPYLND's
terrain/buildings in place. This is not a renderer failure, and neither the
name/date/cash nor file-list presence alone proves successful restoration.
The incomplete SIMF906 save has not been overwritten or repaired.

## Native isolation

An isolated run of the exact timing-fixed Wasm, without IDBFS or browser
storage, creates a city and displays its native save confirmation. Exporting
only this newly generated file while the confirmation is open finds all 21
chunks, but a zero FORM length. The baseline export is 50,939 bytes; its header
should describe 50,931 bytes. The four-byte size field is part of the
[documented SC2/IFF layout](https://github.com/OpenCity2k/SC2k-docs/blob/master/sc2%20file%20spec.md).
This source is an independent format description, not an official Maxis spec.

The native I/O trace records the decisive sequence: body writes, rewind to
offset zero, a pause at the confirmation, then—after Escape dismisses it—a
12-byte header write containing `FORM 0000c6f3 SCDH` and file close. That final
size is exactly 50,931. This evidence is independent of browser persistence.

- [Before/experimental header and chunk summaries](simcity-save-header-2026-09-06.json)
- [Baseline native I/O, including the later dismissal](simcity-save-before-io-2026-09-06.json)
- [Confirmation still open](simcity-save-before-confirmation-2026-09-06.png)
- [After dismissal](simcity-save-before-dismissed-2026-09-06.png)
- [Native samples](simcity-save-before-samples-2026-09-06.json)

Raw generated SC2 files remain in private scratch directories, not Git or an
image. No browser filesystem/storage or owner-provided city was exported.
Native scratch: `/tmp/simcity-save-trace.7IStvx` (180-second completed run),
plus the earlier `/tmp/simcity-save-native.hZGUAN` (600-second completed run).

## Rejected buffering hypothesis

A temporary WebAssembly-only `fflush` after each DOS write fixed a deliberately
open-file diagnostic's pending host buffer. It **did not fix SimCity's open
confirmation**: the actual game still had not issued the final header write.
The experimental city's 50,760-byte file still declared a zero length.

The change, its source patch and its specialized host tests were removed.
Rebuilding after withdrawal restored the exact original timing-fixed JS/Wasm
hashes. No production save workaround remains; the experiment never went live.
The experimental container on **32945** is retained only as rejected evidence:
`simcity-save-chrome-proof-20260906`, image
`bcb73af2aadfcf070695688d7e3c8d05bd2424f9ac521e89669b8979beb07f82`.
Its Wasm is `6aa423331610effe5c748b57e6623ee84ac5f6aa62b6b9ef48a004e9d7bf62c9`.
**Do not deploy this experiment as a SimCity save fix.**

[Experiment I/O](simcity-save-experiment-io-2026-09-06.json),
[confirmation](simcity-save-experiment-confirmation-2026-09-06.png),
[samples](simcity-save-experiment-samples-2026-09-06.json), and
[package identity](simcity-save-package-2026-09-06.json) preserve the result.
Only one of 28 packaged files differs from 32944; 13 HTTP comparisons pass.
Those checks establish identity, not feature acceptance. GTA/NFS native smoke
checks also passed on the experiment; they do not override its failed save
hypothesis. A preceding 90-second fixed-time probe remained at the founding
newspaper and exported no save; it is not save evidence.

## Native controls and test additions

The interactive native diagnostic established held File/Speed pull-downs and
Save City. Its screenshots also establish the real shortcuts:

- `Alt+P`: Pause (not a toggle).
- `Alt+1`, `Alt+2`, `Alt+3`: Turtle, Llama, Cheetah; Alt+2 resumes.
- `Alt+S`: Save City; `Alt+L`: Load City.
- Escape dismisses native newspapers and the save confirmation.

[Speed menu](simcity-native-speed-menu-2026-09-06.png),
[File menu](simcity-native-file-menu-2026-09-06.png), and
[native save](simcity-native-save-2026-09-06.png) are from the earlier completed
interactive run. They do not establish Chrome held-mouse acceptance.

`DOSBOX_NATIVE_INTERACTIVE=1` requires `DOSBOX_NATIVE_REPORT_DIR` and disables
automatic keys unless explicitly supplied. Stdin JSON supports `sample`,
normalized SDL `mouse` events and native `key` edges. For SimCity only,
`export-save` accepts a new uppercase DOS 8.3 SC2 name, rejects owner-provided
cities and uses exclusive host-file creation. `DOSBOX_NATIVE_TRACE_SAVES=1`
records new-city write/seek/close operations, never browser storage access.
Eight valid input cases and 19 invalid cases exercise the shared dispatcher.

`test-native-runtime.js --files` runs a source-only NASM program in the real
Wasm. It strictly checks a 90 KB multipart file, 32-bit seek positions, header
backpatch, close/reopen and readback. A separate still-open file is reported
as an observation, not a completed-save acceptance requirement. The full DOS
suite includes this diagnostic and the input-dispatch tests.

## Browser follow-up

**Completed-save restoration passes in actual Chrome on timing candidate
32944**, with no save-code change. The fresh `New City` starts in January 1950.
Three clicks on clear land at CSS `(900,350)`, `(930,350)` and `(960,350)` place
three separate road markers; cash becomes $19,970. Alt+S shows `NEWCITY.SC2`.
Escape dismisses the confirmation, and the unobstructed city is captured before
the full page reload. The new engine launch lists NEWCITY and loads it with the
same name, January 1950, $19,970, river/hills/trees and all three road markers.
Alt+2 resumes the restored simulation to April 1950; Alt+P pauses it again.
The stored January save is preserved. The old incomplete SIMF906 is untouched.

[Road markers](simcity-completed-save-roads-2026-09-06.jpg),
[confirmation](simcity-completed-save-confirmation-2026-09-06.jpg),
[dismissed confirmation](simcity-completed-save-dismissed-2026-09-06.jpg),
[fresh launch](simcity-completed-save-reload-start-2026-09-06.json),
[restored file list](simcity-completed-save-load-list-2026-09-06.jpg),
[restored map and values](simcity-completed-save-restored-2026-09-06.jpg), and
[resumed simulation](simcity-completed-save-resumed-2026-09-06.jpg) document
this sequence. Screenshots, not the shell's generic `gameplay` dataset, establish
native UI state. Chrome control used normal visible controls and read-only DOM
inspection, never hidden game calls or browser-storage access.

## Timing-only deployment

After that pass, the **original timing candidate**, not the rejected flush
experiment, was installed on **8025** at 07:46:57 UTC. The image is
`1125605b4db5cd0746ad13dc2f5b108f17ca0f267a7d0baceadb41114590a96c`,
under canonical tag `simcity2000-wasm:dev`. New container:
`91e0b7cae2eab44b203497f18435997140bafcf7da4beaa7c51c1b3fe078f515`.

Only `dosbox.js` and `dosbox.wasm` differ from the previous installed image;
the other 26 package files, including adapter/framework/config, are unchanged.
The [installed package check](simcity-installed-package-2026-09-06.json)
passes 13 exact HTTP comparisons, 30 ready owner files and private-root 404s.
Use `node dosbox-wasm/scripts/test-simcity-package.js --installed` to repeat it;
the original no-flag pre-promotion record is intentionally preserved separately.

The post-deployment Chrome check on **8025** reaches the native
[main menu](simcity-installed-timing-menu-2026-09-06.jpg), opens the supplied
[city list](simcity-installed-timing-load-list-2026-09-06.jpg), and loads
[HAPPYLND with terrain, buildings, roads and labels rendered](simcity-installed-timing-city-2026-09-06.jpg).
The simulation advances from June to August 2031, with $23,482 visible, before
Alt+P [pauses it](simcity-installed-timing-pause-settled-2026-09-06.jpg).
No save was issued; the owner-provided city was not overwritten. This live
load/render smoke supplements the completed-save proof on the identical
32944 image above; it is not a second save/reload test on the 8025 origin.

The full DOS suite and lab image audits pass. The
[container comparison](simcity-promotion-2026-09-06.json) verifies the identical
SimCity data mount and all **94 other containers unchanged**. Mount arrays are
sorted by destination for comparison because Docker returns them in varying
order; IDs, images, starts, restart counts and status are compared exactly.
RTCW SP was not rebuilt or restarted. Blood's crash remains deferred.

Rollback image `41790b80c75753cbe03ef523cf44490078101e33c8fada0678ea0eac15446a09`
remains tagged `local/dosbox-wasm:simcity-timing-baseline-20260906`. A rollback
would retag that image to `simcity2000-wasm:dev` and recreate only the
`simcity2000` Compose service with `--no-deps`; no data deletion is needed.

Broad mouse/menu gestures, audible playback and sustained performance
acceptance remain open. This does not mark the entire original row 34 fixed.
