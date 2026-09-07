# id Tech 4 resume runbook

Current checkpoint index: 2026-09-07. The original 2026-08-21 stopping-point
notes below are historical; do not use their shutdown/blocker statements as
the current runtime state.

- **2026-09-07 09:28UTC — normal Game Lab and private Trashcan promoted.**
  All six current repaired images now run on normal8086/18086/18087/8084/18084/
  8087 and private28129–28134. Native engine/save/audio/bot bytes are unchanged
  from the current pinned repaired builds, not the older running lab containers
  they replaced. The checked `scripts/public-path-runtime.mjs` overlay supplies
  prefixed worker/data/framework/bot/module/WS URLs while retaining native paths.
  Single-player Doom3/RoE cannot wake/join managed multiplayer; unknown WebSocket
  paths reject.58 isolated managed tests and actual private native info/challenge
  replies/two bots pass. Both local/private matches are asleep again. Exact
  identities and all receipts are in sibling Game Lab `deploy/steam/idtech4-*.json`;
  see the latest [migration checkpoint](../VM-RETIREMENT-RUNBOOK.md).
  Current canonical adapter and all actual images pass profile/input/prefix
  fixtures; historical `build/site` was deliberately not overwritten and still
  fails the known old dropped-modifier regression. Ordinary source-only staging
  now explicitly requires the newer shared publicUrl framework; its release/pin
  repair remains open. Historical candidate locks remain intact. No browser
  gameplay, capture/fullscreen or save/reload/load claim for these new origins;
  Steam's launch gate remains closed. Public proxies/VMs/Picard unchanged.

- [Prey quickload prompt and save/map lifecycle](proofs/PREY-QUICKLOAD-2026-09-06.md):
  current isolated **32877** is now `prey-quickload-proof-20260906`, image
  `41d07774c9a0e43859437cc9278dc7bd035e6b0c0cc3219da34259a218e63685`.
  Canonical source fixes the blank F9 confirmation key; actual Chrome verifies
  the label, timeout, newest quicksave position, older second-map autosave and
  cross-map quickload/pause/resume/quit. Baseline additionally creates distinct
  quicksaves and diagnostically triggers the native next-map path (not normal
  campaign progression). Thirty-nine Chrome pairs/88 hashes, 26 prompt cases
  and 14 expected negative failures pass; ownership regression stays green.
  Only native JS/Wasm changed, 45 installed files unchanged. New package audit
  is `test-prey-quickload-package.mjs`; old trace package pins are historical,
  while its retained evidence audit still passes. Trace container/image retained
  stopped, six saves retained, owned tab blank. No live changes. Held controls,
  capture/fullscreen/listening, normal campaign and ring-wrap/promotion remain
  open; RTCW SP protected and Blood deferred.

- [Prey trace-cache ownership repair](proofs/PREY-TRACE-CACHE-2026-09-06.md):
  canonical source and rebuilt isolated **32877** now fix the warning from the
  [earlier save checkpoint](proofs/PREY-SAVES-2026-09-06.md). Chrome completes five
  native loads and two quits with zero trace-cache warnings. Both old saves
  load; distinct `prey906b` survives full page reload with its preview and exact
  position, and reloading `prey906a` restores the different original position.
  Twenty-eight Chrome pairs/65 hashes, 22 repaired native/Wasm cases and 18
  expected failing old-call cases pass. Exact source/package checks pass; only
  Wasm and the existing Ctrl/Alt adapter fix changed, with 45 files unchanged.
  Chrome verifies both modifier pairs. New `prey-trace-cache-proof-20260906`
  replaces the old isolated container on its save origin; old container/image
  retained stopped. Live Prey and RTCW SP untouched, Blood deferred. Owned tab
  blank, three saves retained. Capture/held controls/listening, quickload/map
  transitions and broader campaign/promotion gates remain open.

