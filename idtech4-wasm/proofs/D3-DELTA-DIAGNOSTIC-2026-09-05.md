# Doom 3 direct-map / transition comparison — 2026-09-05

Follow-up to the [voting/status checkpoint](D3-SABOT-VOTING-2026-09-05.md).
No renderer, shader, retail asset or engine-binary changes were made.

Later follow-up on 2026-09-06: the
[native sound-clock diagnostic](D3-LIGHT-CLOCK-2026-09-06.md) reproduces
zero-amplitude post-roundtrip blackouts in an old-mixer control and verifies
the existing v7 mixer repair. Native camera/health telemetry replaces the
earlier uncontrolled comparisons for this fault. No shader workaround or
full-map/production acceptance is claimed.

Follow-up on 2026-09-06: unchanged v6 again renders fresh Delta and completes
Delta→Tomiko→Delta, but the same-player comparison remains interrupted by
pause/capture behavior and round cycling. Both clients are restored/disconnected
and naturally idle. A separate [reproduced mixer failure](D3-MP-AUDIO-2026-09-06.md)
explains zero MP playback starts and supplies a sound-clock-dependent lighting
lead. V7 fixes that mixer without changing shaders; controlled Delta visual
acceptance remains open. This note does not revise the historical v5 evidence.

## Same immutable v5 package

Container `d3-sabot-delta-direct-chrome-proof-20260905`, on **32920**, uses
`local/idtech4-wasm:doom3-sabot-candidate-v5`, image
`sha256:82f5ec5c7b2dd73ace36b6bf8458407be6a809dd71aeb16f066b712648eb9f84`.
It has a read-only root, read-only owner data and a test-only 90-second idle.
Only the starting map differs from the previous test: `D3_MANAGED_MAP=game/mp/d3dm2`.

`DeltaDirect` joins through actual Chrome's normal Play button. The
[native roster](d3-delta-direct-native-2026-09-05.json) confirms one human/two
healthy bots. A [fresh Delta Lab view](d3-delta-direct-world-2026-09-05.jpg)
shows lit/textured surfaces and the pistol; the [full browser log](d3-delta-direct-chrome-2026-09-05.json)
is preserved. This disproves a blanket claim that Delta Lab cannot render.

Native UI votes then change **d3dm2 → d3dm1 → d3dm2**. Both
[Tomiko status](d3-delta-roundtrip-tomiko-status-2026-09-05.json) and
[return status](d3-delta-roundtrip-return-status-2026-09-05.json) agree with
actual UDP status and retain the original `startedAt=1788652498573`, one
human and two healthy bots. The [return browser log](d3-delta-roundtrip-return-chrome-2026-09-05.json)
records normal loading/spawning. The [return view](d3-delta-roundtrip-return-world-2026-09-05.jpg)
again has large dark regions. Cameras/spawns differ from the fresh view;
this is not an exact same-camera renderer regression oracle.

## Diagnostic limits and useful findings

- Temporarily disabling shadows leaves the [view largely dark](d3-delta-roundtrip-shadows-off-2026-09-05.jpg).
  Flat-normal testing is interrupted by a bot killing the player, so it does
  not isolate normal mapping. `r_useStateCaching=0` is rejected in multiplayer
  and never takes effect. The actual default interaction path is Phong
  (`r_usePhong=1`), not the alternative Blinn-Phong shader.
- The server subsequently cycles normally to Frag Chamber and The Edge 2.
  Fresh `DeltaFresh` joins the same match through Play; [two native humans](d3-delta-two-clients-native-2026-09-05.json)
  and both bots remain healthy. A [fresh Frag Chamber view](d3-fresh-fragchamber-world-2026-09-05.jpg)
  is textured. Using a temporary F9 fire binding, the transitioned client
  successfully follows the other human. Live observations include textured
  geometry in both clients. The saved [following/followed comparison](d3-fragchamber-following-world-2026-09-05.jpg)
  ([second view](d3-fragchamber-followed-world-2026-09-05.jpg)) instead catches
  a death: visible geometry in the follower and a dark local death fade in
  the followed client. Death/respawn,
  view bob and automatic cycling still prevent a strict fixed-camera Delta
  comparison. These are observations, not full-map acceptance.
- The original base-game code deliberately fades a dead local player's view
  to black over 12 seconds (`Player.cpp` / `PlayerView::ScreenFade`). Remote
  followed-player death does not start that local fade. Earlier completely
  black screenshots and negative-health HUDs therefore cannot alone establish
  missing lighting. Likewise, free spectator spawning raises the camera and
  can place it outside normal room geometry. Do not label either case a
  renderer failure without checking actual player/camera state.
- Ctrl's default `_attack` binding exposed a separate, reproduced browser
  input-filter bug; see the [modifier-key fix](IDTECH4-MODIFIER-KEYS-2026-09-05.md).

All temporary settings are [queried and restored](d3-delta-roundtrip-restored-2026-09-05.json):
`r_shadows=1`, `r_skipBump=0`, `ui_spectate=PLAY`, and exactly
`F9 = loadgame quick`. An automatic map change interrupted the first cleanup
attempt; the later successful queries, not that earlier attempt, establish
restoration. Both [first](d3-delta-direct-disconnect-2026-09-05.json) and
[second](d3-delta-fresh-disconnect-2026-09-05.json) clients then use native
`DISCONNECT`, and their tabs are `about:blank`.
[Natural idle](d3-delta-roundtrip-final-idle-2026-09-05.json) confirms zero
peers, no native child/session and a cleared bot target.

Remaining: controlled Delta Lab same-player/camera comparison with deaths and
automatic map cycles accounted for; no speculative shader/state workaround
has been promoted. The earlier eight-client blank-view observation is also
not closed by this test.
