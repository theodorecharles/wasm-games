# Counter-Strike Chrome checkpoint — 2026-09-05

The September 4 frontend now has actual Chrome join/render evidence. A new
local candidate also repairs explicit-server fallback. This is not full
controls/audio acceptance or a fix for the historical `MAX_MODELS` cause.

## Actual live-host join

Chrome opened `http://127.0.0.1:8017/?game=counter-strike`, entered
`ChromeCSProof`, pressed Play, and clicked the native Join Game button. No
engine commands or hidden browser globals were used to launch the match.

- [World capture](counter-strike-live-join-2026-09-05.jpg) and
  [DOM/loading log](counter-strike-live-join-2026-09-05.json): textured Dust II,
  visible bot models and team selection, native gameplay/server identity.
- Real `5` key presses selected a team and appearance. Chrome visibly reached
  first-person pistol/HUD with 100 health and an allied bot. This observation
  is in the browser-control session; the later saved resume-attempt image is
  **not** a first-person spawn capture.
- [Native status](counter-strike-live-status-2026-09-05.json) and
  [console capture](counter-strike-live-status-2026-09-05.jpg): authoritative
  `de_dust2`, nine `Bot` rows and the separate named `ChromeCSProof` row.
  Bot kill messages continue. Native `players: 1 active` counts the human;
  it does not contradict the nine explicit bot rows.
- [Escape menu](counter-strike-live-pause-2026-09-05.jpg) and
  [resume attempt](counter-strike-live-resume-attempt-2026-09-05.jpg): Escape
  reaches native paused state. The resume click did not establish sustained
  captured gameplay; the saved follow-up still reports paused.
- [Normal disconnect](counter-strike-live-disconnect-2026-09-05.json), followed
  by navigation away. The live host was not stopped or fault-injected.

The browser log contains a recoverable `filesystem_stdio.wasm` synchronous
loading error, `GL_INVALID_ENUM` for `*default`, and invalid decal textures.
Reaching the map does not resolve those warnings. Native menu screenshots
also expose irrelevant Hazard course, Save/load and Custom game controls, plus
the minimize control; the CS-specific menu patch currently retains them.

## Explicit endpoint repair

`WebRtcXash.connectWithFallback()` previously retried the default local bridge
even when `?server=` explicitly selected another host. That silently changes
the player's destination on a failure. The new guard preserves an explicit
nonempty server selection and propagates its original error. Only the implicit
same-origin endpoint retains development fallback to port 4192. An empty
`server=` retains the existing parser's default-endpoint meaning.

The [27-case actual-method regression](counter-strike-endpoint-policy-2026-09-05.json)
covers success, first failure and both failures across implicit, local,
same-origin-explicit, remote and secure endpoints, including Half-Life's
optional network path. Before the change it failed an explicit-server case.
Its built-in negative control removes only the new guard and reproduces that
failure. The full four-variant package/adapter/host suite also passes.

Actual Chrome comparison, with the isolated selected host stopped throughout:

- [Old client](counter-strike-explicit-old-2026-09-05.json) reaches the
  [native menu](counter-strike-explicit-old-2026-09-05.jpg) anyway via fallback.
  This establishes the wrong fallback connection, not an additional wrong-host
  gameplay join; Join Game was not pressed in this negative control.
