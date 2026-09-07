# Doom 3 SABot native prototype — 2026-09-05

Later same-day [browser/package checkpoint](D3-SABOT-BROWSER-2026-09-05.md)
supersedes the browser-integration next steps below. This document preserves
the scope and results of the earlier native-only runs.

Real native bots now navigate all five stock deathmatch maps. Actual combat,
score changes and respawning are recorded. This is **not browser acceptance**:
the production Wasm source/patch, staged site, native package and existing
managed candidate were not changed during this work.

The accepted human-only candidate remains
`http://127.0.0.1:32885/`; its earlier two-client/disconnect/idle/rejoin proof is
[separate](D3-MANAGED-CHROME-2026-09-05.md). Live lab services remain unchanged.

## Source and implementation

The [pinned source lock](../bots/doom3/source-lock.json),
[reproduction instructions](../bots/doom3/README.md) and
[native port patch](../bots/doom3/native-prototype.patch) preserve the work
outside ignored `.work` checkouts. The source starts at native commit
`31e877e7e4e691ed9f98603da9cd95ac59540cf3`; the nine SABot files and navigation
archive come from idTech4A++ commit
`dea1eb9f122cfae042961cfc32a3474e59354589`.

Changes relative to that reference integration:

- Native include/API/CMake compatibility, with bot implementations compiled
  as separate translation units. No replacement renderer.
- Bot creation after the player completes spawning. The first attempt called
  `Spectate(false)` during `Player::Init` and hit the original visibility /
  spectator assertion. [The failed run](d3-sabot-native-initial-2026-09-05.json)
  retains the native stack and assertion; the assertion was not disabled.
- Recreate AI after `LocalMapRestart` deletes non-player entities. The
  [intermediate run](d3-sabot-native-spawn-2026-09-05.json) moved initially but
  lost its AI at match start. Its old narrow `passed` field is not sustained
  acceptance. The final probe checks live brains on every sampled frame.
- Initialize bot AAS after map entities exist, allowing elevator/teleporter
  links. Replace raw list-storage aliasing with ownership-safe `idList::Swap`
  and independent copies, initialize navigation temporaries, bound elevator
  routing, and repair reverse-reachability unlinking.
- Prefer free high client slots and never overwrite an occupied player while
  adding a bot; validate lookup bounds/nulls. Human coexistence is still an
  integration test requirement, not claimed from these bot-only runs.
- Read and write bot commands with matching multiplayer/assets gates. The
  upstream macro included `isServer`, which cannot gate the client read path.
  Add truncated-message/index/duplicate checks before array access. These
  snapshot hooks still require native/Wasm wire tests and actual client joins.
- Broadcast bot userinfo to later human arrivals; keep the dedicated
  unrendered weapon's fallback muzzle at the player's eye position.
- Add read-only `sabot` telemetry: game time, live brains, positions, health,
  spectator state, native buttons/movement, equipped weapon and real scores.

## Native runtime results

RelWithDebInfo native build with assertions, using the existing bookworm
toolchain. Each run has a separate network-isolated container, read-only owner
packs and bot archive, and a temporary writable session. No movement, aiming,
damage, kill or score inputs are injected. Bots run their actual AI, scripts,
player physics, weapons and multiplayer rules.

| Map | Run | Recorded bot-on-bot kills |
| --- | --- | --- |
| d3dm1 | 90 seconds | 2; score progresses 0 → 1 → 2 |
| d3dm2 | 30 seconds | 1; score progresses 0 → 1 |
| d3dm3 | 30 seconds | None observed in this short run |
| d3dm4 | 30 seconds | None; attack and reduced health observed |
| d3dm5 | 30 seconds | 1; score progresses 0 → 1 |

All five runs load the stock navigation, retain two live AI throughout the
sampled match-start restart, move both bots more than 64 world units, pick up
weapons, and exit cleanly with no stderr error. The d3dm1 sequence includes
death, positive health after respawn, continued movement and another kill.
Movement measured 854–3,194 units maximum displacement depending on bot/map;
that is not a claim that every elevator, route or map area was exercised.

Raw observations and complete native logs:
[d3dm1](d3-sabot-native-d3dm1-2026-09-05.json),
[d3dm2](d3-sabot-native-d3dm2-2026-09-05.json),
[d3dm3](d3-sabot-native-d3dm3-2026-09-05.json),
[d3dm4](d3-sabot-native-d3dm4-2026-09-05.json),
[d3dm5](d3-sabot-native-d3dm5-2026-09-05.json).

The [70-second map-cycle run](d3-sabot-native-cycle-phases-2026-09-05.json)
also loads d3dm1 → d3dm2 → d3dm3 → d3dm4 → d3dm5 → d3dm1 in one native
process. Each phase recreates two bots, demonstrates more than 64 units of
movement per bot within that map, and exits cleanly. This exercises navigation
teardown/reallocation and explicit native `addBots` after each full map change;
it is not automatic managed refill. All six phase checks pass.

The probe preserves zero-bot transition samples. Its first cycle attempt added
bots before the deferred native map change actually executed; the second used
a steady-state-only assertion that rejected the expected empty period before
explicit refill. Those failed records remain
[initial](d3-sabot-native-cycle-2026-09-05.json) and
[deferred-load follow-up](d3-sabot-native-cycle-fixed-2026-09-05.json).
The final phase contract requires refill within five game seconds, two active
bots afterward without later loss, and navigation in each phase separately.
No native code or binary changed between these three cycle attempts.

Tested binary SHA-256:

```text
dhewm3ded ad8c59a8099befadb1cf6c5743ac53ca594781384196079f74469da069cb547c
base.so   c28dfbc14dd7668391d1a6df49585a91b16f0823d4436a538b52c30219edf769
```

A fresh clone plus the checksum-verified imports and durable patch reproduces
all 25 changed/imported files byte-for-byte:
[source reproduction](d3-sabot-source-repro-2026-09-05.json).
Preparation refuses an existing destination without altering it. JS/shell
syntax checks, patch reverse-check and native tracked diff whitespace checks
pass. No new Wasm/staging result is claimed.

## Remaining

Port matching classes/snapshot hooks to the accepted Wasm source and verify the
actual class table and wire layout. Mount bot assets only for MP, resolve and
carry redistribution notices/source, then integrate actual bot roster/refill
with managed readiness and idle lifecycle. Prove humans joining bots in Chrome,
two humans, combat, disconnect, idle shutdown and wake. Do not replace the
verified human-only pair with this native-only prototype.

Blood's pitchfork crash remains deferred at the user's request; RTCW's accepted
renderer is untouched. The broader repair goal remains open.
