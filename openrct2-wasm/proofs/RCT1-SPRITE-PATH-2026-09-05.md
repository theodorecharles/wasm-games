# OpenRCT2 RCT1 sprite-path repair — 2026-09-05

The [private scenery checkpoint](RCT1-OBJECTS-2026-09-05.md) exposed a second
defect: Forest Frontiers reported that RCT1 was not linked and used fallback
images despite the owner's valid RCT1 installation. This follow-up repairs
the native path disagreement. The isolated rebuilt engine starts Forest
Frontiers without that warning and restores its saved park after a full
Chrome page reload. Live 8026 and original owner data remain unchanged.

## Native cause and bounded repair

The worker supplies `--rct1-data-path=/RCT/RCT1`. `RootCommands.cpp` stores it
in `gCustomRCT1DataPath`; `PlatformEnvironment.cpp` resolves it as the RCT1
environment base, with command-line precedence over config. However,
`Drawing.Sprite.cpp::GfxLoadCsg()` previously read only
`Config::Get().general.rct1Path`. With empty saved config, it returned before
looking for either CSG file.

`rct1-sprite-path.patch` passes the same `IPlatformEnvironment` used by
`GfxLoadG1()` to `GfxLoadCsg()`. Both RCT1 header and sprite-data searches now
use `env.GetDirectoryPath(DirBase::rct1)`. The patch changes that function's
prefix, its declaration and the sole call in `Context::LoadBaseGraphics()`.
It does not set or rewrite user config. The patch is included in both
`patches/series` and `sources.json`.

The owner files remain unchanged: CSG1.DAT is 41,402,869 bytes and csg1i.dat
is 1,118,672 bytes / 69,917 entries, meeting the native Loopy Landscapes checks.
CSG validation, decoding, zoom-offset conversion and sprite lookup are
unchanged. `ImageTable.cpp` still selects fallback sprites when CSG is not
loaded; the park's fallback warning is not suppressed.

`test-rct1-sprite-path.mjs` compiles the exact native prefix through the point
before file IO. Eight cases cover explicit paths with empty/stale config,
configured paths, absent resolved paths, spaces, UTF-8 and `/`. Both file
probes must use the resolved root and config must stay unchanged. It also
checks the declaration/call and byte-compares the remaining sprite source
and image-table selection against the pin. The old source compiles but fails
the first explicit-path/empty-config case. These fixtures do not by themselves
prove decoding or rendering; those checks use the full build and Chrome.

## Real native build and isolated package

Source: owned `theodorecharles/openrct2-wasm` pin
`4a7ee146caab8888eb31e56a33c0559db89b17bd`, with `browser.patch` and the new
sprite-path patch. The native title identifies v0.5.4 / 4a7ee146c on HEAD.
The prior deployed native identifies v0.5.4-5 / d0c8486654; it is not claimed
to be a byte-identical source control. The exact-prefix negative control
independently reproduces the faulty path behavior.

The existing `build-framework-runtime` completes all 692 compile/link steps
and exits 0 using cached toolchain
`ghcr.io/openrct2/openrct2-build@sha256:0e1daa8e3f5a1c6951179aeab5c5de471ea705cb5f756bfb6e0ae5162b7e67be`.
One command-observation handle ended with 143 while Docker/clang remained
active; the build was not restarted. An attached `docker wait` observed the
actual build's successful exit. Fresh output is at `.work/openrct2/build-framework`.

| Artifact | SHA-256 |
| --- | --- |
| Native JS | `0a692b738549c4c8babe3053a1994c7260f04fb95ad4500ca5af4360c6589c8a` |
| Native Wasm | `6d94191b54b5ebfc9286fa667d062a0006fadb04508c3433f5d41e82793b34a0` |
| Native data, unchanged | `67d5eb15e5b656782492409c31241d4451bda0dff6ea9de845c94050a22b74a8` |