- [Quake 4 Ctrl/Alt integration](proofs/QUAKE4-INPUT-2026-09-06.md): isolated
  **32962** now installs the existing source fix; only the adapter changes and
  46 other installed files remain identical to 32961. All six packaged variants
  and 402 source cases pass; old-adapter controls fail. Chrome reproduces the
  old dropped presses, verifies matched new Ctrl/Alt edges, and completes the
  native Continue gate with Ctrl alone. World/pause/resume/quit and ten retained
  pairs/26 hashes pass. Pointer lock is still denied; held controls/listening
  remain open. Both comparison tabs are blank. No live promotion or combined
  staging; old 32961 and its saves are unchanged. The later Prey checkpoint
  above fixes the native cleanup regression and integrates the same modifier
  fix into that isolated package. RTCW SP untouched; Blood deferred.

- [Quake 4 current-renderer saves](proofs/QUAKE4-SAVES-2026-09-06.md): unchanged
  **32961** passes native named save/full reload/load, persisted correct preview,
  exact printed-position restoration after a native-console teleport, and normal
  pause/resume/quit. Nineteen Chrome pairs/40 hashes and before/after package
  audits pass. Eight W taps did not move the player; capture/listening/held
  controls remain open. The tab is blank and `q4quad906a` is retained, with no
  overwritten saves or live changes. The later input checkpoint above closes
  the discovered Ctrl/Alt integration gap in a separate 32962 package; 32961
  and the older combined staging retain their original adapters. Do not alter
  the immutable quad evidence.

- [Quake 4 sampling-gate correction](proofs/QUAKE4-LOD-2026-09-06.md): portable
  packaging validation now uses independent CPU sampling plus unchanged native
  same-footprint gates; 46,464 GL/GLES channels pass at the original tolerance.
  The nine software vendor-exact differences are explained by a native-only
  quad-LOD/fast-log model, not repaired by changing game rendering. Old scripts
  keep their raw failure; current packaging calls `test-q4-border-validation.mjs`.
  Engine/source/image identity and prior 32961 Chrome proof remain unchanged.

- [Quake 4 immediate-buffer repair](proofs/QUAKE4-QUAD-2026-09-06.md): canonical
  source/build now include the SDK CPU-quad/VBO isolation repair and correct
  WebGL GLSL-vs-ARB rescue policy. Isolated **32961** runs
  `q4-quad-proof-20260906`, image
  `fc651e2b5697e8605f53566d1e1d67b600e09d3c7166a51d3292cabc519d932a`.
  Six SDK/1,280 policy cases and negative controls pass; both join the normal
  build. Exact current source/build/package checks use `test-q4-quad-package.mjs`;
  older package scripts intentionally pin earlier trees and are superseded for
  current-source audits. Their runtime inventories and retained evidence remain
  unchanged. Chrome shows clean geometry and correct explicit fullscreen-scene
  brightness; restoration reproduces the exact original frozen screenshot.
  Natural intro, first-person pistol/HUD/world, native pause/resume and normal
  quit pass; the owned test tab is blank. Ten retained Chrome pairs/27 hashes
  pass the new evidence audit. See the checkpoint for remaining gates. No live
  promotion or combined-site restaging. RTCW SP untouched; Blood deferred.

- [V8 saved trace-cache ownership](proofs/D3-TRACE-CACHE-2026-09-06.md): exact
  local image `3298bacc93ff78339f24e005be1839857bc46ad89d83544c7adcf5ca3e11cac3`
  fixes the reproduced post-load cleanup warning in both campaigns. The two
  owned v7 campaign containers were stopped, not deleted; current **32953/32954**
  run `d3-sp-v8-trace-proof-20260906` / `d3-roe-v8-trace-proof-20260906` on their
  original browser-save origins. Actual Chrome loads each v7 save twice, then
  creates distinct v8 saves and restores them after full page reload. Original
  positions, previews, health/ammo, pause/resume and native quit pass with zero
  trace-cache warnings. All 44 native/Wasm cases, expected failing old-call
  controls, exact source/package audits and 47 lifecycle checks pass. Final
  supervisors are asleep with no native child/session or relay traffic; all
  four owned tabs are blank. Live Doom 3 SP/MP and RTCW SP retain their images,
  start times and zero restarts. No staging/promotion/push. Full campaigns,
  transitions/quickload, arbitrary old saves, held controls/capture and listening
  remain open. RTCW SP untouched and Blood deferred.
