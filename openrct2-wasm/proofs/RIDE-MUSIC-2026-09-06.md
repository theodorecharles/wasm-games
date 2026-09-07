# OpenRCT2 ride-music return type — 2026-09-06

The native signature warning from the
[construction/dialog checkpoint](CONSTRUCTION-DIALOG-2026-09-05.md) is repaired.
A complete pre-fix rebuild reproduces it; a strict full link fails before the
repair and passes afterward. The isolated Chrome candidate also runs RCT1
Diamond Heights with ride music enabled, completes additional passenger trips,
saves a unique park and restores its music setting after full-page reload.
This fixes a compiler/link contract defect, not a demonstrated gameplay crash
or an accepted audible-playback problem. Live 8026 remains unchanged.

## Cause and narrow repair

`RideAudio.h` declares both track-offset callbacks as returning
`std::pair<size_t, size_t>`. Some translation units only take their addresses
through ride descriptors and do not instantiate that return type. The pinned
Clang emits a placeholder `void()` declaration for an incomplete return type;
its [code-generation implementation](https://github.com/llvm/llvm-project/blob/358db292cc6a9a8a5448a296f643312289f328d7/clang/lib/CodeGen/CodeGenModule.cpp#L5185)
explicitly takes this path. Completing the pair before those declarations
preserves the hidden result pointer and the `Ride` pointer in Wasm IR.

`ride-music-return-type.patch` adds an Emscripten-only
`static_assert(sizeof(std::pair<size_t, size_t>) > 0);` immediately before the
two declarations. Function signatures, pair layout, callback implementations,
ride descriptors and desktop behavior are unchanged. No optimization or LTO
setting is disabled. The incomplete declaration reproduces at both `-O0` and
`-O3`; it is not caused by optimizing this code.

The actual pre-fix `EditorInventionsList.cpp.o` declares the default callback
as `void()`, whereas the core `RideAudio.cpp.o` defines `(i32, i32) -> void`.
The repaired GUI object's declaration has the expected pair `sret` pointer
and `Ride` pointer. GUI ThinLTO and ordinary-Wasm core objects remain the
existing build configuration.

The patch follows the four existing patches in `patches/series` and
`sources.json`; `fetch-source` remains idempotent. Source stays at owned pin
`4a7ee146caab8888eb31e56a33c0559db89b17bd`. New patch SHA-256:
`34258ddf5c570b6a0fa6dc969890e0c18372dfc3e1a5bfc746fb1c4f2595a185`.

## Compiler, runtime and complete-link controls

The [ABI/callback report](rct2-ride-music-abi-2026-09-06.json) uses the exact
original and applied header with native include resolution. Source guards
allow only the six added lines and verify unchanged native `RideAudio.cpp`
and `RideData.h`. Address-only fixtures reference both Default and Circus;
IR checks reproduce the old placeholder and verify the repaired declaration
at both optimization levels.

The exact native callback bodies also run through indirect descriptor and
returned-function-pointer calls in import-free Wasm. Six metadata cases cover
a valid first track, missing music, a second track with a maximum-width value,
the exact tune boundary, tune 255 and an empty track list. Both callbacks,
ordinary Wasm/ThinLTO address objects and original/applied headers produce
48 passing cases. Return values, metadata-query counts and bounds are checked.
These reduced old-source programs also link and run without trapping: they
do not independently reproduce the full engine's link warning or a crash.

The authoritative negative is a separate complete native source/build tree,
copied before reverting only the six header lines. Its
[163-step normal rebuild](rct2-ride-music-negative-build-2026-09-06.json) exits 0
with the original signature warning and reproduces the exact previous Wasm
SHA-256 `8687a1f0a25531e5dabec16a81180700e2112469eeda48b8dfc7641ac7cc987f`.

`test-ride-music-link.mjs` inventories both complete native source trees and
requires that only `RideAudio.h` differs. It obtains their identical native
link commands from Ninja, adds `-Wl,--fatal-warnings`, and redirects outputs to
separate proof directories. The [strict full-link report](rct2-ride-music-link-2026-09-06.json)
records old exit 1 with the named signature mismatch and repaired exit 0 with
empty stderr. Repaired Wasm/data exactly match the normal build. Emscripten's
isolated JS differs only in one local package label and two dependency labels;
the checker requires those exact three occurrences and identical remaining
bytes. This isolated-output JS is not the served artifact.

An earlier single-old-object substitution did not reproduce the warning, so
it was replaced by the complete pre-fix object graph. An offline strict-link
attempt stopped on an uncached Ogg port before linking; the final comparison
uses the normal build's hash-pinned port downloads into one disposable cache.
An initial exact-JS assertion exposed the three output-path labels above;
the final assertion normalizes only those labels, not arbitrary differences.
None of these diagnostic attempts establishes a gameplay failure.

All checks use toolchain image
`ghcr.io/openrct2/openrct2-build@sha256:0e1daa8e3f5a1c6951179aeab5c5de471ea705cb5f756bfb6e0ae5162b7e67be`,
with Clang/LLD 23.0.0git at LLVM commit
`358db292cc6a9a8a5448a296f643312289f328d7`. The maintained ABI test runs offline
with read-only inputs and is included in `test-framework-package`. Strict
comparison links also mount both source/build trees read-only; generated
outputs and fetched ports are isolated from them.

## Build, served bytes and isolation

The repaired normal build completes 163 incremental compile/link tasks.
The full package suite passes, including the new ABI test and preceding
sprite, construction, dialog, object, audio, cache, installation and native
Wasm/persistence checks. Fresh image range/isolation, empty-media,
innoextract and private-boundary checks pass.

| Served native artifact | SHA-256 |
| --- | --- |
| JS, unchanged | `3804c09d04c17a601b612a7df114597dc2cf81536d6bf0aeb0a44e40f54c6672` |
| Wasm, 15,315,173 bytes | `15a7c3841fd514ea6c3bf62c7d889a87173ef7c2f0cd8b85f12420644a05d0b4` |
| Data, unchanged | `67d5eb15e5b656782492409c31241d4451bda0dff6ea9de845c94050a22b74a8` |

The [exact 19-file HTTP comparison](rct2-ride-music-package-2026-09-06.json)
requires old 32938 bytes to match their historical report and new 32939 bytes
to match current staging. Only `runtime/openrct2.wasm` changes; JS, data,
worker and framework remain byte-identical. Private supplement paths and
installed-object aliases return 404; extensionless paths return the exact
launcher HTML, not private listings.

Candidate `http://127.0.0.1:32939/`:

- Image `local/openrct2-wasm:ride-music-candidate`, SHA-256
  `9534dc471ce2c399642e21c29f908a9f86d212bf30caf77c1ebeff443e9fe8ce`.
- Container `openrct2-ride-music-chrome-proof-20260906`, ID
  `31d67733916e801b9d5b145d31248a07612c678d88f0fab667f6aaef5593eae7`,
  started `2026-09-06T04:29:11.703737391Z`, restart count 0.
- Read-only root, temporary `/tmp`, read-only data bind from
  `/home/ted/wasm-game-data/openrct2-objects-proof-20260905-v2`.
- Same private entry `c198ff7ec1c45e01be311b1906e75c66`, 2,975 files /
  1,228,645,759 bytes as preceding candidates. No owner payload changed.

The previous staged site remains at
`/tmp/openrct2-music-abi.5kLU9V/previous-site`; previous candidates and saves
remain available. The complete pre-fix tree is retained at
`/tmp/openrct2-music-negative.lpyCPQ/source`; successful strict-link outputs
are at `/tmp/openrct2-music-link-XBd7pY`. Do not reapply the new patch to that
negative tree or replace historical package hashes with current staging.

Live `wasm-openrct2` remains ID
`5b5cd120543143acf8f46e0a2527ee7f823c0ff648aeea62c6138b92fccdfade`, image
`e00af4e3735efae516493824168208c57f1c41b47d43a679beb777957d942493`, started
`2026-09-03T21:52:26.394730615Z`, restart count 0, with its original data bind.
No live promotion, commit or push was performed.

## Actual Chrome: developed RCT1 park, music setting and persistence

Chrome-control supplies normal Play, native canvas clicks/keypresses and
full-page navigation. Read-only DOM evaluation records existing telemetry and
the loading log. No hidden engine/storage access, simulation acceleration or
input-timing workaround is used. Screenshots are manually reviewed; their
hashes establish provenance, not automated recognition or audible playback.

The [initial title](rct2-ride-music-title-2026-09-06.json) completes
2,506-object / 143-scenario indexing without native warnings/errors. Native
New Game → RCT1 → Diamond Heights opens the
[developed park](rct1-diamond-heights-start-2026-09-06.jpg), with 555 guests,
$1,193.50 and March 1, Year 1. Scenery and rides render without missing-object
or RCT1 fallback diagnostics.

After closing the objective, clicking Snake River Falls at (851,442) opens
the ride pane. Its music tab at (169,61) initially has Play music unchecked.
Clicking the checkbox at (11,83)
[enables Water style](rct1-diamond-heights-music-enabled-2026-09-06.jpg), with
the track listing `"Atlantis" — Allister Brimble`.

At normal speed the customer pane shows
[190 completed customers and 36 aboard](rct1-diamond-heights-customers-before-2026-09-06.jpg)
at `04:35:26.151Z`, then
[198 completed and 36 aboard](rct1-diamond-heights-customers-after-2026-09-06.jpg)
at `04:36:39.158Z`: eight additional completed passenger trips while the music
option remains enabled. Native `Guest::onExitRide()` increments the total
customer count; this is not just the current aboard count. No exact callback
execution trace or listening result is inferred from those UI observations.

Native pause → Save Game As → fifteen Backspaces and twelve typed characters
creates the unique [`RCT1Music906`](rct1-diamond-heights-save-name-final-2026-09-06.jpg)
name, with 54 native key edges. The
[saved paused park](rct1-diamond-heights-saved-2026-09-06.jpg) has $2,459.80,
571 guests and March 18, Year 1. Its
[persistence is flushed](rct1-diamond-heights-saved-2026-09-06.json) before
full-page reload; no prior named save is overwritten.

Fresh normal Play → native Load lists the
[150 KiB save](rct1-diamond-heights-load-menu-2026-09-06.jpg). The first
[post-click sample](rct1-diamond-heights-load-request-2026-09-06.json) still
shows the menu while native input processes; it is retained as a transient
observation, not used as loaded-park evidence. The completed
[reload](rct1-diamond-heights-reloaded-2026-09-06.jpg) restores the exact paused
park, cash, guest count and date. Its
[fresh counters](rct1-diamond-heights-reloaded-2026-09-06.json) have zero key
edges and a lower draw count than the pre-reload engine.

Reopening Snake River Falls shows the
[saved music setting](rct1-diamond-heights-restored-music-2026-09-06.jpg):
Play music still checked, Water style and the same track listing. Native
resume returns to [gameplay](rct1-diamond-heights-resumed-2026-09-06.jpg), with
boats and coaster vehicles moved, $2,537.80, 572 guests and March 19, Year 1.
The [recorded evidence checker](rct2-ride-music-chrome-2026-09-06.json) passes
chronology, clean diagnostics, native input, flushed persistence and fresh
engine reload/resume checks. Visual setting/park claims are manual review.

The park was paused again, clean persistence confirmed, and the proof tab
navigated to `about:blank`. `RCT1Music906` remains in Chrome on origin 32939;
prior 32937/32938 saves are untouched.

## Remaining observations and reruns

Follow-up: the [index-cache checkpoint](INDEX-CACHE-2026-09-06.md) repairs the
repeat rebuild below, with unchanged native validation, same-size-change
regression coverage and two actual Chrome warm launches plus park save/reload.
The observations below retain this earlier checkpoint's state.

Reload still reports `object index out of date` and rebuilds 2,506 objects in
2.24 seconds. Cache invalidation is the next bounded native/worker lead, not
fixed here. Audio telemetry runs at 48 kHz with nonzero drops/underruns
(83 dropped buffers and one underrun totaling about 1.48 seconds in the
post-reload resumed sample); listening and audio-quality acceptance remain
open. Wider construction, longer park management and live promotion remain
open. The full lab goal is not complete.

Run from `openrct2-wasm` without replacing the live service:

```sh
games/openrct2/scripts/test-framework-package
node games/openrct2/scripts/test-ride-music-abi.mjs
# Requires the retained, separately rebuilt complete pre-fix tree.
node games/openrct2/scripts/test-ride-music-link.mjs /tmp/openrct2-music-negative.lpyCPQ/source
games/openrct2/scripts/test-framework-image local/openrct2-wasm:ride-music-candidate
node games/openrct2/scripts/test-ride-music-package.mjs
node games/openrct2/scripts/test-ride-music-evidence.mjs
```
