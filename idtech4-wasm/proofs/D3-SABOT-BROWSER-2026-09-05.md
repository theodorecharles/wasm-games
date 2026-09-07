# Doom 3 SABot browser/package checkpoint — 2026-09-05

Two real Chrome humans now join two native SABot players using the matching
Wasm/native pair. Both clients render the textured map, weapon and HUD, receive
bot spawn/userinfo and bot-on-bot kill messages, and receive bot-on-human kills.
There is no observed snapshot crash. This is a separate local acceptance image,
not a live deployment or full movement/aim/audio acceptance.

## Accepted local candidate

- Image: `local/idtech4-wasm:doom3-sabot-candidate-v2`
- Image ID: `sha256:2f82f01019546dbc0ac92e7daf6728e8c9f049d17166b247d4aa605ff2449213`
- Chrome container: `d3-sabot-packaged-chrome-proof-20260905`
- Container ID: `9d8272a65d0de24500fc7fefc51e3e4f2cd629aa1ff0dffcbfdcc8df1b9da2d0`
- URL: `http://127.0.0.1:32898/`
- Read-only root and owner data; disposable `/tmp`; test idle timeout 90 seconds.
  This image needs no source/runtime/binary bind overlays. Retail packs are
  still supplied by the owner and are not copied into the image.

The accepted human-only image/container on port 32885 remains unchanged.
The earlier bot prototype on port 32886 used read-only bind overlays and is
separate from the packaged candidate. Existing lab services, RTCW renderer,
canonical browser patch, production native build and staged site are unchanged.
Blood's pitchfork crash remains deferred at the user's request.

## Browser observations

Using the Chrome-control skill and real UI Play/console events:

- The prototype first joined `BotMarineA`, then `BotMarineB`. Actual native UDP
  status reports human slots 0/1; native bot telemetry reports live brains in
  slots 30/31. Browser logs include bots killing one another and both humans.
- The native `LISTCLASSES` console command in Chrome prints all 144 classes:
  `idPlayer=135`, `idAI=136`, `botAi=142`, `botSabot=143`. The actual compiled
  client/server source schemas and snapshot implementations also match.
- Prototype native `DISCONNECT` releases one peer, then the other. With zero
  humans, the two bots do not prevent idle sleep. Inspection after sleep found
  no `dhewm3ded` process and no `d3-managed-*` session. Normal Play subsequently
  starts a new server and returns `BotRewake` to the textured map with both bots.
- The corrected packaged image independently joins `PackMarineA` and
  `PackMarineB`, both in `gameplay`. Its status reports two human names and two
  fresh native bot samples. Both browsers receive the same bot-on-human kill
  for `PackMarineB`; bot health, weapon changes and real frags are reported.
  This is not synthetic gameplay or an echo-server fixture.

Raw packaged observations:
[client A](d3-sabot-packaged-a-chrome-2026-09-05.json),
[A world](d3-sabot-packaged-a-world-2026-09-05.jpg),
[client B](d3-sabot-packaged-b-chrome-2026-09-05.json),
[B world](d3-sabot-packaged-b-world-2026-09-05.jpg),
[two-client native/relay status](d3-sabot-packaged-two-client-status-2026-09-05.json).

The [full native log](d3-sabot-packaged-native-log-2026-09-05.json) and
[combat console](d3-sabot-packaged-combat-console-2026-09-05.jpg) retain actual
bot/human kills. Later native disconnect observations retain both humans' kills:
[A disconnect](d3-sabot-packaged-a-disconnect-2026-09-05.json),
[B disconnect](d3-sabot-packaged-b-disconnect-2026-09-05.json).
The [one-human status](d3-sabot-packaged-one-client-status-2026-09-05.json)
shows B and both live bots remain after A leaves.
After B also uses native `DISCONNECT`, both browsers report native menu/map
shutdown and the [read-only idle observation](d3-sabot-packaged-idle-2026-09-05.json)
records zero peers, natural sleep, zero bots, correct `sleeping` bot status,
and no native process or disposable session. No forced server stop is used.
Both completed Chrome tabs are then navigated to `about:blank`; the isolated
container remains available, sleeping until Play.

Earlier prototype observations:
[classes/kill log](d3-sabot-classes-chrome-2026-09-05.json),
[two-client status](d3-sabot-two-client-status-2026-09-05.json),
[one-client status](d3-sabot-one-client-status-2026-09-05.json),
[empty/sleeping status](d3-sabot-empty-status-2026-09-05.json),
[rewake log](d3-sabot-rewake-chrome-2026-09-05.json),
[rewake world](d3-sabot-rewake-world-2026-09-05.jpg).
The initial prototype incorrectly labels sleeping bot status `starting`; the
packaged runtime fixes that label and tests it explicitly.

