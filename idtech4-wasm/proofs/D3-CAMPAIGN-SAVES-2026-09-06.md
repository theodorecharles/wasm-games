# Doom 3 v7 campaign/save regression — 2026-09-06

Later handoff, 2026-09-06 12:06 UTC: the two owned v7 campaign containers below
were stopped, not deleted, after an idle/package audit. Their localhost origins
**32953/32954 now run v8** to test the existing browser saves without copying
storage. Historical v7 images and evidence remain intact. The
[v8 trace-cache checkpoint](D3-TRACE-CACHE-2026-09-06.md) fixes and verifies the
cleanup warning recorded here, including repeated old-save loads and normal
exit. Live services remain unchanged.

## Result and scope

**Both packaged campaigns pass first-map native save → full page reload →
native load, followed by a changed-position comparison load and pause/resume
in real Chrome.** This is the exact uninstrumented v7 package, not either
lighting diagnostic. No new engine repair was needed for this checkpoint.
It narrows the outstanding SP/RoE regression gate; it is not full campaign,
old-save compatibility, controls/listening, or production acceptance.

Chrome control was used for normal Play, New Game, Marine difficulty, native
menus and console input. The initial campaign intros ran naturally to their
first playable areas, without a console map command or cinematic skip. Only
DOM-backed logs/datasets and screenshots were observed; browser storage and
engine globals were not read or modified directly.

## Exact package and isolation

- Image: `local/idtech4-wasm:doom3-sabot-candidate-v7`,
  `sha256:a7afa362d4012ae13b7bb1b81b99287e8f4d12ae24a4d5b7431ca17f4a260007`.
- SP: `d3-sp-v7-save-proof-20260906`, localhost **32953**, variant `doom3`.
- RoE: `d3-roe-v7-save-proof-20260906`, localhost **32954**, variant `roe`.
- Both have read-only roots and exactly one read-only owner mount:
  `/home/ted/wasm-game-data/doom3` → `/data`. `/tmp` is a bounded 256 MiB tmpfs.
  No live service or staged release file was replaced.
- [Package audit](d3-v7-campaign-package-2026-09-06.json) verifies all 13 selected
  image files and the nine served site files per container, including both
  engine pairs, adapter, worker, manifests, native server and bot resources.
  Both managed supervisors are sleeping, with zero humans/bots/peers, no native
  child or session, null start time and zero relay packets. Campaign use did
  not wake multiplayer.

After native Quit Current Game → Yes, both intact main menus and native map
shutdown were recorded at 11:47:22. All four owned Chrome tabs are now blank.
The [final package/lifecycle audit](d3-v7-campaign-final-package-2026-09-06.json)
confirms unchanged hashes, container start times, zero restarts and sleeping
supervisors with no native child/session or relay traffic. Live Doom 3 SP/MP
and protected RTCW SP retain their previous image/start time and zero restarts.

Base Wasm is `26b27ed91f8a9b7143f2cfeb083dbeac8b5f4f15b2c9bf9f0a978c942677fc8c`;
RoE Wasm is `cebd7078d223026613d39c2d6c829d712a6d00a585339ba4251d0f5288de2527`.
The latter is the unchanged Sept 5 21:15:28 managed-lifecycle engine packaged
in v7. Base reports 144 classes but `BotAI initialized: available=0`, using
the stock campaign scripts. No MP bot archive is mounted for either campaign.

The RoE build uses `.work/d3wasm/neo` for the engine and imports only expansion
game sources from `.work/d3wasm-roe-game`. Its `Common.cpp` is **not** the engine
input. An initial persistence-fixture invocation against that reference-tree
file failed extraction; rerunning against the actual engine source passed.
This was a test-input correction, not a game regression or source change.

## Observed sequence

Times are UTC; native save menus display local EDT.

| Stage | Doom 3 SP | Resurrection of Evil |
| --- | --- | --- |
| First gameplay recorded | 11:33:16; Mars City Hangar, 100 health | 11:33:16; Ancient Ruins, 100 health, pistol 12/36 |
| Native manual save | `vsevenmars`, 07:34 AM | `vsevenruins`, 07:34 AM |
| Reloaded launcher recorded | 11:35:48; empty log, no old audio counter | 11:35:48; empty log, no old audio counter |
| Fresh worker restore | `/save/doom3`; native slot and preview present | `/save/roe`; native slot and preview present |
| First loaded gameplay recorded | 11:37:55; `game/mars_city1` | 11:38:12; `game/erebus1` |
| Printed restored view | `(1267 -1501 68.25) 180.0` | `(4456 6888 481.16) 180.0` |
| After bounded ordinary W pulses | `(1265.77 -1501 68.25) 180.0` | `(4454.77 6888 481.16) 180.0` |
| Second load, original slot | 11:42:36; original printed view restored | 11:42:36; original printed view restored |
| Final native Return to Game | 11:44:41; gameplay, 100 health | 11:44:41; gameplay, 100 health, pistol 12/36 |

