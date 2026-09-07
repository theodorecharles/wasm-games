# GoldSource WAD storage/load-time repair — 2026-09-05

Isolated candidate; live services and original owner data are unchanged.
This addresses the long native map-load stage, not sustained mouse capture,
audible playback, full campaigns, or all cold-start/network costs.

## Cause and repair

The owner packager DEFLATE-compressed every ZIP member, including WAD texture
archives. The pinned Xash filesystem reads WAD texture lumps with seeks to each
lump and back (`filesystem/wad.c::W_ReadLump`). Backward seeks on compressed
members reset the inflater and replay from the beginning
(`filesystem/filesystem.c::FS_Seek`). These exact native functions were read
from `goldsource-xash-framework:build`, image
`334b4091e695ecbe357dccfcb8810385297ab50531f2dd4431d39159a02ad771`.

The [owner packager](../scripts/package-owner-data.py) now stores `.wad`
members uncompressed, case-insensitively, while other assets remain deflated.
No engine/renderer changes are involved. The native server map-start stage
in Blue Shift drops from about 19 seconds to about 1 second in actual Chrome.
The figures come from second-resolution native log timestamps, not an FPS
benchmark or exact subsecond measurement.

The new [packager tests](../scripts/test-owner-packaging.py) failed against the
old policy (`halflife.wad` method 8 instead of 0) before the fix. They cover
uppercase/nested WADs, unchanged payloads, deterministic output, existing
save/config/native-binary exclusions, safe staging targets and non-WAD stream
identity. Full GoldSource `npm test` passes. Archive tests use Python's standard
library; Pillow is loaded only when the separate icon generation path is used.

## Controlled data and package comparison

[The private staging tool](../scripts/stage-stored-wad-candidate.py) validates
the original manifest, writes only to a separate empty directory, and verifies
all 10,174 uncompressed member payloads by SHA-256 after repacking. Non-WAD
compressed byte streams must also match exactly. Original archives are hashed
again after staging; no file is extracted over the user's installation.

Across four archives, 39 WADs change storage method. The resulting archives
are 43,854,721 bytes larger in total (about 41.8 MiB), trading a small download
increase for direct texture-lump access.

[Owner-data comparison report](goldsource-stored-wad-owner-2026-09-05.json):

| Archive | Members | WADs | Added bytes |
| --- | ---: | ---: | ---: |
| valve | 4,236 | 7 | 13,112,780 |
| bshift | 3,409 | 7 | 14,506,876 |
| gearbox | 1,382 | 3 | 3,239,369 |
| cstrike | 1,147 | 22 | 12,995,696 |

[HTTP package checks](goldsource-stored-wad-package-2026-09-05.json) compare
candidate 32930 against the prior shell-repaired candidate 32929. All 13
native/support artifacts, adapter, launcher config, art, and three shared-shell
files match exactly (26 unchanged files). Only the generated data-manifest
version and archive size/hash fields differ, exactly as declared in the owner
report. All four variants validate their owner data. Private `/data` and
`owner-report.json` routes remain 404.

## Chrome observations

All launches use native Play → New Game → Medium. No direct map commands,
fixed engine frame-time changes, time-scale changes or synthetic DOM input
are used. Each engine is disconnected normally before the next variant.

Blue Shift's [new launch log](blue-shift-stored-wad-start-2026-09-05.json)
records the final `Host_EndGame` at 21:42:45, `Game started` at 21:42:46 and
resources complete at 21:42:48. The
[old-data run](blue-shift-normal-campaign-2026-09-05.json) records
21:26:11, 21:26:30 and 21:26:31 respectively. That is about 19 → 1 seconds
to native map start, and 20 → 3 seconds through resource completion.
The old first `Host_EndGame` was one second earlier; coarse timestamp rounding
and renderer work make an exact speedup ratio inappropriate.

