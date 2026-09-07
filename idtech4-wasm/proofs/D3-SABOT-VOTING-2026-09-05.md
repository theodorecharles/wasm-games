# Doom 3 SABot voting eligibility — 2026-09-05

Follow-up to [automatic population and eight-client evidence](D3-SABOT-POPULATION-2026-09-05.md).
Bots were included as waiting voters, but never cast ballots. With two humans
and two bots, unanimous human approval therefore remained at 2/4, below the
native strict majority. This source-level defect was reproduced by compiling
the exact methods; the earlier Chrome map-vote attempt remained incomplete.

## Fix and tests

The checksum-locked `voting.patch` excludes actual `idPlayer::IsBot()` entities
both when assigning voting eligibility and when counting the current quorum.
The latter also covers a bot refilling an old human slot during a vote. Bots
are not given synthetic yes/no votes. Builds without `MOD_BOTS` preserve the
original implementation; human voting thresholds and deferred execution stay
unchanged. No renderer, asset, wire-schema or public-control API changes.

[Exact-method tests](d3-sabot-voting-2026-09-05.json) compile the actual
`ServerStartVote`/`CheckVote` methods and enum declarations:

- Native ASan/UBSan and Wasm SAFE_HEAP/UBSan: **16,258 checks / 989 cases** each.
- Non-bot native and Wasm builds: **17 checks / 4 cases** each.
- Human-majority matrix with 1–8 humans and all remaining slots occupied by
  0–31 bots; stale bot ballot slots, all-human departure/abort, ties, rejection,
  timeout, late joins and delayed execution.
- Removing only the two new guards exactly reconstructs the pinned original
  methods (unchanged in v3). That negative control fails unanimous two-human /
  two-bot approval with exit 1. The initial unmodified fixture failed as well.

Entity, notification and map-execution APIs are fixtures. This test is not a
full native map change, network vote or Chrome visual acceptance claim.

Fresh [native](d3-sabot-voting-native-repro-2026-09-05.json) and
[Wasm](d3-sabot-voting-wasm-repro-2026-09-05.json) preparations match all 26/36
changed/imported files exactly; existing-destination guards remain non-mutating.
Both actual game builds complete, and all 144 wire class IDs still match.
Previous v3 source reproductions are preserved under `-v3` paths.

## Local v4 package

- Image: `local/idtech4-wasm:doom3-sabot-candidate-v4`.
- ID: `sha256:0eea95bb73dcec49358b9aabee395108c9b2e8c20ea544271a6b2a408e6d18d1`.
- Wasm: `cf4577f143462c2252df47870298769991123f3649a77cefb9ce289038622009`.
- Native game: `e7a8fcfbd78636defc2073a311e4ce8f6e0d4e33b7d96e01a2be5eab6071630c`.
- Native dedicated, JS, worker, runtime, roster and asset hashes are unchanged
  from v3. [All eight packaged hashes](d3-sabot-voting-package-2026-09-05.json)
  were checked against the actual built image, not only staging files.
- All **47 packaged lifecycle checks** pass again on v4:
  [HTTP proof](d3-sabot-voting-http-2026-09-05.json).

The builder now requires voting, population and snapshot fixtures in addition
to source, roster and worker checks. The local image is not pushed and does
not replace production staging, the accepted human-only image, v3 or live lab
services. Asset-redistribution and corresponding-source release gates remain.

## Chrome follow-up

The isolated read-only container `d3-sabot-voting-chrome-proof-20260905` is on
**http://127.0.0.1:32912/** with owner retail data and test-only 90-second idle.
A fresh Chrome client named `VoteMarine` joins through normal Play. The
[native roster before voting](d3-sabot-voting-before-status-2026-09-05.json)
confirms one real human and two bots; the [initial world](d3-sabot-voting-world-2026-09-05.jpg)
is textured with pistol/HUD.

Through real native UI clicks, Escape → New Vote → Change Map → Delta Lab →
Call New Vote selects [this map](d3-sabot-voting-map-selection-2026-09-05.jpg).
The [browser log](d3-sabot-voting-map-change-chrome-2026-09-05.json) records
`VoteMarine called a vote!`, `Vote passed`, `Map: game/mp/d3dm2`, normal map
loading and human/bot spawning. The real server keeps the same `startedAt`
process, reports one native human and two healthy bots, and later records
bot-on-bot/human kills and ordinary match restarts. The
[native log](d3-sabot-voting-native-log-2026-09-05.json) is preserved, warnings
included. **The network vote and new-map join pass; visual acceptance does not.**

