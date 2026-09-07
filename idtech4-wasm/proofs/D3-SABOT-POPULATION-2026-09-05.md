# Doom 3 SABot automatic population — 2026-09-05

This follows the [two-client browser/package checkpoint](D3-SABOT-BROWSER-2026-09-05.md).
The isolated v3 candidate maintains two bots, yields capacity to real humans,
and refills after departures. Production staging, the accepted human-only
image, historical v2 image and live lab services are unchanged. This is not a
public release or complete gameplay acceptance.

## Reproducible candidate

- Image: `local/idtech4-wasm:doom3-sabot-candidate-v3`.
- Image ID: `sha256:9624fdce14774e883aa9c8c15dd68585888bc4d050089498f190ece052ab5916`.
- Chrome container: `d3-sabot-capacity-chrome-proof-20260905`, port **32907**.
  Read-only root and owner retail-data mount; disposable tmpfs session. The
  90-second idle timeout is test-only. No source/binary/runtime bind overlays.
- Wasm SHA-256: `1e9a5ed8f7fee1ff5ef9515b283b2ce2fe9fc7edf94548c9edd63a5120f6c7a8`.
- Native game SHA-256: `7fe769d6d3c242a65d373845911264e2ee95c1a0714b414880cba85e94d059dd`.
- All eight actual packaged files and all source/patch inputs are hashed in
  [package evidence](d3-sabot-population-package-2026-09-05.json) and
  [source-lock.json](../bots/doom3/source-lock.json).

The new checksum-locked `population.patch` applies after the native port and,
for Wasm, the browser hooks. Fresh native and Wasm preparation reproduces all
25/35 modified or imported files exactly. Both builds succeed; the 144-class
wire tables still match. Old source reproductions are preserved in separate
`-v2` directories, not overwritten.

## Behavior and regression checks

`MaintainPopulation` runs before the server's player PVS/entity traversal. It
counts actual human player entities (including spectators), removes only bot
entities when capacity falls, and retries missing bots at most once per game
second. It handles orphan bodies, unavailable navigation/definitions and map
clock resets. Setting zero preserves manual bot management; the packaged
server requests two bots with an eight-player capacity.

Native `sabot status` now emits a quiet, explicitly flushed frame containing
actual human count and desired bot count. The bounded parser publishes those
fields atomically with the complete bot roster. The manager accepts zero bots
as healthy only when eight native humans occupy the match. Loading relay peers
are not counted as native humans. Stale or incorrect populations still fail
health polling; bots do not keep an empty managed match awake.

| Evidence | Result | Scope |
| --- | --- | --- |
| [Snapshot methods](d3-sabot-snapshot-2026-09-05.json) | 59,797 checks per native/Wasm target | Exact snapshot/BitMsg methods; fixture game/error state |
| [Population methods](d3-sabot-population-2026-09-05.json) | 2,214 checks per target | Exact target/maintenance/slot methods; fixture entity and spawn APIs |
| [Automatic native map cycle](d3-sabot-auto-cycle-final-2026-09-05.json) | All six phases pass | Real dedicated d3dm1→2→3→4→5→1, no explicit `addBots` |
| [Population roster](d3-sabot-population-roster-2026-09-05.json) | 36 checks pass | Bounded telemetry, atomic population and zero-target handling |
| [Packaged HTTP/lifecycle](d3-sabot-population-http-2026-09-05.json) | 47 checks pass | Actual v3 image, auth, movement, idle, recovery and target reporting |

Snapshot checks include 256 round trips, 3,993 bit-exact truncations, 34 invalid
slot/duplicate cases and 10,000 deterministic fuzz inputs. Native ASan/UBSan
and Wasm SAFE_HEAP/UBSan remain enabled. The exact upstream unguarded reader
fails the empty-prefix negative control. This is **not** full browser recovery
from malformed datagrams, nor a claim of atomic rollback for every error path.

Population fixtures cover humans arriving before bots, all capacity changes,
departures, occupied high slots, orphans, map resets, missing assets and bounded
failed-spawn retry. The real automatic map cycle lasts 70 seconds; both bots
move over 64 units in each phase, and each map reaches two live brains within
1,376–1,680 game milliseconds. The short cycle is not additional kill evidence.

## Chrome capacity check