The staged package passes the full framework-package test, including threaded
Wasm validation, bounded installation validation, audio/cache/private-object
tests and native export/persistence contracts. Eight private stager tests pass.

Candidate `http://127.0.0.1:32937/`:

- Image `local/openrct2-wasm:rct1-sprite-path-candidate`, SHA-256
  `27851f04970e70f56200dd5d5c0604e3439947a212eaf9e632ff8276d60e77de`.
- Container `openrct2-rct1-sprite-path-chrome-proof-20260905`, ID
  `778dbcd9c41b268ec6a84e888510b22ddb0e1209ae90e616291f480f9daf6897`.
- Read-only root, temporary `/tmp`, read-only private data bind from
  `/home/ted/wasm-game-data/openrct2-objects-proof-20260905-v2`.
- Same private entry `c198ff7ec1c45e01be311b1906e75c66`, 2,975 files /
  1,228,645,759 bytes as the preceding 32935 candidate.

The [19-file package comparison](rct1-sprite-path-package-2026-09-05.json)
checks exact served versus staged bytes and the prior candidate's recorded
hashes. Only native JS/Wasm change. Native data, worker, adapter, framework
and all other public files are unchanged. The private inventories match.
Direct private payload paths return 404; extensionless unknown routes return
the exact launcher HTML, not a listing. Fresh-image range/isolation,
empty-media, innoextract and private-boundary checks also pass.

Live `wasm-openrct2` is still image
`e00af4e3735efae516493824168208c57f1c41b47d43a679beb777957d942493`, started
`2026-09-03T21:52:26.394730615Z`, restart count 0. Neither the live container
nor the original owner's entry was replaced. Prior proof candidates remain.

## Actual Chrome: RCT1

The Chrome-control skill supplies normal Play, native canvas clicks, filename
keypresses and full-page navigation. No hidden engine/storage manipulation,
capture-policy change or synthetic hold timing is used. DOM inspection reads
only existing mirrored telemetry and the visible loading log. Screenshots
are manually reviewed; their hashes are provenance, not a visual oracle.

Normal Play → New Game → RollerCoaster Tycoon → Forest Frontiers renders the
[park and objective](rct1-sprite-path-start-2026-09-05.jpg).
The [complete initial trace](rct1-sprite-path-start-2026-09-05.json) contains
22 private objects mounted, 2,506 indexed objects, 143 indexed scenarios and
completed indexing, without missing-object, CSG, fallback or other warnings.
The [old native run of this scenario](rct1-forest-frontiers-start-2026-09-05.json)
with the same supplemented installation explicitly reports fallback images.
Together with unchanged asset/image-selection code and the native negative
test, this supports the sprite-link repair; it is not an exhaustive sprite
atlas comparison.

Native pause, Save As and 54 key edges create the unique
[`RCT1Path905` save](rct1-sprite-path-save-name-final-2026-09-05.jpg).
[Persistence is flushed](rct1-sprite-path-saved-2026-09-05.json) before full
page reload. Fresh Play → native Load shows the
[53 KiB saved park](rct1-sprite-path-load-menu-2026-09-05.jpg).
Loading it restores the [same entrance, trees and path](rct1-sprite-path-reloaded-2026-09-05.jpg),
$10,000, 0 guests and March 2, Year 1, paused. The
[fresh engine record](rct1-sprite-path-reloaded-2026-09-05.json) has reset
key/draw counters, clean persistence and no fallback warning.
[Native resume](rct1-sprite-path-resumed-2026-09-05.json) returns to gameplay.
No existing save is overwritten.

## Actual Chrome: RCT2 operation and persistence regression

The same rebuilt engine starts [Electric Fields](rct2-sprite-path-start-2026-09-05.jpg)
through its native RCT2 scenario tab. A new red/white merry-go-round is built
near the existing path. Native construction adds separate entrance/exit,
two queue tiles and two ordinary exit-path tiles connected to the park path.
The native status control advances through testing to open.