Two additional defects/observations emerged:

- [Managed/native map mismatch](d3-sabot-voting-map-status-mismatch-2026-09-05.json):
  actual native UDP reports d3dm2 while the v4 HTTP API incorrectly reports
  startup d3dm1. This proof intentionally has `passed: false`. The candidate
  runtime now prefers the actual roster map, retaining the configured map only
  when no native roster exists. All [40 exact-method status cases](d3-sabot-map-status-2026-09-05.json)
  pass after reproducing the old failure. This runtime-only fix is in v5,
  image `sha256:82f5ec5c7b2dd73ace36b6bf8458407be6a809dd71aeb16f066b712648eb9f84`;
  [actual packaged hashes](d3-sabot-map-status-package-2026-09-05.json) pass.
- [Delta Lab's world](d3-sabot-voting-delta-dark-world-2026-09-05.jpg) is largely
  dark/missing despite live game state and visible emissive surfaces/HUD.
  Native `reloadImages all` gives a [partly textured later view](d3-sabot-voting-reload-diagnostic-2026-09-05.jpg),
  but [kills/respawns between observations](d3-sabot-voting-reload-diagnostic-2026-09-05.json)
  prevent a controlled same-position comparison. Later views remain dark.
  No automatic reload workaround or renderer change was applied; diagnose
  lighting/texture/state behavior before declaring full-map visual acceptance.

`VoteMarine` has used native `DISCONNECT`. A fresh v5 container,
`d3-sabot-map-status-chrome-proof-20260905`, is on **32917** for the actual
corrected API/map-vote check. V4 and all earlier images remain unchanged.
[V4 native disconnect](d3-sabot-voting-disconnect-chrome-2026-09-05.json) and
[natural idle cleanup](d3-sabot-voting-final-idle-2026-09-05.json) confirm no
remaining peer, dedicated process or temporary session; its tab is `about:blank`.

V5 now also passes all [47 packaged lifecycle checks](d3-sabot-map-status-http-2026-09-05.json).
Fresh `MapStatusMarine` joins through Play, then repeats the same native
Change Map vote. [Actual HTTP/native transition evidence](d3-sabot-map-status-chrome-transition-2026-09-05.json)
confirms both report **d3dm2**, the original process is preserved, and one
human/two bots remain ready. The [browser log](d3-sabot-map-status-transition-chrome-2026-09-05.json)
contains the passed vote, new map and real bot-on-human kills. The
[world observation](d3-sabot-map-status-delta-world-2026-09-05.jpg) is separate
from that API/network acceptance; visual behavior still needs diagnosis.

A brief [native shadow diagnostic](d3-sabot-delta-shadow-diagnostic-2026-09-05.json)
uses spectator mode to avoid additional human deaths. Both [shadows on](d3-sabot-delta-shadow-on-2026-09-05.jpg)
and [shadows off](d3-sabot-delta-shadow-off-2026-09-05.jpg) remain largely dark.
`getviewpos` is rejected in multiplayer, so this does not establish an exact
numeric camera comparison or conclusively rule out all shadow behavior.
Native console queries confirm **`r_shadows=1` and `ui_spectate=PLAY` restored**.
No engine files or default settings were changed by this diagnostic.

[Final native disconnect](d3-sabot-map-status-disconnect-chrome-2026-09-05.json)
returns `MapStatusMarine` to the menu; its tab is now `about:blank`.
[Natural idle cleanup](d3-sabot-map-status-final-idle-2026-09-05.json) confirms
v5 is sleeping with zero peers, cleared bot target, no dedicated child and no
temporary session. V3, v4 and v5 proof containers are all naturally sleeping.
The next substantive step is
a controlled renderer diagnosis on Delta Lab, including a direct-map-load
comparison before attributing the dark view specifically to map transitions.
That [direct/roundtrip comparison is now recorded](D3-DELTA-DIAGNOSTIC-2026-09-05.md):
fresh views render, while camera/death effects still confound strict visual
acceptance. A separately reproduced [Ctrl/Alt input fix](IDTECH4-MODIFIER-KEYS-2026-09-05.md)
is packaged in v6 without modifying any renderer/engine artifacts.

The previous eight-client v3 container on 32907 remains sleeping after verified
natural cleanup. Its final blank screenshots have not been diagnosed or closed
by these voting tests; all its test tabs were navigated away.