The [new tram frame](blue-shift-stored-wad-world-2026-09-05.jpg) has the expected
textured tram, station/terrain and 100-health HUD. The
[native status/departure](blue-shift-stored-wad-status-2026-09-05.json) confirms
`ba_tram1`, `host_framerate=0`, `sys_timescale=1.0` and normal disconnect.
The new viewport was 1424×1113 versus 1424×1057 in the prior run; the improvement
is in server startup before renderer setup, not a reduced render resolution.
The existing `WrongDocumentError` capture failure remains in the new trace.

Opposing Force's [new launch log](opposing-force-stored-wad-start-2026-09-05.json)
records 21:49:11 → 21:49:12 → 21:49:14 for the same three milestones.
The [original-data run](opposing-force-normal-campaign-2026-09-05.json) records
21:30:23 → 21:30:38 → 21:30:38: about 15 → 1 seconds to native map start and
15 → 3 seconds through resource completion. Both runs use a 1424×1057
viewport. The [new helicopter frame](opposing-force-stored-wad-world-2026-09-05.jpg)
shows the soldiers, interior and textured terrain; capture remains rejected.

[Native status/departure](opposing-force-stored-wad-status-2026-09-05.json)
confirms `of0a0`, `ChromeOFStoredWad`, unaccelerated timing and normal disconnect.
The [saved-evidence verifier](../scripts/test-stored-wad-evidence.mjs) checks
the actual native milestones, map/timing queries, normal departures and the
still-rejected capture result. Its [report](goldsource-stored-wad-timing-2026-09-05.json)
keeps capture/full-campaign acceptance explicitly false.

A fresh [original-data Blue Shift recheck](blue-shift-original-wad-repeat-2026-09-05.json)
after both repaired-data runs reproduced 21:54:12 → 21:54:31 → 21:54:33:
19 seconds to native map start and 21 seconds through resources. This reverse
comparison uses unchanged original archives and reproduces the slow stage,
rather than relying only on an earlier baseline.
Its [native status/departure](blue-shift-original-wad-repeat-status-2026-09-05.json)
also confirms `ba_tram1`, default frame/time-scale settings and a clean return
to the menu before the test tab was cleared.

## Reproduction and retained candidate

The repository's source data manifest still describes the original installed
archives. The comparison tool produces a separate manifest matched to the new
private copies; do not pair a new manifest with old data or replace an owner's
files in place.

```sh
cd /home/ted/Development/wasm-games/goldsource-wasm
npm test
# Choose a new, empty private output directory outside both inputs.
python3 scripts/stage-stored-wad-candidate.py \
  /home/ted/wasm-game-data/goldsource \
  /home/ted/Development/wasm-games/goldsource-wasm/web \
  /path/to/empty-private-staging-directory
```

Build the image from the generated `site/` only and mount its sibling `data/`
read-only at `/data`. Never put the data or owner report in the image/site.

- Original comparison stage: `/tmp/goldsource-stored-wad.graoXC` (temporary).
- Retained private copies: `/home/ted/wasm-game-data/goldsource-stored-wad-proof-20260905`.
  The data, generated site and report are retained together outside the repo.
- Image: `local/goldsource-wasm:stored-wad-candidate`, SHA-256
  `08ab594ed353516732604e1bab31430daba5b56208405c631379878e01912ce4`.
- Container: `goldsource-stored-wad-chrome-proof-20260905`, loopback HTTP 32930,
  read-only root and owner mount, isolated writable `/tmp`.
- Durable-copy container: `goldsource-stored-wad-persistent-proof-20260905`,
  loopback HTTP 32931, same exact image and matched private data. Its
  [repeated HTTP checks](goldsource-stored-wad-persistent-package-2026-09-05.json)
  pass the same 26 unchanged-file and four owner-readiness comparisons.
- Framework/base/adapter/native bytes are unchanged from the
  [preceding capture checkpoint](GOLDSOURCE-CAPTURE-CAMPAIGNS-2026-09-05.md).

Remaining: broader repeated measurements, extended map transitions/save/load,
capture/audio acceptance, and live promotion. This is not complete GoldSource
acceptance.