## Reproducibility and fixes

[Source lock and instructions](../bots/doom3/README.md) preserve both ports.
The Wasm port applies the unchanged canonical browser patch, shared native bot
port and three Wasm-specific file deltas. Fresh reconstruction matches all 35
modified/imported browser files byte-for-byte; native reconstruction still
matches all 25. Existing-destination guards refuse without modification.
The Emscripten 6.0.6 helper configures and verifies the tested build (no-op
incremental rebuild after the completed 273-step compile).

The client compiles the same nine bot files and two classes as the server.
The worker verifies the 2,399,406-byte pinned archive by SHA-256, then mounts it
as `base/zz_sabot.pk4` **only for MP**. SP/RoE never fetch/mount it, and missing,
wrong-size or wrong-checksum archives prevent native startup.

Native UDP status intentionally excludes fake clients. The candidate consumes
actual `SABOT_FRAME`/`SABOT_SAMPLE` stdout reports instead: complete frames only,
validated bounded fields/slots, no duplicate slots, 4 KiB line limit, separate
stderr, defensive copies and 15-second freshness. Missing/stale bot state is
not reported as ready. Three failed health polls sleep the failed match; fresh
wake starts a new process. Bot presence is never counted as a human idle hold.

The first package exposed a real preparation bug: Git run in the nested
ignored staging directory silently skipped the patch's root-relative paths.
The bot-enabled HTTP test failed with `bots=0`, and image readback showed the
unchanged human-only runtime/worker. The initial image is retained as failed
evidence, **not accepted**:
[failed package](d3-sabot-package-initial-2026-09-05.json).
The helper now initializes its own Git root, requires both patched-output
hashes, and reads back eight key files inside the built image. It refuses
existing image tags and never pushes or replaces services.

## Verification

- [42 packaged checks](d3-sabot-packaged-http-2026-09-05.json): password/data and
  origin gates, one process for concurrent wakes, native 1.42 readiness with
  two actual bot brains, pinned served archive, both bots moving more than
  64 units, fresh reports, idle cleanup despite bots, new bots after wake,
  unexpected process exit/recovery, repeated spawn failure cleanup and suite
  variant selection. This probe's WebSocket is a lifecycle peer, not a human
  game client; Chrome observations above are separate.
- [26 telemetry tests](d3-sabot-roster-2026-09-05.json), including every possible
  chunk split of a real frame, malformed JSON/fields, duplicate/out-of-range
  slots, giant incomplete lines, stale/partial frames and map-time reset.
- [8 worker tests](d3-sabot-worker-2026-09-05.json): actual candidate worker with
  real archive/SHA-256 and fixture engine, covering MP/SP/RoE and failure gates.
- [144-class schema](d3-sabot-class-schema-2026-09-05.json), plus unchanged
  142-class human-only negative-control test, both pass. The negative control
  still reproduces old `idPlayer` decoding as `idAI` when `idTestModel` is absent.
- [35-file Wasm reconstruction](d3-sabot-wasm-source-repro-2026-09-05.json) and
  native 25-file reconstruction/guards pass.
- [Package hashes](d3-sabot-package-2026-09-05.json) record exact inputs and
  the actual image files; the renderer is not replaced.
- Existing adapter/worker contracts, 37 worker transport cases, 17 real relay
  cases and status parsing with 100 truncations/4 malformed responses pass.
- The unchanged human-only image also passes all
  [32 packaged regression checks](d3-managed-human-regression-2026-09-05.json).

## Still open

Full-capacity human/bot coexistence and eviction/refill; humans before bots;
managed full map changes; dedicated malformed bot-snapshot tests; actual names
in telemetry; quieter status output; duplicate script-constant warnings;
fresh SP/RoE campaign/save regression; production integration and complete
corresponding-source/asset redistribution review.

The native five-map navigation/combat/respawn/cycle evidence remains
[separate](D3-SABOT-NATIVE-2026-09-05.md). The browser bot test uses d3dm1.
Direct bot-model/combat visual acceptance, sustained held movement/aim and
audible listening remain unproven. Browser datasets show no pointer capture;
the automated capture attempt paused the prototype. A temporary X attack
binding and spectator mode were restored with native `UNBIND X` and
`UI_SPECTATE PLAY`; no production input timing was altered for automation.
The non-fatal upstream script redefinition and missing `guisounds.wav` warnings
remain visible; no warning or engine assertion was disabled.
