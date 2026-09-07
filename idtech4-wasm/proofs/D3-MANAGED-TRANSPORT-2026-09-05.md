# Doom 3 managed multiplayer foundation — 2026-09-05

Historical foundation checkpoint. Subsequent supervisor/worker integration,
two-client Chrome joins and reconnect, plus cleanup repairs are recorded in
[D3-MANAGED-CHROME-2026-09-05.md](D3-MANAGED-CHROME-2026-09-05.md).

## Status: not yet connected gameplay

The documented server-browser behavior is not an auto-connect-only bug. The
pinned d3wasm client explicitly disables its UDP socket path; the id Tech 4
image also has no dedicated-server supervisor. This checkpoint implements and
tests the transport and builds an isolated real native server. It does **not**
mark Doom 3 MP working or supply bots.

The browser worker does not yet import/configure the new transport, and the
adapter does not yet wake/autoconnect a managed match. The existing static
package and all lab services remain unchanged. Do not deploy this as a finished
managed multiplayer image.

## Implemented and tested

- Browser-only `idPort` uses a worker-owned binary datagram transport instead
  of unsupported Emscripten UDP descriptors. Its only destination is the managed
  virtual `127.0.0.1:27666`; arbitrary IPs, ports, broadcast and listen-server
  requests are rejected. Unconfigured single-player workers remain offline.
- Blocking receives yield through actual Asyncify so WebSocket callbacks can
  run. Connect/reconnect closes the previous browser port. Whole packet
  boundaries, byte copies, bounded incoming/outgoing queues and stale callback
  cleanup are covered by 33 worker transport cases and 30 actual compiled
  `idPort`/EM_JS cases. The latter uses a deterministic WebSocket fixture, not
  native gameplay: [native result](d3-network-native-2026-09-05.json).
- The relay requires explicit authorization and lifecycle callbacks, checks
  request origin, assigns isolated loopback identities and connects each UDP
  socket to a fixed native server. Real local WebSocket/UDP echo tests cover
  readiness, packet fidelity, isolation, failure cleanup and queue bounds:
  [17-case result](d3-relay-2026-09-05.json), including same-host/different-scheme
  origin rejection. TLS-terminating deployments must configure `publicOrigin`.
- A bounded protocol 1.42 status parser matches the pinned native
  `ProcessGetInfoMessage` and `WriteDeltaDict(NULL)` formats. Valid request/
  roster tests, all 100 truncation offsets and four invalid responses pass.
- Both Doom 3 and RoE Wasm clients rebuild. All four canonical patch trees
  reconstruct exactly. The existing 52 SDL input cases, 35 session cases and
  six-variant adapter contract still pass. This checkpoint did not restage or
  run Chrome against the new Wasm binaries.

New Wasm SHA256 values:

- Base: `2e11147018e11112e3ad839b0dca69d40e68210662abc7fc23db2793b5ca745b`.
- RoE: `0880fb421473b6e38258a12d8d18c4f8b3477c384b1e0c5811061d571270d761`.

## Actual dedicated server

The original native dhewm3 source already pinned for RoE game code
(`31e877e7e4e691ed9f98603da9cd95ac59540cf3`) builds `dhewm3ded` and `base.so`
using `scripts/build-d3-managed-native.sh`. This is not the discarded custom
browser renderer in `.work/dhewm3`. The server speaks the client's original
protocol 1.42; no protocol version or content checksum check was bypassed.

An isolated container loaded `game/mp/d3dm1` in deathmatch mode using the
owner's Doom 3 installation mounted read-only. Its configuration is in a
temporary container filesystem; no owner files or existing saves were changed.
Only loopback UDP port 32882 was published. The production worker transport
and relay exchanged real status and challenge/response datagrams with it:
[dedicated-server proof](d3-managed-server-2026-09-05.json). The roster is empty;
no client connect, snapshot/usercmd gameplay or bot match is claimed.

The stopped proof container is `d3-managed-native-proof-20260905`, ID
`eef39575016509e0fd080db31258945f4657052c7b7a4f6909ee048cf127b207`.
The reusable build image `local/idtech4-managed-native-toolchain:bookworm` is
`sha256:57882ac947f270cc109a2d1fe322ff0a99b25504484c74b1329f46784e21c011`.
Native build outputs remain in `.work/d3-managed-native`; binary hashes are
recorded in the proof JSON. The server's native map-load log contains ordinary
legacy asset warnings; the real status/challenge responses establish readiness.

## Resume

1. Wire the framework password/provisioning/idle lifecycle into a managed
   supervisor. Mount only validated owner PK4s into a disposable session and
   package the native binaries, relay and locked `ws` dependency.
2. Import/configure `site/d3-managed-network.js` in the Doom 3 MP worker only;
   wake the server before startup and issue normal native `connect` to the
   virtual managed endpoint. Keep Doom 3 SP and RoE behavior unchanged.
3. Prove an actual browser client handshake and advancing snapshot/usercmd
   gameplay, plus reconnect and multiple-client isolation. Then implement and
   test bots; status/challenge success alone is not connection proof.

Regression commands (from the repository root):

```sh
node idtech4-wasm/scripts/test-d3-managed-network.mjs
node idtech4-wasm/scripts/test-d3-network-native.mjs # activated Emscripten 6.0.6
node idtech4-wasm/scripts/test-d3-status.mjs
npm ci --ignore-scripts --prefix idtech4-wasm/server
node idtech4-wasm/scripts/test-d3-relay.mjs
# Only after restarting the named isolated native proof container:
node idtech4-wasm/scripts/test-d3-managed-server.mjs 32882
```

The native build toolchain uses Debian packages; their resolved versions are
not a reproducible OS lock. Engine source and `ws` are pinned. The transport/
status tests now run in the normal full-client build script. Full managed-image
packaging, readiness/idle integration and Chrome acceptance remain open.
