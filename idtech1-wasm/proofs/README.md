# id Tech 1 proof checkpoints

The [2026-09-05 managed Classic bot service](CLASSIC-MANAGED-2026-09-05.md)
is the latest deployment. Original/Smooth now launch with two native bots,
an eight-second human-admission grace and network audio. All fourteen Chrome
joins render their three-player first maps, start WebAudio, capture on click
and release on Escape. Native lifecycle, two-human admission, failure recovery,
stale/late relay rejection and 32 single-player regressions pass. The final
one-minute combat matrix passes 6/7; Doom passes a separate three-minute
frag/respawn follow-up, with its shorter failure retained. Automatic capture,
sustained keyboard controls, listening and wider acceptance remain open.

The [2026-09-05 native Classic bot prototype](CLASSIC-BOTS-2026-09-05.md)
is an earlier implementation checkpoint, **not a deployment**. All seven
IWADs pass isolated two-native-bot movement/attack/health smoke tests. Both
classic profiles have passing unchanged-Wasm cases, with a recorded one-minute
Heretic Smooth health-check failure and a passing two-minute follow-up. Managed
lifecycle, lobby policy, network audio and Chrome bot acceptance remain open.

The [2026-09-04 classic Chrome input repair](CLASSIC-CHROME-2026-09-04.md)
is the preceding deployment. It extends single physical-input ownership to every
profile and verifies native menu-to-level startup, rendering, mouse firing and
capture/release across all seven titles in Original and Smooth. DSDA Doom and
Modernized Doom II deathmatch also have browser checks. Classic bots, sustained
keyboard movement, audible listening and the listed acceptance limits remain.

The [2026-09-04 Chrome input repair and seven-title sweep](MODERNIZED-CHROME-2026-09-04.md)
is the preceding adapter deployment. It fixes duplicate physical menu input and proves
rendered Modernized bot matches, mouse fire/capture/release, and running native
browser audio callbacks across all seven titles. Automatic transition capture,
sustained keyboard movement and audible listening remain open.

The [2026-09-04 Modernized audio repair](MODERNIZED-AUDIO-2026-09-04.md) is the
preceding native-audio checkpoint: OPL music, mixed effects, SDL/WebAudio
handoff, and 25 final-image native cases including mute/suspend and sustained
playback. Audible Chrome acceptance remains pending.

The [2026-09-04 Modernized menu repair](MODERNIZED-MENUS-2026-09-04.md) records
profile-specific cursor policy, native menu/console
state, and capture-loss recovery. All seven titles pass native checks using
the final image's served artifacts. Actual Chrome pointer acceptance remains.

The [2026-09-04 match-selection repair](MATCH-SELECTION-2026-09-04.md) records
engine/variant-aware admission, busy/stale-match
protection, and seven native Modernized joins with two bots. Chrome acceptance,
and classic bots remain open. The later audio checkpoint above supersedes its
silent-client limitation; audible browser acceptance is still pending.

The [2026-09-04 classic startup repair](CLASSIC-STARTUP-2026-09-04.md) records the
OPL deadlock fix, configuration correction, deployment, native regression
matrix, and negative controls. The later classic Chrome checkpoint above adds
the actual-browser startup and input evidence.

## Historical multiplayer browser proof

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

Original and Smooth use the official Chocolate Doom 3.1.1 dedicated server
(built from pinned commit `410d96855b5df5410ff591a90efeafa889119224`) and
assign the two browser clients slots 0 and 1. Modernized assigns them slots 2
and 3 after the two bots.

The historical run used a local supervisor and two Chrome CDP endpoints on
ports 9225 and 9226. This command is provenance, not the current agent testing
workflow; new browser acceptance must use the approved Chrome-control skill.

```sh
node idtech1-wasm/scripts/test-multiplayer-browser.mjs \
  --output idtech1-wasm/proofs/multiplayer-21.json
```