- [V7 campaign/save regression](proofs/D3-CAMPAIGN-SAVES-2026-09-06.md): exact
  uninstrumented v7 originally on isolated **32953/32954** runs both native campaign intros
  to first-map gameplay. Named native saves survive full page reload with their
  previews; actual SaveGame loads restore gameplay, health/ammo and the original
  printed positions after a measured input displacement. Pause/Return to Game,
  package/HTTP hashes, persistence serialization and retained Chrome evidence
  pass. Both supervisors remain asleep with no native child/session or relay
  traffic. Normal native campaign exits return intact main menus; all four owned
  tabs were left blank. Both exits log an uncached trace-model warning after the
  second save load; the v8 checkpoint above fixes that ownership path and
  supersedes these containers' runtime state. No engine/release/live change in
  the original v7 checkpoint. Full campaigns, older-save migration,
  held controls/capture and audible quality remain open; basic first-map saves
  are no longer an unknown gate. RTCW SP untouched and Blood deferred.
- [Delta sound-clock regression](proofs/D3-LIGHT-CLOCK-2026-09-06.md): isolated
  repaired/legacy diagnostics on **32951/32952** reproduce the old roundtrip
  blackout and verify the existing v7 mixer repair. A living exact-camera
  amplitude switch produces lit→black→lit; an independent old-mixer build
  reaches zero native amplitudes after Delta→Tomiko→Delta without overrides.
  The repaired roundtrip keeps lighting and clock advancement. All source,
  package, camera/health and lifecycle evidence checks pass. Both diagnostics
  are naturally sleeping after native disconnect; all owned tabs are blank.
  They are **not release images**. Their source checkout is retained in legacy
  form; production v7 artifacts, live services and shaders remain unchanged.
  Full-map/control/listening and broader campaign gates still precede promotion;
  the newer first-map save checkpoint above narrows SP/RoE regression.
- [Doom 3 MP inline mixer](proofs/D3-MP-AUDIO-2026-09-06.md): local **v7** on
  **32950**, image `a7afa362d4012ae13b7bb1b81b99287e8f4d12ae24a4d5b7431ca17f4a260007`.
  Active network frames skipped the mode-0 mixer, leaving playback at zero;
  native disconnect immediately resumed sounds in v6. V7 fixes the MP branch
  only, with exact native/Wasm positive/negative regression and 47 packaged
  checks. Chrome playback advances through Delta→Tomiko and native reconnect.
  The frozen sound clock also feeds sound-driven lighting; the newer checkpoint
  above verifies the Delta regression, not full rendering or audible quality. Production
  services/staging and older images are unchanged. See the checkpoint for
  lifecycle observations and remaining promotion gates.
  Final native disconnect and natural idle are confirmed: **v6 and v7 are
  sleeping**, with no native child/session, and all four owned Chrome tabs are
  `about:blank`.
- [Physical Ctrl/Alt fix](proofs/IDTECH4-MODIFIER-KEYS-2026-09-05.md):
  preceding local **v6** on **32925**, image `729fd8035b80280ace9c9c29cb71ec3649820f20deee190f42e717f8cc26dfc5`.
  The shared adapter no longer discards a physical modifier's own press.
  All 402 new cases across six variants pass; restoring the old guard fails.
  Actual Chrome delivers Ctrl/Alt down/up, and Ctrl changes native spectator
  follow using the unchanged `_attack` binding. All 47 packaged checks and
  nine image-file hashes pass; engine/renderer artifacts remain v5-identical.
  Normal play/binding restoration, native disconnect and natural idle are
  confirmed; v6 is sleeping with no child/session and its tab is `about:blank`.
- [Delta direct/roundtrip diagnostic](proofs/D3-DELTA-DIAGNOSTIC-2026-09-05.md):
  unchanged v5 on **32920** renders a textured fresh d3dm2 load; real UI votes
  d3dm2→d3dm1→d3dm2 retain correct native/API maps and healthy bots. Dark return
  views remain camera/death-confounded. Local death fade and raised free
  spectator views are not proof of missing lighting. Further automatic maps
  and a real followed-player comparison are recorded, not full visual acceptance.
  All temporary settings/bindings restored, both clients disconnected and
  natural idle leaves no native child/session. No speculative renderer fix.
