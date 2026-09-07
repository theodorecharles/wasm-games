# OpenRCT2 bundled-object index cache — 2026-09-06

Update: this exact candidate is now [installed on 8026](RELEASE-2026-09-06.md)
with its cumulative native fixes and a versioned private installation. The
original directory remains unchanged. The checkpoint below is historical.

The repeated object-index rebuild from the
[ride-music checkpoint](RIDE-MUSIC-2026-09-06.md) is repaired in isolated
candidate 32940. Actual Chrome reproduces the old rebuild, performs a cold
build with the repair, then reaches the native title on two full-page reloads
without rebuilding any index. Diamond Heights loads, saves, restores and
resumes using the cached index. Live 8026 and owner installation data are
unchanged; this is not full-game, audio or end-to-end performance acceptance.

## Cause and repair

The generated preload loader calls `FS_createDataFile` for bundled objects
without their source modification times. Its pinned MEMFS implementation
sets new-node timestamps to `Date.now()`. Consequently, the same bundled
objects acquire different modification times each launch.

Native `core/FileScanner.cpp` reports `statInfo.st_mtime` in whole seconds.
The complete `core/FileIndex.hpp` cache validation compares file count, total
size, path checksum, modification-time checksum, language, magic and versions.
The saved index exists and restores correctly, but the bundled timestamps
make its date checksum stale. Owner-file times were already preserved by
`groupedMediaFiles()` and WORKERFS. Native object search roots include
`/OpenRCT2/object` and the persistent user object directory.

`stampBundledObjects()` in the worker runs after the native factory has loaded
its public preload package, before mounting either the private installation
or persistent user files. It visits regular indexed files under
`/OpenRCT2/object` only, matching `.dat`, `.pob`, `.json` and `.parkobj`
case-insensitively. Each receives a stable content-derived modification-time
stamp: the first unsigned 32 bits of SHA-256, interpreted as whole seconds
and converted to milliseconds for `FS.utime`. Zero and the full unsigned range
are supported. Existing atimes, payloads, permissions and file types remain
unchanged; symlinks and non-indexed files are skipped.

This retains the native 32-bit date-checksum contract rather than suppressing
invalidation. Identical contents get identical stamps; a changed same-size
payload normally changes its stamp. As with the existing native checksum,
this is not collision-free content addressing. Native size/path/language/
version validation and owner/user modification times remain in force.

All 2,484 packaged object files, totaling 47,647,079 bytes, are already resident
in MEMFS when hashed. No new network request, package manifest or persistent
payload copy is introduced. The hashing cost is not independently benchmarked
here, and eliminating the observed rebuild is not an end-to-end timing claim.
Read/digest failures propagate through the existing startup error path.

## Maintained regression tests

`test-bundled-object-stamps.mjs` executes the exact worker helper with
controlled filesystem dependencies. It checks scope, nested directories,
extension matching, empty files/tree, symlink exclusion, private/user/other
asset isolation, independent launch clocks, idempotence, unchanged bytes/
types/atimes, full-width/zero stamps and read/digest error propagation.
Source-order guards require completion before private mounts, persistence
attachment and native `callMain`.

The test also parses the actual generated preload metadata, validates its
contiguous payload ranges and unique public paths, then exercises every one
of the 2,484 bundled objects from the exact `.data` artifact. All content
stamps and unchanged payloads are checked independently with Node SHA-256.
The package buffer is checked for accidental fixture mutation.

The [native regression report](rct2-index-stamps-2026-09-06.json) contains 14
cases compiled with UBSan using the complete unchanged native `FileIndex`
class and actual native `Numerics.hpp`. Source guards compare FileIndex,
Numerics and FileScanner byte-for-byte against the source pin. Controlled
scanner, item serializer, job scheduler and UI/progress dependencies supply
the test world; index header/item round trips use real temporary files.
This does not substitute for native object parsing or browser persistence.

The world includes the 2,484 real public payload identities plus controlled
private and user objects. Old launch-time stamps force another rebuild;
stable stamps restore all cached items with zero `Create()` calls. The other
cases require rebuilding for same-size content changes, one-time old-to-new
stamp migration, size changes, private/user mtime changes, added/removed/
renamed objects, language/version changes, a corrupt header and truncation.
The native validation code is not patched or relaxed.

The full `test-framework-package` suite passes with the stamp test integrated,
alongside prior audio/cache, private-object, sprite, construction, browser
dialog, 48 ride-music callback and native package checks. Fresh image tests
pass for range serving, isolation, empty media, innoextract and private paths.
Test fixtures are retained at `/tmp/openrct2-object-stamps-fMshdS`.

## Exact package and service boundaries

The [19-file served comparison](rct2-index-cache-package-2026-09-06.json)
checks prior 32939 against its recorded hashes and current 32940 against
staging. Only `openrct2-worker.js` changes. Removing exactly the new helper
and its pre-mount call restores the previous worker byte-for-byte: private
mounting, input, audio, persistence and error handling are preserved.

Worker SHA-256:
`cce88f7fbf3e08252612cc1876ecb7789cadb05ad64a7daeefbaf0ba2a605a87`.
Native artifacts remain:

| Artifact | Unchanged SHA-256 |
| --- | --- |
| JS | `3804c09d04c17a601b612a7df114597dc2cf81536d6bf0aeb0a44e40f54c6672` |
| Wasm | `15a7c3841fd514ea6c3bf62c7d889a87173ef7c2f0cd8b85f12420644a05d0b4` |
| Data | `67d5eb15e5b656782492409c31241d4451bda0dff6ea9de845c94050a22b74a8` |

