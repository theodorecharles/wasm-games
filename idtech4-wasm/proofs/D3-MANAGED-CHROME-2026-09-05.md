# Doom 3 managed multiplayer integration — 2026-09-05

## Scope

This supersedes the unwired status in the earlier
[transport checkpoint](D3-MANAGED-TRANSPORT-2026-09-05.md). Normal launcher Play
now validates owner data, wakes one managed native deathmatch server, starts
the browser worker and issues the original native connection handshake.
Isolated Chrome reaches the textured deathmatch world with pistol and HUD;
two named clients join, and one reconnects while the other remains connected.
Bots, held controls, pointer capture, combat and extended multiplayer acceptance
remain open. Existing lab services are unchanged; these are isolated candidates.

## Implemented integration

- `server/runtime.cjs` uses framework 0.9.6 provisioning and idle supervision.
  It creates a disposable session containing symlinks to only the nine validated
  owner PK4s, starts pinned native `dhewm3ded`/`base.so`, and waits for actual
  protocol 1.42 deathmatch readiness. Owner autoexecs, mods and saved configs
  do not enter the server session. Process exit/startup failure/idle shutdown
  clean up the child and its private temporary directory.
- `server/supervisor.cjs` shares the framework password session with its static
  child, gates wake/status/relay endpoints, checks origin and exposes only HTTP.
  Browser peers and native player rosters are reported separately. The native
  UDP destination stays internal and fixed. Bots explicitly report zero and
  `not-installed`, rather than being inferred from an open relay connection.
- `site/game-adapter.js` waits for managed readiness before transferring the
  canvas or creating the Doom 3 MP worker. The worker alone imports the
  datagram transport and connects to the virtual managed endpoint. SP and RoE
  neither wake a server nor import/autoconnect the transport.
- `Dockerfile.mp` packages the native glibc binaries in a Debian Node runtime,
  framework static server and locked `ws` dependency. The suite and MP variants
  use this managed package; the other variants retain their static package.
  Native build mounts now use a stable path compatible with existing CMake
  caches. No owner game data is embedded.

## First-snapshot crash and repair

The first integrated image completed challenge/connect, loaded
`game/mp/d3dm1`, and failed at `SpawnPlayer: 0`:

```text
Failed to spawn entity with classname 'player_doommarine_mp' of type 'idAI'
```

[Original Chrome failure](d3-managed-first-chrome-2026-09-05.json).
The stripped browser source omitted `idTestModel`. Native Doom 3 assigns wire
class IDs by hierarchy traversal, not by explicit constants: removing this
class changed 142 registrations to 141 and made server `idPlayer` ID 135 decode
as client `idAI`. The snapshot and class/hierarchy implementations are otherwise
identical between the pinned base-game sources.

Restored the complete original `Anim_Testmodel.cpp`/`.h`, its build entry and
game-local ownership/reset fields, preserving upstream notices. RoE's existing
full class is compiled once through the expansion source mapping. No placeholder
ID, wire remapping, protocol version or content-checksum bypass was added.

The new [class-schema check](d3-class-schema-2026-09-05.json) inventories actual
Ninja-selected translation units and compares all 142 names, parents and
source-derived IDs. Removing `idTestModel` reproduces the observed ID-135 error.
The browser's normal `listClasses` console command independently prints all
142 compiled IDs, all matching the source-derived server table:
[console evidence](d3-managed-class-console-2026-09-05.json).

The class-restored candidate `2cd9b866997163ac566f9379efa8d9859dd137784c5065cd55e5fd6d33ddb349`
passed two-client Chrome joins and native reconnect:
[first client](d3-managed-classes-first-chrome-2026-09-05.json),
[second client](d3-managed-second-chrome-2026-09-05.json),
[native roster](d3-managed-two-client-status-2026-09-05.json),
[reconnect](d3-managed-reconnect-chrome-2026-09-05.json).
World screenshots accompany those records. The map automatically advances
through native warmup/restart after the second player joins. No movement,
combat or bot claim follows from these joins.

## Follow-up cleanup and persistence repairs

Native `disconnect` originally removed the player but left its browser relay
peer alive, preventing idle sleep:
[old status](d3-disconnect-legacy-status-2026-09-05.json).
The browser-only disconnect path now closes its port after sending the three
normal disconnect packets. Native desktop behavior stays unchanged. Worker
abort/error/exit paths also dispose all transport peers and queued packets.

The startup log also reproduced overlapping `FS.syncfs` operations. Native
Quit/config callbacks bypassed the framework's serialized queue. They now
delegate to the same framework save hook used by completed savegames and page
lifecycle events. This removes competing native flushes; it does not guarantee
IndexedDB durability after an abrupt tab/process termination.

- Eight compiled native disconnect cases pass; the old source fails all four
  browser cases and retains all four desktop cases:
  [current](d3-disconnect-native-2026-09-05.json),
  [negative control](d3-disconnect-legacy-2026-09-05.json).