- [Repaired client](counter-strike-explicit-fixed-2026-09-05.json) stays at the
  [launcher with the selected 4392 endpoint's error](counter-strike-explicit-fixed-2026-09-05.jpg).

## Isolated restart and retry

An unmounted, separately named host used signaling 4392 and WebRTC 4391,
with four bots and the unchanged recovered native host image. Its initial
[Chrome roster](counter-strike-isolated-before-restart-2026-09-05.json)
contains `ChromeCSReconnect` and four bots. Stopping only this container
produced native [Server shutdown/menu state](counter-strike-isolated-shutdown-2026-09-05.json).

The repaired client was then opened on the separate candidate frontend while
that host was still stopped. After its expected endpoint error, the isolated
host was started again. Pressing Play on the **same failed launcher page**, then
native Join Game, established a new connection to the restarted host:

- [World image](counter-strike-candidate-rejoin-world-2026-09-05.jpg) and
  [DOM/loading log](counter-strike-candidate-rejoin-world-2026-09-05.json)
  establish textured Dust II and gameplay/server identity.
- Native team and appearance selection again reached first-person pistol/HUD.
  By the separate saved screenshot, a bot was killing the player; the
  [combat/death capture](counter-strike-candidate-combat-death-2026-09-05.jpg)
  is accurately labeled and is not presented as a first-person spawn still.
- [Native status/log](counter-strike-candidate-rejoin-status-2026-09-05.json)
  records four bots, `ChromeCSEndpoint`, `de_dust2`, and
  `pyr0` killing the named human with a Galil. The status's four bot rows also
  distinguish this restarted isolated host from the nine-bot live host.
- [Normal disconnect](counter-strike-candidate-disconnect-2026-09-05.json)
  returned to menu; the tab was navigated to `about:blank`.

[Combined acceptance record](counter-strike-chrome-acceptance-2026-09-05.json)
checks those saved records, changed isolated process start times, and unchanged
live container IDs/start times. The isolated native host is now stopped and
retained for inspection; the lightweight candidate frontend remains available.
No test container or owner data was deleted.

This verifies a fresh connection after restart and a retry after failed
launcher initialization. It does **not** verify automatic recovery of an
already-running engine's closed WebRTC transport. No host error was injected
in this Chrome pass, so the native fault-injection evidence remains the
separate September 4 test. Sustained captured controls/mouse look, audible
Chrome playback, extended play, menu cleanup, DLL/GL/decal warnings and the
original `MAX_MODELS` initiating cause remain open. Historical accelerated
HL/Blue Shift/Opposing Force intro reports still need current normal Chrome
startup and mouse-look acceptance.

## Package identity and reproduction

Candidate `local/goldsource-wasm:explicit-endpoint-candidate`:
`sha256:aacaaaf2ed3c6fa03eb496824e06f1b071aaf8cdcf607288bb915e02da5fd8de`.
Adapter source: `e478feb0d2f1f3e696f2aba5b52c3c21bdad78e18693cadf72fd26c5e9a8e8d1`.
Served bundle: `269e9b1b30396ed3b4891f6704f38ab2e1817215946821919e395f1c6719708b`.

[Read-only package comparison](counter-strike-endpoint-package-2026-09-05.json)
verifies all 13 native/support artifacts against both staging and the preceding
live frontend; all are byte-identical. Framework JS/bootstrap/CSS, game config
and owner-data manifest are unchanged. The new adapter is served exactly,
the canonical root loads, and direct `/data` URLs return 404.

The test frontend is `cs-endpoint-chrome-proof-20260905`, at
`http://127.0.0.1:32926`, with read-only owner data and root filesystem. No
registry push, framework release, live-service replacement or owner-data
change was performed.

```sh
cd goldsource-wasm
npm run build:web
npm test
CS_ENDPOINT_ORIGIN=http://127.0.0.1:32926 \
CS_PREVIOUS_ORIGIN=http://127.0.0.1:8017 \
  node scripts/test-cs-endpoint-package.mjs
```

Build the separate development candidate with the same retained framework
base as the accepted September 4 image:

```sh
WASM_GAME_FRAMEWORK_IMAGE=local/wasm-game-framework:console-selection-candidate \
  /home/ted/Development/wasm-game-framework/scripts/build-static-image.sh \
  /home/ted/Development/wasm-games/goldsource-wasm/web \
  local/goldsource-wasm:explicit-endpoint-candidate suite
```

The build command uses absolute paths. The framework base is
`sha256:f3fa58cebbf13d2a47f7926754749859f0e2b0c523058a226a7656a476395c4e`;
no base/native rebuild was needed for this JavaScript-only policy repair.
