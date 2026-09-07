# OpenRCT2 private scenery repair — 2026-09-05

The earlier [RCT2 checkpoint](RCT2-CHROME-2026-09-05.md) exposed missing
scenery during scenario indexing. This follow-up repairs that defect and
verifies it through paired actual-Chrome runs. Live 8026, original owner data
and native JS/Wasm/data artifacts remain unchanged.

## Cause and implementation

The browser native build preloads `/usr/share/openrct2`. Debian's installed
`openrct2-objects 1.7.11+dfsg-1` deliberately excludes several freely available
but non-DFSG DLC/custom-object directories; see the installed
`/usr/share/doc/openrct2-objects/README.Debian` and `copyright` exclusions.
The native `RCT1::GetSceneryObjects` table still references 22 excluded objects.
This is an asset-availability issue, not a renderer error.

A second integration defect prevented private supplements from working:
the worker mounted `ObjData` only at `/RCT/ObjData`, but native
`ObjectRepository::ObjectFileIndex` scans `/OpenRCT2/object` and the user's
object directory. Adding private park objects to the installation alone did
not make them visible to that index.

`mountInstallationObjects()` now gives `.parkobj` files from `ObjData` a second
read-only WORKERFS mount at `/OpenRCT2/object/installed`, before native startup.
It retains their original File/Blob backing, marks the new mount for the
existing hot cache and leaves the original RCT2 DAT/image path intact. Empty
or unmodified installations create no extra mount. Invalid/duplicate names
are rejected before mounting. It neither injects objects into saves nor
publishes their bytes as public site files.

No native importer checks were removed, object IDs renamed or errors filtered.
The helper regression fails under the old no-indexed-mount behavior and passes
for the repaired worker, including filtering, original-file identity, empty
groups and invalid-name cases.

## Private supplement and preservation

`stage-installation-objects.py` reads exact preload descriptors/bytes and the
pinned source's scenery table. All 2,484 packaged object IDs are inventoried;
22 of the table's 474 distinct IDs are absent. A first audit incorrectly
reported 24 because its parser missed scientific-notation offsets. A new
failing-then-passing test fixes that parser and requires every descriptor to
be accounted for. The unused initial private copy is retained separately;
it is not the tested v2 dataset.