- Real Wasm native persistence callbacks plus the actual framework queue
  execute 12 concurrent requests with one sync at a time; the old source
  overlaps nine. Disk I/O is a deterministic asynchronous fixture:
  [current](d3-persistence-native-2026-09-05.json),
  [negative control](d3-persistence-legacy-2026-09-05.json).
- Transport tests now cover 37 cases, including disposal/idempotency; worker
  tests cover normal exit, failed exit, abort and uncaught error cleanup.

## Build and regression evidence

Both client rebuilds, four exact canonical patch trees, 52 SDL input cases,
35 session-routing cases, 30 actual Wasm idPort/EM_JS cases, 17 real relay cases,
status-parser negative cases, six-variant adapter and five-worker tests pass.
Full staging passes using Emscripten 6.0.6 for native Wasm fixtures and the
host AMD GPU for EGL/GLES tests. The source-schema gate also runs before
managed Docker packaging. The complete all-images build was not run, to avoid
replacing existing development tags.

The packaged lifecycle suite passes 32 checks against both the class-restored
and final cleanup candidates, including password/data boundaries, concurrent wake, native
readiness, idle sleep, process-exit recovery, missing-data/spawn-failure cleanup
and suite selection: [earlier checks](d3-managed-classes-http-2026-09-05.json),
[final packaged checks](d3-managed-final-http-2026-09-05.json).
Test-owned temporary containers are removed; owner files are mounted read-only.

Final cleanup candidate: `local/idtech4-wasm:doom3-managed-lifecycle-candidate`,
image `de06c55d8c4a6f079b09ca5b092427c1be6782bc91da0fa32bc2f4dd04a6b2d9`.
Its isolated Chrome container is `d3-managed-lifecycle-chrome-proof-20260905`,
HTTP `127.0.0.1:32885`, with a test-only 90-second idle timeout (default remains
five minutes). Final Chrome checks confirm both named clients join the native
roster and render the world, with no framework error or overlapping sync warning:
[client A](d3-managed-final-a-chrome-2026-09-05.json),
[client B](d3-managed-final-b-chrome-2026-09-05.json),
[native roster](d3-managed-final-status-2026-09-05.json).
Normal native disconnect removes exactly one player/peer while leaving the
second connected; the second disconnect leaves zero peers and starts idle:
[first departure](d3-managed-final-disconnect-status-2026-09-05.json),
[empty match](d3-managed-final-empty-status-2026-09-05.json).
After the test-only 90-second idle timeout the server is sleeping with no native
process or temporary session: [idle cleanup](d3-managed-final-idle-2026-09-05.json).
Native `reconnect` then wakes a new dedicated process, completes its handshake
and returns to the textured world as FinalMarineA with no sync-overlap warning:
[post-idle Chrome](d3-managed-final-rewake-chrome-2026-09-05.json),
[new native session](d3-managed-final-rewake-status-2026-09-05.json).
Both test clients were subsequently left disconnected; the final HTTP candidate
remains available and its native match can idle normally.

Final binary SHA256:

- Base Wasm: `21f6b35dbeb4a9233f32cf6b94fdba7500fb5a4f890fe974dce91b43822972ce`.
- RoE Wasm: `cebd7078d223026613d39c2d6c829d712a6d00a585339ba4251d0f5288de2527`.
- Native server: `5802416c585077a5b7613518af4e5580f81e98a05a03fd8235b6194c060bd742`.
- Native base game: `eeb3af57fd8da270821f43a9545e38097b4cbeabba40893810f385dbecb6a752`.

Earlier failed/partial candidate images and stopped containers are retained for
comparison. Live lab containers and owner saves have not been replaced.

## Remaining acceptance

1. Implement real multiplayer bots against this now-working native connection.
2. Verify sustained controls, combat, pointer capture and longer matches, plus
   SP/RoE campaign/save regression acceptance on the newly rebuilt binaries.
3. Quake 4 software-driver border parity remains separately open; see the
   [driver checkpoint](QUAKE4-BORDER-DRIVERS-2026-09-05.md). Staging on the host
   does not establish llvmpipe parity.

Useful regression commands from the repository root:

Deployment/configuration notes are in the [managed server runbook](../server/README.md).

```sh
node idtech4-wasm/scripts/test-d3-class-schema.mjs
node idtech4-wasm/scripts/test-d3-disconnect.mjs
node idtech4-wasm/scripts/test-d3-persistence.mjs # activated Emscripten 6.0.6
node idtech4-wasm/scripts/test-d3-managed-network.mjs
node idtech4-wasm/scripts/test-d3-network-native.mjs # activated Emscripten 6.0.6
node idtech4-wasm/scripts/test-d3-status.mjs
node idtech4-wasm/scripts/test-d3-relay.mjs
node idtech4-wasm/scripts/test-d3-managed-http.mjs \
  local/idtech4-wasm:doom3-managed-lifecycle-candidate /home/ted/wasm-game-data/doom3
```