The customer panel first shows [six guests aboard](rct2-sprite-path-boarded-2026-09-05.jpg).
After normal-speed simulation, the [operation screenshot](rct2-sprite-path-operated-2026-09-05.jpg)
shows six currently aboard, three total completed customers, 96/hour and a
one-minute queue. Native `Guest::onExitRide()` increments that total, unlike
the current aboard count. This extends the earlier construction-only checkpoint to
boarding and completed trips with usable connections. It is not long-term
park-management or all-ride acceptance.

Native pause and Save As create [`RCT2Path905`](rct2-sprite-path-save-name-final-2026-09-05.jpg)
with 52 filename key edges, preserving `RCT1Path905`. The
[paused saved park](rct2-sprite-path-saved-2026-09-05.jpg) has $9,255.70,
95 guests, April 8, Year 1, with the carousel, entrance/exit and both paths.
[The save is flushed](rct2-sprite-path-saved-2026-09-05.json) before a full
page reload. Fresh Play → native Load shows
[both separate saves](rct2-sprite-path-load-menu-2026-09-05.jpg), RCT1 at
53 KiB and RCT2 at 31 KiB. Loading the latter restores the
[same paused park](rct2-sprite-path-reloaded-2026-09-05.jpg): identical cash,
95 guests and April 8, Year 1, plus the constructed ride and both connections.
[Fresh native counters](rct2-sprite-path-reloaded-2026-09-05.json) reset and
persistence stays clean. [Native resume](rct2-sprite-path-resumed-2026-09-05.json)
returns to gameplay. The [restored ride window](rct2-sprite-path-restored-ride-2026-09-05.jpg)
shows a green open flag, `Rotating` and six people on the ride.

The [recorded evidence checker](rct1-sprite-path-chrome-2026-09-05.json)
passes both games' startup/save/fresh-engine reload/resume checks and retains
unrelated diagnostics. It does not OCR screenshots or treat counters as
proof of ride identity. The Chrome tab was paused and blanked afterward;
both uniquely named saves remain available on candidate 32937.

Re-run from `openrct2-wasm` (build/stage only when intentionally regenerating
artifacts; do not replace the live service):

```sh
games/openrct2/scripts/test-framework-package
node games/openrct2/scripts/test-rct1-sprite-path.mjs
# Expected exit 1: old native prefix fails the explicit-path/empty-config case.
RCT1_PATH_LEGACY=1 node games/openrct2/scripts/test-rct1-sprite-path.mjs
python3 games/openrct2/scripts/test-stage-installation-objects.py
games/openrct2/scripts/test-framework-image local/openrct2-wasm:rct1-sprite-path-candidate
node games/openrct2/scripts/test-sprite-path-package.mjs
node games/openrct2/scripts/test-sprite-path-evidence.mjs
```

## Remaining observations

Follow-up: the construction and desktop-dialog diagnostics below are now
repaired and Chrome-tested in the
[construction/dialog checkpoint](CONSTRUCTION-DIALOG-2026-09-05.md).
This section retains what was observed in the original sprite-path run.

Opening native save/load still probes unsupported `zenity --version` and
`kdialog --version`, generating two warnings. Source lead:
`FileBrowser::OpenPreferred()` unconditionally calls `UiContext::HasFilePicker()`;
the compiled Linux context probes desktop dialog executables. Built-in
worker-safe save/load nevertheless works. No workaround was added here.

Ride construction also records one `RideEntranceExitRemoveAction::Query`
`Entrance/exit element not found` error at x=960, y=2272, ride=2, station=0.
It appeared around entrance tool toggling/placement. The completed entrance,
exit and ride operate afterward. Its underlying stale/ghost removal cause is
not established or fixed; the full diagnostic is retained in the RCT2 records.

Audio telemetry advances at 48 kHz but has nonzero queue drops/underruns; no
listening or audible-playback acceptance is claimed. Longer park sessions,
broader sprite coverage, remaining diagnostics and live promotion stay open.