Both loads run `----- Game Map Init SaveGame -----`, with no version-mismatch,
invalid-save, persistence-warning or new-map fallback. The first loads take
24,356/27,236 ms; same-worker comparison loads retain the map and take
1,019/683 ms. Initial intros do not replay on restoration. The coordinate
comparison is exact at native `getviewpos` printed precision, not an assertion
about hidden full-precision engine state. Health, ammo, preview images and
textured/lit views were visually inspected, not inferred from the shell flag.

Screenshots and complete DOM-backed logs use `d3-v7-{sp,roe}-*-2026-09-06`.
Useful pairs include:

- [SP saved slot](d3-v7-sp-saved-2026-09-06.jpg) and
  [reloaded native preview](d3-v7-sp-reload-selected-2026-09-06.jpg).
- [RoE saved slot](d3-v7-roe-saved-2026-09-06.jpg) and
  [reloaded native preview](d3-v7-roe-reload-selected-2026-09-06.jpg).
- [SP final gameplay](d3-v7-sp-final-resume-2026-09-06.jpg) and
  [RoE final gameplay](d3-v7-roe-final-resume-2026-09-06.jpg).
- [SP moved position](d3-v7-sp-moved-position-2026-09-06.jpg) and
  [restored position](d3-v7-sp-second-position-2026-09-06.jpg).
- [RoE moved position](d3-v7-roe-moved-position-2026-09-06.jpg) and
  [restored position](d3-v7-roe-second-position-2026-09-06.jpg).

## Repeatable checks

```sh
node idtech4-wasm/scripts/test-d3-campaign-package.mjs
node idtech4-wasm/scripts/test-d3-campaign-evidence.mjs
node idtech4-wasm/scripts/test-d3-sabot-worker.mjs
EMXX="$PWD/idtech4-wasm/.work/host-tools/emxx-6" \
  D3_COMMON_SOURCE="$PWD/idtech4-wasm/.work/d3wasm-sabot/neo/framework/Common.cpp" \
  node idtech4-wasm/scripts/test-d3-persistence.mjs
```

For the RoE callback fixture use `.work/d3wasm/neo/framework/Common.cpp`.
Both fixtures compile the actual Quit/config EM_ASM callbacks and execute
12 save requests through framework 0.9.6, maximum concurrent syncs **1**.
They use deterministic asynchronous disk I/O, not browser IndexedDB; the
Chrome reload above supplies the separate durable-save evidence.

The [evidence audit](d3-v7-campaign-acceptance-2026-09-06.json) checks ordered
observations, fresh-page counter/log reset, real native restore markers,
changed/restored coordinates, pause/resume and retained screenshot hashes.
It rejects a new-map fallback and unchanged-position comparison. Screenshot
contents remain a human/agent visual observation, not an automated pixel oracle.

## Limits and follow-up

- Only each campaign's opening map is accepted here. Full progression,
  map-transition autosaves, quicksave/quickload, abrupt-close durability,
  old-version saves and overwritten-slot recovery remain untested.
- Tiny CUA keypresses move each player only 1.23 units in total. This is not
  sustained input, capture/re-capture, combat or aiming acceptance. A Ctrl
  pulse did not establish firing; RoE remained at 12/36. One attempted console
  read occurred before console visibility was confirmed and invoked the normal
  SP-invalid chat binding; it was retried after inspecting the actual console.
- Existing startup event-handler errors, missing asset/sound and cinematic
  AAS/joint warnings are retained. RoE reports 59 startup warnings, 30 on the
  new map and nine in the cold save-load summary. No warning was suppressed or
  declared harmless to make this test pass.
- Both normal campaign exits after the second save load also log
  `idClipModel::FreeTraceModel: tried to free uncached trace model`. Main menus
  remain intact, but the warning is retained as a follow-up for save/restore
  trace-model ownership, not treated as a clean diagnostic log.
- Playback counters advance, but audible quality was not assessed. Full-map
  rendering and the earlier eight-client blank-view case remain separate.
- RTCW SP remains untouched; Blood's pitchfork crash remains deferred at the
  user's request. No save was overwritten or deleted for this checkpoint.