- [SABot voting fix](proofs/D3-SABOT-VOTING-2026-09-05.md): v4 on **32912**
  excludes non-voting bots from the human majority. Exact native/Wasm sanitizer
  fixtures reproduce the old failure and pass the repair; fresh source, both
  game builds and all 47 packaged lifecycle checks pass. Real Chrome's native
  map vote passes and rejoins Delta Lab with both bots; post-transition world
  rendering is still largely dark/missing. V4's stale API map reporting is
  reproduced and fixed in v5 on **32917** (40 method cases and 47 packaged
  checks pass). Real Chrome confirms v5 API/native map agreement after another
  vote, same server process and healthy human/bots. V4/v5 are naturally sleeping
  after normal disconnects, with no native child/session. Both test tabs
  are `about:blank`. Temporary shadow/spectator diagnostics were restored.
  The newer direct-load comparison above supersedes that next-step note;
  controlled same-camera Delta rendering acceptance remains open.
- [Managed Doom 3 Chrome proof](proofs/D3-MANAGED-CHROME-2026-09-05.md): two
  human clients, disconnect, idle shutdown and rejoin; isolated candidate on
  port 32885, live lab services unchanged.
- [SABot automatic population](proofs/D3-SABOT-POPULATION-2026-09-05.md): v3
  self-contained candidate on **32907**, eight real Chrome clients in gameplay,
  native bot counts 2→1→0 at six/seven/eight humans. Exact snapshot and population
  methods pass native/Wasm sanitizer fixtures, the automatic five-map native
  cycle passes without `addBots`, and all 47 packaged lifecycle checks pass.
  Normal departures restore one/two bots. All eight tabs are now `about:blank`;
  natural idle cleanup leaves no native child/session. A later map-vote attempt
  is incomplete after blank screenshots; consult the newer checkpoint for
  exact evidence and remaining gates. The v4 voting fix above is separate;
  the immutable v3 image does not contain that later change.
- [SABot browser/package checkpoint](proofs/D3-SABOT-BROWSER-2026-09-05.md):
  matching Wasm/native bots coexist with two real Chrome humans; bot kills and
  42 packaged lifecycle checks pass. Self-contained local candidate on port
  32898; do not use the failed initial `doom3-sabot-candidate` image tag.
  Both packaged Chrome clients disconnected cleanly; natural idle cleanup
  removed the native child/session. The two test tabs are now `about:blank`.
  Its capacity/refill and malformed-fixture gaps are superseded by the newer
  population checkpoint. Full controls/visuals, actual malformed-packet browser
  recovery and fresh SP/RoE regression remain before production promotion.
- [SABot native prototype](proofs/D3-SABOT-NATIVE-2026-09-05.md): all five stock
  maps navigated, actual kills/score/respawn and explicit map-cycle evidence.
- [Latest proof index](proofs/README.md) and
  [workspace fix list](../GAME-LAB-FIX-TODO.md) supersede older Prey/Quake 4
  blockers and identify the remaining acceptance gates.

This is the exact stopping point after the Doom 3 d3wasm conversion work. Do
not restart the discarded custom dhewm3/WebGL2 renderer lane. The canonical
engine is the pinned d3wasm GLES2/WebGL 1 source plus the verified patch queue.

## Shutdown state

- `wasm-doom3` is stopped.
- `wasm-doom3-mp` is stopped.
- `d3wasm-build-session` is stopped.
- The Chrome proof tab is closed or was already absent.
- Other Game Lab services were left alone.
- Nothing from this checkpoint was committed or pushed; the worktrees contain
  unrelated earlier work and must not be staged wholesale.

## What is actually proven

- The source mirror and all id Tech 4 patches reconstruct exact trees.
- Final Doom 3 and RoE d3wasm targets clean-build, and the staged six-variant
  package passes memory, renderer, adapter, worker, and package contracts.
- Chrome mounted all nine retail Doom 3 PK4s and initialized WebGL 1/GLES2,
  the GLSL renderer, the WebAudio/OpenAL bridge, and the base game.
- `game/mars_city1` reached native `gameplay` state. Real W-key events moved
  the native player from `(1239.05 -1501 68.25)` to
  `(1210.63 -1501 68.25)`, then to `(1177.56 -1501 68.25)`.