Eight separate Chrome tabs were created for actual normal Play joins, named
`Capacity01` through `Capacity08`. No fake network humans or hidden game-input
injection are used. The first six concurrent loads completed, and all six DOM
states reached `gameplay`; browser logs contain real bot/human kill messages.

- [Six humans / two bots](d3-sabot-capacity-six-2026-09-05.json) passes actual
  native roster, unique human slots/names, non-overlapping bot slots, freshness
  and health checks. [All six browser logs](d3-sabot-capacity-six-chrome-2026-09-05.json)
  and [world screenshot](d3-sabot-capacity-six-world-2026-09-05.jpg) are retained.
- [Seven humans / one bot](d3-sabot-capacity-seven-2026-09-05.json) passes the
  same checks after a seventh normal Play join. Its [browser log](d3-sabot-capacity-seven-chrome-2026-09-05.json)
  and [world screenshot](d3-sabot-capacity-seven-world-2026-09-05.jpg) are retained.
- [Eight humans / zero bots](d3-sabot-capacity-eight-2026-09-05.json) passes the
  same checks. All eight clients remain in actual `gameplay`, with native slots
  0–7 occupied and no bot entities in the reported roster. [All eight logs](d3-sabot-capacity-eight-chrome-2026-09-05.json)
  and the [eighth player's world](d3-sabot-capacity-eight-world-2026-09-05.jpg)
  are retained. Zero bots reports `ready`, not failed health.
- Normal native-console `DISCONNECT` from player eight produces
  [seven humans / one refilled bot](d3-sabot-capacity-refill-one-2026-09-05.json).
  Its [menu/Map Shutdown log](d3-sabot-capacity-eighth-disconnect-2026-09-05.json)
  and the remaining client's [new bot join message](d3-sabot-capacity-refill-one-console-2026-09-05.jpg)
  confirm the browser-side sequence.
- Normal departure of player seven produces
  [six humans / two refilled bots](d3-sabot-capacity-refill-two-2026-09-05.json).
  [All eight browser states/logs](d3-sabot-capacity-refill-chrome-2026-09-05.json)
  show the six remaining clients in gameplay, the departed two in menus, new
  bot joins and subsequent bot-on-human kills.
- Four more normal disconnects leave [two real humans / two bots](d3-sabot-capacity-two-remaining-2026-09-05.json).
  The six departed tabs were then navigated to `about:blank`.

After that cleanup, both remaining screenshots appeared black, while their
DOM game logs and real server telemetry continued. Escape did not provide a
usable visual recovery. [Both logs](d3-sabot-post-capacity-chrome-2026-09-05.json)
and [first](d3-sabot-post-capacity-blank-1-2026-09-05.jpg)/[second](d3-sabot-post-capacity-blank-2-2026-09-05.jpg)
screenshots are retained. **The map-vote/full-transition attempt is incomplete**;
this observation is not diagnosed as an engine crash or a browser defect.

The remaining two tabs were also navigated away. All eight test tabs are now
`about:blank`. [Natural idle cleanup](d3-sabot-capacity-final-idle-2026-09-05.json)
confirms the v3 container is sleeping, with zero peers, cleared bot target,
no dedicated child and no disposable session. No forced managed sleep was used.

The read-only `test-d3-sabot-capacity-status.mjs` observes these separately
controlled Chrome clients; it does not create players or establish rendering.
The colored lower-left bars are the native lagometer, confirmed against
`PlayerView.cpp` and `UpdateLagometer`, not garbled font rendering.

## Still open

- Managed map changes with connected browsers. A ninth/full-server rejection
  path is not yet exercised.
- Diagnose/retest the post-capacity blank screenshots before broader visual
  acceptance. The earlier capacity/world screenshots remain distinct evidence.
- Full browser error recovery from malformed snapshots; fresh SP/RoE campaign
  and save regression using the new package.
- Direct bot-model/combat visual acceptance, sustained aim/movement and audible
  listening. Chrome taps are not held keys; pointer lock remains unproven.
- Add actual bot names to telemetry. Resolve upstream duplicate script-constant
  warnings and investigate native clip-model warnings without hiding them.
- Public-release asset rights and complete corresponding-source packaging.

The retail packs are owner-provided and are not included in the candidate.
The original renderer and all unrelated edits remain preserved.
