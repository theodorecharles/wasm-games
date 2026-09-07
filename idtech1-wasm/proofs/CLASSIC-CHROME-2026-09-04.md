# Classic Chrome input repair and fourteen-case sweep — 2026-09-04

Installed at `http://127.0.0.1:8010/`. All seven titles now reach their actual
first levels through native New Game menus in both Original and Smooth.
Chrome also verifies physical firing and real pointer capture/release. This
supersedes the earlier classic checkpoint's pending-browser status, not its
native-engine provenance. Classic solo-with-bots remains unfinished.

## Repair

The previous adapter fixed duplicate physical input only for Modernized
deathmatch. Real Chrome reproduced the same defect in Original Doom: one
Escape opened and immediately closed Main; one click skipped menu levels.
SDL and the adapter both delivered the physical input.

Physical keys, buttons and wheel now belong only to each engine's SDL path.
Crispy and DSDA also receive physical relative motion through SDL 2. Only
Zandronum's Modernized deathmatch retains the captured pointer-motion seam,
because its SDL 1.2 relative-state shim is empty. Gamepad hooks remain; dead
physical-input bookkeeping was removed. This is an adapter-only deployment.

The regression test checks single ownership across every game/profile and
preserved gamepad controls. `IDTECH1_TEST_ADAPTER` permits a negative control:
the previous deployed adapter fails at `doom/original physical keys have only
one input owner` (six reinjections, expected zero). The repaired adapter and
full static/source/package/HTTP suite pass. Simultaneous physical/gamepad
ownership has not received browser acceptance.

## Browser evidence

[Recorded telemetry](classic-chrome-2026-09-04.json) accompanies screenshots
inspected during this Chrome-control session. Gameplay was entered through
real native menus, not inferred from title-screen demo playback. No native
gameplay commands, cheats or synthetic DOM input were injected.

| Title | Original and Smooth level | Physical firing evidence |
| --- | --- | --- |
| Doom | E1M1 | Pistol ammunition decreases |
| Doom II | MAP01 | Pistol ammunition decreases |
| TNT | MAP01 | Pistol ammunition decreases |
| Plutonia | MAP01 | Pistol ammunition decreases |
| Heretic | E1M1 | Wand ammunition decreases |
| Hexen | MAP01, Fighter | Extended fist animation |
| Chex Quest | E1M1 | Zorch ammunition decreases |

All fourteen cases render their selected world, advance frames, capture on
native New Game, and release capture on Escape into the native menu/pause
state. Original reports approximately 35 Hz; Smooth gameplay reports roughly
117–120 FPS in this viewport. Those are observations, not a strict FPS-cap
test. Mouse turning additionally changes native headings in both profiles for
Doom II, TNT, Plutonia and Chex, plus Original Hexen. The first Original Hexen
fire observation was delayed until player death; a fresh bounded repeat
supersedes it and shows the fist attack while still at 100 health.

All fourteen launches have recorded realtime WebAudio contexts transitioning
from suspended to running at 48 kHz. This verifies browser scheduling, not
audible listening or the owner's output device.

Modernized **single-player DSDA Doom** also passes native menu-to-E1M1 startup,
widescreen rendering, mouse turning/firing, visible menu cursor, Escape
release and resume recapture. A short physical mouse hold selects Options
once. One very brief automated click over New Game was missed; rapid-click
acceptance remains open. The source reads current `SDL_GetMouseState` while
draining button events, a timing-sensitive path worth testing separately.
That is an investigation lead, not a proven root cause or a new native fix.

Modernized **Doom II deathmatch** was rechecked on this image: actual rendered
match, three native players (one browser player and two bots), mouse capture,
pistol firing, Escape menu/release, and advancing native audio callbacks.
Its asynchronous join is still uncaptured until a gameplay click. The earlier
[seven-title Modernized sweep](MODERNIZED-CHROME-2026-09-04.md) remains the
broader evidence; its native engine bytes are unchanged here.

### Limits

Sustained physical keyboard movement, audible listening, fullscreen,
campaigns, save/reload and comprehensive DSDA title coverage remain open.
Automated W pulses measured approximately 1 ms; unchanged coordinates after
those taps cannot establish a broken binding or count as movement acceptance.
Native long-hold movement evidence remains in the preceding startup matrix.
Attack telemetry sampled immediately before pausing can retain the last
gameplay command; those samples are not a button-release acceptance claim.

## Classic deathmatch: confirmed remaining work

Chrome reproduced one player in the Original Doom waiting lobby. The served
adapter requests `-nodes 2`; the managed Chocolate server has zero bots.
Pressing the lobby's advertised Space-to-start action enters a rendered solo
netgame with one native player. Thus the observed wait is distinct from the
repaired startup deadlock. An empty manually started arena does **not** fulfill
the requested automatic match with bots. Classic multiplayer also still starts
with `-nosound -nomusic`, and the manual transition did not capture the pointer.

The current server is a lockstep relay, not a world-simulating bot server.
[Marshmallow Doom](https://github.com/drbelljazz/marshmallow-doom), inspected at
`5e3ad255a67247a74d84fb4dc86133ffc44da42c`, is a useful Doom bot reference but
not a drop-in compatible client: its AI directly changes player/actor state
and relies on other fork-specific gameplay/path logic. It does not supply the
needed Heretic/Hexen integration. No reference code was copied or executed.

The subsequent [native bot prototype](CLASSIC-BOTS-2026-09-05.md) validates
the headless-client direction below; it is not deployed or Chrome-accepted.
At this browser checkpoint, the next implementation work was to evaluate real
headless clients generating
ordinary tic commands against the existing relay, with native world-based
navigation/combat and lifecycle tests. Bot connections must not count as
humans or prevent idle cleanup. This is an unimplemented approach to validate,
not an accepted architecture or a claim that bots are working.

## Deployment and handoff

- Image: `sha256:28359634e0a1412b59a93b7022d0efed8c936c1e0d1074080536767ee04bdc35`.
- Tags: `idtech1-wasm:dev`, `local/idtech1-wasm:all-profile-input-candidate`.
- Container: `f5bce3a532fad70306ff18b7118eba8168f641b657f4b8cae5618daaef5973ad`.
- Served/source adapter SHA-256:
  `edf85514efa0947e03e8cfd940c3ddfab737ec2d3b7f2c6b4a52b474adfad433`.
- Rollback: `local/idtech1-wasm:physical-input-candidate`, image
  `sha256:18f85a41053cd94c8397747bdfb41e19cff15dedccd309e4d4124aa3c738ae42`.

Of 40 audited regular site files, only `game-adapter.js` changed. All engine,
framework, audio and server artifacts are inherited unchanged. All 31 other
lab container IDs remain unchanged; pre/post and final lab image audits pass.
Owner WADs, binds and saves are unchanged. Browser gameplay used no new saves.
The test match was disconnected and Chrome left at the launcher with no
browser audio observer active. The managed server has zero humans/relay peers
and retains its normal five-minute idle timeout.

Dockerfile, inventories, hashes, full static log and the read-only bot reference
are retained under `/tmp/idtech1-classic-chrome.yLvw8k`. Changes are local and
uncommitted. Blood reproduction stays deferred at the user's request; the
user-confirmed RTCW renderer was not touched.