Source stays at owned pin `4a7ee146caab8888eb31e56a33c0559db89b17bd` with the
same five native patches and their exact preceding hashes. No native rebuild
or toolchain/optimization change is needed for this worker-only repair.

Candidate `http://127.0.0.1:32940/`:

- Image `local/openrct2-wasm:index-cache-candidate`, SHA-256
  `308d433f0442e11a04298b9b4101acbb755a4196918bff9000c7b209ed0b2378`.
- Container `openrct2-index-cache-chrome-proof-20260906`, ID
  `d3b768d7cbd6e49716898a1c10d378113bb3ac005e0ab27f04c97644cd1b7010`,
  started `2026-09-06T04:58:16.12209486Z`, restart count 0.
- Read-only root, temporary `/tmp`, read-only private bind from
  `/home/ted/wasm-game-data/openrct2-objects-proof-20260905-v2`.
- Same private entry `c198ff7ec1c45e01be311b1906e75c66`, 2,975 files /
  1,228,645,759 bytes. Supplement payloads and indexed aliases remain 404;
  extensionless paths serve exact launcher HTML, not private listings.

The preceding staged site is retained at
`/tmp/openrct2-index-cache.vYa0u8/previous-site`. Earlier candidates and saves
remain available. Historical package checkers should retain their checkpoint
hashes, not be weakened to match new staging.

Live `wasm-openrct2` remains ID
`5b5cd120543143acf8f46e0a2527ee7f823c0ff648aeea62c6138b92fccdfade`, image
`e00af4e3735efae516493824168208c57f1c41b47d43a679beb777957d942493`, started
`2026-09-03T21:52:26.394730615Z`, restart count 0, with its original data bind.
No live promotion, owner-data mutation, commit or push was performed.

## Actual Chrome: cold build, two cache hits and park persistence

Chrome-control supplies normal Play, native canvas input and full-page
navigation. Read-only DOM evaluation records existing mirrored telemetry and
the loading log. There is no hidden engine/storage access, simulated
acceleration, synthetic cache injection or relaxed native validation.
Screenshots are manually reviewed; hashes are provenance, not visual oracles.

On unchanged 32939, a fresh normal launch with the existing saved index
[reproduces](rct2-index-baseline-reload-2026-09-06.json) `object index out of date`
and rebuilds 2,506 objects in 2.92 seconds. The native title renders.

New origin 32940's [cold launch](rct2-index-cold-title-2026-09-06.json) reports
the 2,484 bundled stamps and builds all native indexes: 2,506 objects in 2.89
seconds, 506 track designs in 0.23 seconds and 143 scenarios in 0.71 seconds.
The [title renders](rct2-index-cold-title-2026-09-06.jpg); persistence flushes
and reports 522,908 index bytes.

After full-page reload and another normal Play, the
[warm title](rct2-index-warm-title-2026-09-06.json) retains 522,908 index bytes
with no stale-index, building-index or error/warning log. WORKERFS hot-cache
reads fall from 1,197 files / 102,321,525 bytes on cold launch to 528 files /
47,680,532 bytes on warm launch. These are native file-cache counters, not
overall network, memory or elapsed-time measurements.

Native New Game → RCT1 → Diamond Heights renders the
[developed park/objective](rct1-index-cache-start-2026-09-06.jpg) with no missing
object or RCT1 fallback warning. Closing the objective and pausing leaves
$1,305.00, 556 guests and March 2, Year 1. Native Save Game As, fifteen
Backspaces and twelve characters create unique
[`RCT1Cache906`](rct1-index-cache-save-name-final-2026-09-06.jpg), with 54 native
key edges. Its [paused save](rct1-index-cache-saved-2026-09-06.jpg) and
[clean persistence](rct1-index-cache-saved-2026-09-06.json) are recorded before
another complete page reload.

The [second warm launch](rct2-index-warm-again-title-2026-09-06.json) again
renders the native title with all indexes retained and no rebuild. Native
Load lists the [140 KiB save](rct1-index-cache-load-menu-2026-09-06.jpg).
Loading restores the [same paused park](rct1-index-cache-reloaded-2026-09-06.jpg),
with exact cash, guest count, date and vehicle positions. Fresh counters show
zero key edges and a lower draw count than the preceding engine. Native
resume shows [moved boats/coaster/railway vehicles](rct1-index-cache-resumed-2026-09-06.jpg),
$1,417.70, 557 guests and March 4, Year 1.

The [recorded Chrome checker](rct2-index-cache-chrome-2026-09-06.json) passes
baseline/cold/warm log checks, chronology, native input, flushed persistence
and fresh-engine reload/resume. It does not recognize park imagery or prove
audible sound. The park was paused again with clean persistence confirmed,
then the tab navigated to `about:blank`. `RCT1Cache906` remains on origin
32940; earlier-origin saves are untouched.

## Remaining scope and reruns

The observed repeated rebuild is fixed, but broader cache/version upgrades,
other owner libraries and longer park management are not exhaustively tested.
Audio still has nonzero drops/underruns: the resumed sample shows nine dropped
buffers and one underrun totaling about 1.53 seconds at 48 kHz. Listening,
audio quality, broader game acceptance and live promotion remain open.
The portfolio goal is not complete; Blood remains deferred at the user's
request and RTCW's confirmed-working renderer is untouched.

Run from `openrct2-wasm` without replacing the live service:

```sh
games/openrct2/scripts/test-framework-package
node games/openrct2/scripts/test-bundled-object-stamps.mjs
games/openrct2/scripts/test-framework-image local/openrct2-wasm:index-cache-candidate
node games/openrct2/scripts/test-index-cache-package.mjs
node games/openrct2/scripts/test-index-cache-evidence.mjs
```
