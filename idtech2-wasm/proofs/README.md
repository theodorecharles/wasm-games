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
