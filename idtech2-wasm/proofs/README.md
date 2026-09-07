# id Tech 2 browser proofs

`quake-multiplayer.json` records a live, two-tab Chrome run against the
framework-managed native NetQuake/FrikBotNex server. The proof requires both
named browser players to remain on the native roster, independent datagram
relay identities and accepted ports, advancing receive counters in both Wasm
clients, two active server bots, and independent real mouse-look input.

`quake2-multiplayer.json` applies the same standard to the native Quake II
protocol, Yamagi `q2ded`, and two 3ZB2 server bots on `q2dm1`.

`quake2-expansions.json` records Chrome reaching the first playable maps of
both official Quake II mission packs through their matching native game
servers.

The proprietary PAK files are owner-supplied at runtime and are not stored in
this repository.

## Managed-server regression — 2026-09-04

The Quake II root-user startup regression is fixed. The supervisor copies
`q2ded` into a temporary portable session, gives only that session to UID/GID
65534, and drops the child process privileges. Symlinks into owner data and
installed game modules are not traversed when changing ownership.

Run the real-server regression with owner-supplied base and expansion PAKs:

```sh
IDTECH2_TEST_DATA_ROOT=/home/ted/wasm-game-data/quake2 \
  node idtech2-wasm/scripts/test-managed-server.mjs
```

Six cases passed against rebuilt images: two base deathmatch wake/sleep cycles,
Xatrix campaign/deathmatch, and Rogue campaign/deathmatch. Each case checked
HTTP wake, a native UDP reply with the expected map, non-root process/session
ownership, and idle removal of the temporary directory. The three lab services
also returned HTTP 200 and running states on ports 8082, 18082, and 28082.
These checks do not replace browser gameplay, mouse, or bot verification.
