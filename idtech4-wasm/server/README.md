# Managed Doom 3 multiplayer

The suite and Doom 3 MP images run a framework-authenticated HTTP supervisor,
static game site, fixed-destination WebSocket/datagram relay and on-demand native
Doom 3 dedicated server. This is an in-development candidate: browser joins,
two clients and native reconnect have been observed; bots are not installed.
See the [current proof](../proofs/D3-MANAGED-CHROME-2026-09-05.md) for exact scope.

## Build

Prepare and build the pinned clients with `scripts/build-all.sh`, then run
`scripts/build-docker.sh`. The latter builds the pinned original native server,
checks the client/server class schema, and packages managed suite/MP images.
Other locked variants remain static images. These commands require the pinned
framework checkout and toolchains described by the family source lock.

For an already staged development checkout, build a distinct candidate with
`Dockerfile.mp`; both `build/native/dhewm3ded` and `build/native/base.so` must
exist. Do not package unmatched client/native game sources: their runtime class
registration order is part of the wire protocol.

## Owner data and exposure

Mount the owner's installation read-only at `/data`, with `base/pak000.pk4`
through `base/pak008.pk4` matching the data manifest. Publish only container
TCP port 8088. The engine's UDP port is internal; the browser uses the
authenticated same-origin WebSocket endpoint. `/health` is public; managed
status/wake/relay and owner-file delivery share the framework password policy.

Only validated retail packs are symlinked into a new `/tmp/d3-managed-*`
session. Owner config, autoexec, arbitrary mods and platform game libraries
are not loaded by the native server. The session and child are removed on
sleep/failure/shutdown. Owner files are never deleted by this cleanup.

Read-only containers need writable `/tmp` (the tested candidate uses a
256 MiB tmpfs). The runtime runs as the non-root `node` user. No owner Doom 3
packs are embedded in image layers; the shared family site does contain the
already approved public Quake 4 SDK packs under their separate terms.

## Configuration

- `WASM_GAME_PASSWORD`: framework access password; configure it before exposing
  the service beyond a trusted local machine. Supply it through your deployment's
  secret mechanism, not a checked-in file or command containing the password.
- `WASM_GAME_SESSION_SECRET`: optional stable shared authentication secret.
  If absent, the supervisor generates one per process and shares it with its
  static child. Restarting that process invalidates old password sessions.
- `D3_PUBLIC_ORIGIN`: exact external origin, such as `https://games.example.com`,
  when TLS terminates at a reverse proxy. Forward WebSocket upgrades and preserve
  the external Host header. The service does not trust client-supplied forwarded
  protocol headers to authorize an origin.
- `IDLE_TIMEOUT`: framework duration, default `5m`. Connected browser peers
  prevent idle sleep; native disconnect and worker exit release them. Native
  roster counts are exposed separately and are not bot counts.
- `KEEP_ALIVE=true`: disables idle sleep; normal process/failure cleanup remains.
- `D3_MANAGED_MAP`: one of `game/mp/d3dm1` through `game/mp/d3dm5`, default d3dm1.
  The managed match is deathmatch, eight maximum players, warmup disabled.
- `D3_START_TIMEOUT_MS`: readiness deadline, default 45000 milliseconds.
- `WASM_GAME_VARIANT`: `doom3-mp` in the MP image; the suite image uses `suite`.

Internal port/path overrides are intended for isolated tests or controlled
packaging. Keep the browser's virtual endpoint `127.0.0.1:27666` unchanged;
the relay translates it to the configured internal native UDP port.

## Checks and troubleshooting

Normal Play validates files and awaits actual native map readiness before
starting the worker. Missing/invalid owner data returns 409 without starting a
native process; spawn/readiness failures remain errors and clean up their
temporary session. Subsequent Play can retry. An authenticated native reconnect
also wakes a sleeping server through the relay.

`GET /api/doom3/status` reports lifecycle state, native protocol/map/players,
relay peer/packet counts and explicit bot status. A peer is not proof that a
player completed the native connection. Do not call the service playable based
only on `/health`, status/challenge packets or a populated relay count.

Run `scripts/test-d3-managed-http.mjs IMAGE OWNER_DOOM3_DIRECTORY` for 32
packaged auth/provisioning/lifecycle checks. It creates and removes only its
own isolated test containers and mounts owner files read-only. Source/transport
and Chrome regression commands and artifacts are listed in the proof record.

The recorded llvmpipe Quake 4 border-oracle failure is separately unresolved;
do not skip or weaken the staging test to hide that driver discrepancy.
