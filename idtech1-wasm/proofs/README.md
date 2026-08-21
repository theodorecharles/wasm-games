# id Tech 1 multiplayer browser proof

`multiplayer-21.json` is the machine-readable result of one uninterrupted
21-case matrix run on 2026-08-21. It covers Doom, Doom II, TNT, Plutonia,
Heretic, Hexen, and Chex across Original, Smooth, and Modernized profiles.

Every case must prove all of the following or the test exits nonzero:

- two independent Chrome processes join as distinct network players;
- the game reports a live netgame and the expected player count;
- the supervisor reports two humans and two WebSocket/UDP relay peers;
- a physical keyboard event changes the tested player's world coordinates;
- mouse press/release changes attack state from `1` back to `0`;
- mouse motion changes the tested player's in-engine heading;
- closing both clients makes the framework-managed server sleep automatically;
- Modernized uses Zandronum with two server-side bots (four total players).

Original and Smooth use the Chocolate-compatible server and assign the two
browser clients slots 0 and 1. Modernized assigns them slots 2 and 3 after the
two bots.

Reproduce the complete proof from a running local supervisor and two Chrome
CDP endpoints on ports 9225 and 9226:

```sh
node idtech1-wasm/scripts/test-multiplayer-browser.mjs \
  --output idtech1-wasm/proofs/multiplayer-21.json
```