The supplement comes from the official [OpenRCT2 objects v1.7.11 release](https://github.com/OpenRCT2/objects/releases/tag/v1.7.11),
whose `objects.zip` SHA-256 is
`74e73bbd012339511bb359dd0fbb148fda899790ae37d7d69861d88183b19452`.
The stager performs no downloads and requires that exact archive hash.
Twenty-one objects are copied byte-for-byte from release park objects.
`official.scenery_wall.post_flipped` is release JSON referencing the owner's
`WALLPOST.DAT` sprites; its unchanged JSON is wrapped as `object.json` in a
deterministic parkobj. No original game sprites are copied into this repo.

The tested separate private data root is:

```
/home/ted/wasm-game-data/openrct2-objects-proof-20260905-v2
```

It contains 2,975 files / 1,228,645,759 bytes, entry
`c198ff7ec1c45e01be311b1906e75c66`. The added objects total 71,820 bytes.
All 2,953 original payloads were hashed before copying and compared afterward.
The original entry/manifest is unchanged; a new entry ID avoids stale media
identity. Output must not exist, source/output trees must be separate, and
the private root is mode 0700. Eight staging tests cover preservation,
metadata wrapping, scientific offsets, archive integrity, existing output,
changed source sizes, symlinks, unsafe paths and missing local image files.

The release assets remain **private installation content**. Do not add their
bytes to public site staging, the source repository or a release image. The
package report records their provenance, identifiers and hashes, not payloads.

## Isolated packages

| Purpose | HTTP | Image SHA-256 |
| --- | --- | --- |
| Old indexed path, same supplemented data | 32936 | `299b31ca37eded48631ba7d6ad225cc7d45bf6331f870677d2b09985e664d184` |
| Repaired indexed path, same supplemented data | 32935 | `7985183b8e61dfed95a7f9653f72ba97b084d2a50287486d7568a741f4a745c9` |

Containers are `openrct2-private-objects-v2-old-proof-20260905` and
`openrct2-private-objects-v2-chrome-proof-20260905`; both bind v2 data read-only,
use read-only roots and temporary `/tmp`. The repaired tag is
`local/openrct2-wasm:private-objects-candidate`.

[Exact three-origin checks](rct2-private-objects-package-2026-09-05.json)
verify 18 public files unchanged and the repaired worker exactly matching
source (SHA-256 `46d7827b3ad34c2d856bf57ed492589e398073b2d99f7a47e43e000ee2e38eaa`).
The control/candidate data inventories are identical and ready. Direct private
files return 404. Unknown extensionless paths such as `/ObjData/` return the
exact canonical launcher HTML, not a directory listing; the checker verifies
those bytes explicitly. Image range/isolation, empty-media, innoextract and
private-boundary tests pass, as do the audio/cache regressions.

The initial v1 data containers are stopped and retained. Their tabs never
started native gameplay; an early launcher fetch during container replacement
was retried only after both v2 endpoints were confirmed ready. No live service
was restarted.

## Paired Chrome evidence

The Chrome-control skill was used for normal Play, New Game, scenario
selection and pause; only actual visible/native interactions were used.

The [old path](rct1-private-objects-old-2026-09-05.json), despite receiving the
same 22 supplements, records 526 missing-object messages for all 22 IDs while
building the scenario index. This is the recorded bounded log count, not an
assumption about unseen history.

The [repaired path](rct1-private-objects-fixed-2026-09-05.json) explicitly logs
22 private mounted objects, a 2,506-item object index and completion of the
143-item scenario index, with **zero missing-object or error messages** in
that complete short startup/index trace. The native
[RCT1 scenario menu](rct1-private-objects-menu-2026-09-05.jpg) is visible.
The [paired evidence checker](rct2-private-objects-chrome-2026-09-05.json)
requires the old missing IDs to equal the independently derived missing set;
it does not infer success merely from a rendered canvas.

Selecting Forest Frontiers starts its actual
[park and objective](rct1-forest-frontiers-start-2026-09-05.jpg).
[Native telemetry](rct1-forest-frontiers-start-2026-09-05.json) reports gameplay,
advancing draws, $10,000 and the visible tree-lined entrance. Native pause is
also [recorded](rct1-forest-frontiers-paused-2026-09-05.json).
Both comparison tabs were blanked afterward. No existing save was overwritten.

## Next defect: RCT1 sprite-path disagreement

Follow-up: the [native sprite-path repair](RCT1-SPRITE-PATH-2026-09-05.md)
now passes compiled negative/positive tests, the full Wasm build and actual
Chrome RCT1/RCT2 save/reload checks in separate candidate 32937. The text and
raw evidence below preserve the earlier 32935 checkpoint, where the warning
was still present. Live 8026 remains unchanged.

Forest Frontiers logs `Park has objects which require RCT1 linked. Fallback
images will be used.` This is **not fixed by the scenery supplement**, so the
park startup is not full RCT1 graphics acceptance.

Source at owned pin `4a7ee146caab8888eb31e56a33c0559db89b17bd` is reconstructed
at `openrct2-wasm/.work/openrct2`, with the existing browser patch applied.
The worker passes `--rct1-data-path=/RCT/RCT1`. Native `RootCommands.cpp` puts
that into `gCustomRCT1DataPath`; `PlatformEnvironment.cpp` correctly uses it
for the RCT1 environment base. But `Drawing.Sprite.cpp::GfxLoadCsg()` reads only
`Config::Get().general.rct1Path`, not that resolved environment. This is the
concrete next repair lead. The owner data is present and meets native Loopy
Landscapes sizes: CSG1.DAT 41,402,869 bytes and csg1i.dat 1,118,672 bytes
(69,917 entries). No data/renderer workaround has been applied for it.

Likely repair location: pass the same `IPlatformEnvironment` used by
`GfxLoadG1()` into `GfxLoadCsg()`; there is one native call site in
`Context::LoadBaseGraphics()` plus its declaration. Verify configured and
explicit-path behavior, compile the real native build and repeat Chrome RCT1
graphics/RCT2 save regression before accepting it. Native build tooling is
already cached; do not replace the old native bytes before that work passes.

Audio still has nonzero queue drops/underruns and has not been listened to.
Long park sessions, complete ride operation, save regression for a future
native change and live promotion remain open.

## Recheck commands

```sh
node openrct2-wasm/games/openrct2/scripts/test-installation-objects.mjs
python3 openrct2-wasm/games/openrct2/scripts/test-stage-installation-objects.py
node openrct2-wasm/games/openrct2/scripts/test-private-objects-package.mjs
node openrct2-wasm/games/openrct2/scripts/test-private-objects-evidence.mjs
```

The full native package runner now includes the installation-object test, but
its full build-dependent path was not run in this checkpoint: this change
deliberately reuses the checked existing native artifacts. The previous
framework-only check is historical and expects its earlier source worker;
use the new private-object package check for the current worker/candidate.