- Backquote opened the console and closed it back to native gameplay state.
- `doom3_formal_proof` saved and loaded in the same session; load restored the
  exact saved position `(1210.63 -1501 68.25) 180.0`.
- Audio was `running` with 197 buffers, 256 sources, and 27,786 starts at the
  formal checkpoint.
- Formal mouse input is not proven by automation because automated Chrome
  clicks could not grant pointer lock. Ted's manual mouse/capture behavior is
  user-tested, but keep the product status at **Still in development**.

The authoritative evidence is `proofs/d3wasm-checkpoint.json`.

## Persistence bug and exact stopping point

The first restart exposed that same-session saves were not durable. The old
game-code `FS.syncfs` ran before the outer session closed the save, screenshot,
and description files. A new final session hook now calls the framework-owned
`idtech4PersistenceSave()` only after every save file is closed, and the old
premature sync was removed.

Two older cross-reload saves failed and must not be used as evidence:

- `doom3_formal_proof`: created before the final flush existed.
- `doom3_persistence_fixed`: created while the old early sync still raced the
  new final sync; Chrome reported two `FS.syncfs` operations in flight.

The final build wrote `doom3_final_persist` without that overlap warning. The
page was restarted, but the user stopped the run before its post-restart load
could be checked. Its durability is therefore **unknown**, not passed or
failed. This is the shortest next test; do not repeat the long campaign proof.

## Resume commands

Start from the repository:

```sh
cd /home/ted/Development/wasm-games/idtech4-wasm
./scripts/apply-patches.sh
```

The final compiled and staged artifacts already exist. Rebuild only if source
or patches changed:

```sh
docker start d3wasm-build-session
docker exec -w /src/idtech4-wasm d3wasm-build-session sh -lc \
  'cmake --build .work/d3wasm/build-wasm --parallel 4 && cmake --build .work/d3wasm/build-wasm-roe --parallel 4'
./scripts/stage-site.sh
```

Recreate the final Doom 3 image only when staging changed:

```sh
WASM_GAME_FRAMEWORK_IMAGE=wasm-game-framework:0.9.6 \
  ./.work/wasm-game-framework/scripts/build-static-image.sh \
  ./build/site local/idtech4-wasm:doom3-dev doom3
```

Start only Doom 3:

```sh
cd /home/ted/Development/wasm-game-lab
docker compose up -d --force-recreate doom3
```

Open `http://127.0.0.1:8086/?proof=doom3-final-persist-resume`, click **Play**,
wait for the native menu, open the console with backquote, and run:

```text
loadgame doom3_final_persist
```

- If it reaches `testmaps/test_box` gameplay, record cross-reload persistence
  as passed in `proofs/d3wasm-checkpoint.json`.
- If the save is missing, add start/success/failure messages around
  `idtech4PersistenceSave` in `site/d3-worker.js`, rebuild only the site/image,
  create a new save in `testmaps/test_box`, and repeat one restart. Do not use
  either older failed save.
- For the remaining mouse gate, use one manual Chrome click to obtain pointer
  lock, move the mouse, click/release once, and verify the proof counters plus
  native view-position change. Browser automation alone could not grant the
  lock.

When finished, stop the two disposable services again if desired:

```sh
docker stop wasm-doom3 d3wasm-build-session
```

## Continue the broader id Tech 4 objective

Only after Doom 3 cross-reload persistence and one pointer-lock mouse pass:

1. Run the equivalent menu/gameplay/input/audio/save proof for RoE.
2. Prove Doom 3 multiplayer connection and gameplay; investigate bots only
   after the connection path works.
3. Retest Quake 4 SP/MP and then Prey. Prey remains blocked on black sustained
   gameplay after a complete Roadhouse load.
4. Keep every roster entry at **Still in development** until its own proof is
   complete.

## Validation and publication

After any changes:

```sh
cd /home/ted/Development/wasm-games/idtech4-wasm
./scripts/stage-site.sh
cd /home/ted/Development/wasm-games
node ./scripts/validate-layout.mjs
cd /home/ted/Development/wasm-game-lab
./validate.sh --images
```

Do not run `git add -A`. Both repositories contain broad mixed work. Review
and stage only the intended files. Do not push the parent repositories until
the larger user-requested game-family work is actually complete.
