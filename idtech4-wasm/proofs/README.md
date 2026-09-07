# id Tech 4 browser checkpoints

These records separate browser-observed runtime milestones from compile and
static-contract results. They do not mark a game playable unless its proof says
so explicitly.

- [Prey quickload prompt and save/map lifecycle](PREY-QUICKLOAD-2026-09-06.md):
  canonical source and current isolated 32877 fix the blank F9 key. Chrome
  verifies the label/timeout, newest saved position, old second-map autosave,
  cross-map quickload and pause/resume/quit. Baseline also creates two distinct
  quicksaves and diagnostically triggers the next-map path, not normal campaign
  progression. Thirty-nine pairs/88 hashes, seven native save loads and two
  clean quits; 26 prompt regression cases/14 expected negative failures pass.
  Only native JS/Wasm changed; 45 files unchanged, trace repair retained.
  Previous trace container is now stopped, not deleted; six saves retained and
  tab blank. No live change or held/capture/listening/full-campaign acceptance.

- [Prey trace-cache repair](PREY-TRACE-CACHE-2026-09-06.md): canonical source
  and rebuilt isolated 32877 fix the [earlier cleanup regression](PREY-SAVES-2026-09-06.md).
  Five Chrome native loads and two quits have zero trace-cache warnings. Old
  saves load; new `prey906b`/preview survive full reload with the distinct saved
  position, and the old slot restores its original position. Twenty-eight
  pairs/65 hashes, 22 repaired native/Wasm cases and 18 expected old-call
  failures pass. Only Wasm/adapter changed; 45 files unchanged and six packaged
  variants pass. Chrome also verifies current Ctrl/Alt pairs. Old isolated
  container retained stopped, three saves retained, tab blank. No live change;
  campaign/held controls/capture/listening/promotion gates remain open.

- [Quake 4 Ctrl/Alt integration](QUAKE4-INPUT-2026-09-06.md): adapter-only
  isolated 32962 passes all six packaged variants, with 46 other installed
  files unchanged. Chrome reproduces old dropped presses, verifies new matched
  Ctrl/Alt pairs and completes native Continue with Ctrl alone. World/pause/
  resume/quit and ten pairs/26 hashes pass. Capture is still denied; held
  controls/listening remain open. Old 32961/saves, combined staging and live
  services stay unchanged; both comparison tabs are blank.

- [Quake 4 current-renderer saves](QUAKE4-SAVES-2026-09-06.md): unchanged 32961
  passes named save/full reload/native load, persistent correct preview, exact
  saved-position restoration after a native-console teleport, and pause/resume/
  quit. Nineteen Chrome pairs/40 hashes pass. Short W taps did not establish
  movement; held controls/capture/listening stay open. The later input checkpoint
  closes the discovered Ctrl/Alt integration gap in a separate 32962 package.
  No live change; named save retained and owned tab blank.

- [Quake 4 sampling-gate correction](QUAKE4-LOD-2026-09-06.md): native-only
  probes explain software's nine differences through quad LOD/fast log; the
  independent CPU contract passes 46,464 GL/GLES channels on three drivers and
  rejects broken mip/edge samplers. Packaging requires that contract plus the
  unchanged same-footprint native gates. Raw vendor failures and the one-channel
  tolerance are preserved; no renderer/artifact/live change or new Chrome claim.

- [Quake 4 immediate-buffer repair](QUAKE4-QUAD-2026-09-06.md): canonical SDK
  CPU-stream/binding isolation and WebGL rescue-floor policy fixed; isolated
  32961 rebuilt and exact-package verified. Chrome shows clean intro geometry;
  explicit brightness covers the whole frozen scene, and restoring defaults
  restores its byte-identical screenshot. The natural intro reaches first-person
  pistol/HUD/world gameplay and native pause/resume passes. Six SDK/1,280 policy cases and old-code
  negative controls pass; both regressions join the normal build. No live promotion;
  broader renderer/campaign/control gates remain open.

- [Quake 4 intro gray polygons](QUAKE4-INTRO-2026-09-06.md): historical diagnosis,
  superseded by the integration checkpoint above. Reproduced before
  the mip-size change. Exact frozen Chrome comparisons isolate the decal pass,
  not overlays/fog/new ambient. Actual GPU tracing finds the following
  brightness quad reading a character VBO instead of its CPU vertices. Four
  old SDK failures reproduce and six candidate transitions pass. Original
  diagnostic evidence and runtime packages remain unchanged.

- [Quake 4 per-fragment mip sizes](QUAKE4-BORDER-SIZE-2026-09-06.md): old
  llvmpipe's varying texture-size query caused the large sampling discrepancy.
  An independent probe reproduces it; base-size derivation fixes all 4,096
  same-footprint comparisons on each of llvmpipe and AMD. Only the serialized
  shader helper changes in the isolated 32957 package. All shipped shader pairs
  compile; nine smaller implicit-filter differences still fail the strict gate.
  Chrome reaches first-person world/pistol/HUD through the natural intro and
  pauses/resumes; the subsequent quad checkpoint repairs the gray intro polygons. No live
  promotion or full renderer/control acceptance.

- [V8 saved trace-cache ownership](D3-TRACE-CACHE-2026-09-06.md): both canonical
  campaign patches fix the post-load cleanup warning without changing save
  serialization. All 44 native/Wasm cases and expected old-call failures pass;
  exact source/build/package audits and 47 lifecycle checks pass. Chrome loads
  original v7 saves twice, creates distinct v8 saves, restores them after full
  reload, resumes and quits with zero trace warnings. Eighteen retained stages
  per campaign pass. Isolated 32953/32954 now run v8; the two preceding v7
  campaign containers are stopped, not deleted. No live deployment or full
  campaign/control/listening acceptance.

- [V7 campaign/save regression](D3-CAMPAIGN-SAVES-2026-09-06.md): exact v7 on
  isolated 32953/32954 passes native SP/RoE intros, first-map gameplay, named
  save/full-page reload/load, changed-position restoration and pause/resume
  in Chrome. Package/HTTP and queue/evidence checks pass; no MP wake or live
  deployment. Full campaigns, sustained controls/capture and listening remain.

- [Delta sound-clock regression](D3-LIGHT-CLOCK-2026-09-06.md): test-only
  repaired/legacy builds reproduce frozen zero-amplitude post-vote lighting
  and verify the existing v7 mixer repair. Native camera/health telemetry
  supports a living lit→zero→lit comparison and both map roundtrips. Package,
  source, positive/negative mixer and evidence checks pass; both services
  naturally idle. No shader or release-artifact change, deployment or full-map pass.

- [Doom 3 MP sound mixer](D3-MP-AUDIO-2026-09-06.md): v6 had zero browser
  playback starts in multiplayer but started sounds after disconnect. The
  network frame skipped the default inline mixer. V7 on 32950 restores that
  call, passes native/Wasm positive and negative regressions plus 47 packaged
  checks, and Chrome playback advances through map vote and native reconnect.
  The later lighting checkpoint verifies the Delta lead, not full visual acceptance.
  Live services remain unchanged; listening and wider release gates remain.

- [Physical Ctrl/Alt](IDTECH4-MODIFIER-KEYS-2026-09-05.md): 402 new actual-adapter
  cases across six variants, a failing old-guard negative control, v6 local
  package with nine verified files and all 47 lifecycle checks. Real Chrome
  delivers both modifier edges; Ctrl invokes native spectator follow without
  rebinding. Native held input and complete game acceptance remain separate.

- [Delta direct/roundtrip diagnostic](D3-DELTA-DIAGNOSTIC-2026-09-05.md): same
  v5 renderer/assets, textured direct d3dm2 load and real voted roundtrip with
  correct native/API state. Camera/respawn and intentional local death fade
  confound the dark views; no speculative renderer change or full-map pass.
  Temporary settings/bindings restored, normal disconnect and natural idle pass.

- `D3-SABOT-VOTING-2026-09-05.md` fixes bots incorrectly preventing a human
  voting majority. Actual native/Wasm vote methods pass 16,258 checks each,
  non-bot behavior is preserved, and the exact old methods fail the negative
  control. Fresh sources, both game builds and 47 packaged v4 lifecycle checks
  pass. Real Chrome voting/new-map join succeeds on 32912, but Delta Lab's
  rendering remains largely dark/missing. The stale managed API map field is
  reproduced and fixed in v5 on 32917; 40 method/47 package checks and actual
  Chrome-voted API/native map agreement pass. V3's blank view and Delta Lab's
  broader rendering remain undiagnosed. Temporary diagnostics are restored.

- `D3-SABOT-POPULATION-2026-09-05.md` adds automatic capacity/refill, exact
  native/Wasm snapshot and population sanitizer tests, a real automatic
  five-map cycle with no explicit `addBots`, and 47 packaged v3 checks. Eight
  real Chrome clients reach gameplay; bot targets/counts are 2/1/0 with 6/7/8
  humans; normal departures restore one/two bots. Candidate port 32907; earlier
  v2 evidence and production/live services are unchanged.

- `D3-SABOT-BROWSER-2026-09-05.md` adds the matching 144-class Wasm port,
  two real Chrome humans with two bots, native/browser bot-on-bot and bot-on-human
  kills, and a self-contained isolated candidate on port 32898. Forty-two
  packaged bot/lifecycle checks, bounded actual telemetry and MP-only asset
  validation pass. Source reproduction and packaging patches are durable;
  the first silently skipped packaging patch is retained as failed evidence.
  The newer population checkpoint supersedes capacity and malformed-fixture
  gaps; full input/visual, browser malformed-packet recovery and SP/RoE
  regression remain open. Production/live services are unchanged.

- `D3-SABOT-NATIVE-2026-09-05.md` records an isolated pinned SABot port:
  two native bots navigate all five stock DM maps and survive match-start
  restarts; actual kills/scores are observed on three maps and respawning in
  the long run. Spawn-order, AI recreation and navigation-ownership fixes
  have a reproducible source patch. This is not browser acceptance and does
  not alter the accepted human-only managed candidate or production package.

- `D3-MANAGED-CHROME-2026-09-05.md` wires managed readiness, provisioning,
  password gates, idle lifecycle and native server packaging into normal MP
  Play. Restoring a missing native class fixes the first-snapshot player-as-AI
  crash; two Chrome clients join and native reconnect succeeds. Disconnect
  cleanup and overlapping native save syncs are repaired with negative controls.
  Final Chrome verifies both players, one-at-a-time disconnect cleanup, actual
  idle sleep and successful rejoin after waking a new native process. No
  overlapping save-sync warning remains in either final startup or reconnect.
  Bots and sustained controls/combat remain open.
  Existing lab services are unchanged.

- `QUAKE4-BORDER-DRIVERS-2026-09-05.md` records an unresolved llvmpipe
  border-sampling discrepancy: 14/128 cases fail on Mesa 25.2.8 while the
  unchanged host AMD/Mesa 26.1.6 check passes all 128. No test was relaxed.

- `D3-MANAGED-TRANSPORT-2026-09-05.md` supplies the missing browser datagram
  seam and an authenticated fixed-destination relay. Worker/native/real-UDP
  tests pass; both Wasm clients rebuild. An isolated real dedicated server
  loads the first deathmatch map and exchanges native status/challenge packets
  through the transport. Supervisor wiring, actual browser connection/gameplay
  and bots remain open; neither live images nor the staged site are replaced.

- `D3-LETTER-INPUT-2026-09-05.md` repairs shared Doom 3/RoE uppercase
  gameplay key identity and a browser-only Home-for-Escape session mapping.
  All 52 real-SDL input cases and 35 native session-routing cases pass, with
  negative controls. Both clients rebuild and the full staging suite passes.
  Chrome confirms normal Doom 3/RoE intros through first-person Mars City and
  Ancient Ruins, both letter cases reaching the same restored native binding,
  repaired Escape pause/resume and Shift+Escape console routing in both clients.
  Mouse capture, held-key movement and broader campaign/save acceptance remain
  open; the live services are unchanged.

- `PREY-MENU-CACHE-2026-09-05.md` makes sound/font packs available before
  startup and adds a bounded 1 MiB archive read cache. All 65 cache cases pass;
  10,000 tiny header requests use one backing read in the fixture. Chrome
  confirms real menu score, startup console text, preserved pack checksums,
  normal Roadhouse intro/world and faster observed initialization/mounting.
  Uppercase gameplay identity is corrected while text case is preserved:
  all 43 SDL keyboard/text cases pass, and Chrome executes the same native
  binding for upper/lowercase W before verifying its original binding restored.
  Held-key movement, mouse capture and audible listening remain open.

- `PREY-AUDIO-INTRO-2026-09-05.md` traces the black intro to its first native
  voice-completion wait with an unavailable worker audio device. A Prey worker
  OpenAL bridge and page WebAudio receiver pass real Wasm negative/positive
  device, PCM, source/queue and natural-completion checks, the six-variant
  adapter suite, full rebuild, exact patches and staging. Deferred declaration
  discovery/default adoption and early image/sample cache recovery then pass
  46 native cases (eight fail before). Packaged Chrome confirms real intro OGG
  paths/durations, normal visible bathroom, automatic console recovery and
  pause/resume, without script or view-effect bypasses. Sustained movement,
  mouse capture, audible listening and pre-mount menu audio remain open.

- `D3-IMAGE-ACCOUNTING-2026-09-05.md` repairs missing RGBA accounting in
  Doom 3/RoE and Prey. All 46 CPU cases pass; the next Chrome attempt exposes
  Prey's separate missing-image texture aliasing bug. Restoring normal texture
  ownership passes all 11 GLES-backed cases (seven fail before), native rebuild,
  exact patch trees and staging. Chrome verifies native draw statistics without
  either crash. Native image reload restores console text but leaves the world
  black. A temporary view-effects bypass reveals lit, textured Roadhouse
  geometry; original settings are restored and gameplay paused. The effect/
  intro-state fix and automatic deferred-texture recovery remain open.

- `PREY-ROADHOUSE-2026-09-05.md` reproduces black Roadhouse through native
  New Game, but map-aware traces show all four post-load frames returning,
  superseding the older second-frame-stall diagnosis for this run. A separate
  empty SDL keymap loses non-text browser keys. The repaired export passes all
  37 real-SDL Wasm cases (34 fail before), native build, exact patch trees and
  staging. Chrome verifies submenu Escape, gameplay pause/resume and native
  console Enter without unmapped-key warnings. Black gameplay, sustained
  controls and audio remain open.

- `QUAKE4-READBACK-2026-09-05.md` traces corrupt save thumbnails to unsupported
  RGB pixel readback. Browser-only RGBA capture and RGB tile conversion preserve
  pack/PBO state and native desktop/Vulkan behavior. All 60 formerly failing
  GLES cases and three desktop controls pass; exact patches and staging pass.
  A fresh legacy save reproduces the corrupt thumbnail in Chrome. The repaired
  image writes a correct new thumbnail, retains it after a page reload, and
  restores that save to the first-person world. Pointer capture remains open.

- `QUAKE4-CAPTURE-2026-09-05.md` repairs absent native input-mode/resume intent
  and console classification. Root menu, submenus, Continue and animation
  boundaries have distinct capture policy, with native acknowledgement before
  requesting lock. Twenty-four native state cases and the six-variant adapter
  suite pass with negative controls; staging passes. The isolated candidate
  verifies root/submenu resume intent in Chrome. The re-lock follow-up removes
  an overly strict activation guard and passes a negative/positive regression.
  A separate engine-free Chrome control rejects immediate and delayed trusted
  capture clicks with `WrongDocumentError`; capture remains unaccepted. Only
  the owned port-32875 test container changes, retaining preceding images and
  stopped containers. A further console-Escape regression handles cinematic
  consumption versus ordinary menu opening using actual native acknowledgement.
  Final Chrome verifies both branches and guarded Continue; capture requests
  remain denied. The subsequent readback checkpoint above fixes save-preview
  corruption and verifies a fresh save and cross-reload restore.

- `QUAKE4-CAMPAIGN-2026-09-05.md` traces the campaign parser crash to an
  unterminated OpenAL device list, records negative/positive actual-native
  choice-lexer tests, and verifies rebuilt main/side-module exception handling.
  Subsequent Continue/keyboard/clock repairs reach an animated campaign intro
  in Chrome with real WebAudio starts. A coherent CPU shadow repair clears the
  later cinematic crash and reaches the first-person pistol/HUD. The world
  remains mostly black with repeated native GL errors, so rendering/gameplay
  acceptance is still open. No live Quake 4 service has been replaced.
  A subsequent generated-shader repair clears the ambient shader compilation
  and invalid program/attribute errors in Chrome; 24 actual generated shader
  cases compile/link on a real EGL/GLES driver. Cross-reload save restore passes.
  Native texture conversion subsequently passes 20 linked-engine cases and
  corrects menu/weapon/HUD colors in Chrome. Flat-normal and geometry-debug
  comparisons are recorded with settings restored. Depth allocation,
  border-clamp, framebuffer-copy errors and black-world rendering remain open.
  A subsequent sized-depth allocation repair passes 23 native image cases and
  removes the depth-allocation errors in Chrome. Depth-tested debug geometry
  is visible; normal world rendering is still black. Remaining border/copy
  errors and interaction-depth/shading acceptance are separate work.
  A subsequent framebuffer-copy repair passes 32 native cases and Chrome
  SDR/HDR/MSAA copy tests, and removes actual campaign copy/blit errors.
  Saved-scene restore remains good, while world rendering remains black and
  border-clamp semantics remain open. Synthetic actual-shader depth comparisons
  pass without changing production position shaders; campaign lighting is
  not accepted by those limited comparisons.
  A subsequent SDK vertex-cache repair fixes stale depth-pass attribute
  bindings: five native cases fail before and all ten pass after. Chrome now
  renders the saved scene's textured world with normal depth testing. No
  diagnostic bypass is shipped; an uninstrumented package pass confirms the
  same world/save restore. Border semantics and wider rendering/control/
  campaign acceptance remain open; see the campaign checkpoint's latest entry.
  A subsequent shipped-material GLSL ES port preserves ambient, stock/enhanced
  specular and existing cel/flat-diffuse controls. All 128 real-GPU comparisons
  now match the shipped shader exactly (116 differed before). Depth, native and
  packaging regressions pass. Old-tab timeouts are bypassed with a responsive
  fresh Chrome tab, which restores the comparison save and renders textured
  world geometry plus weapon/HUD; Escape pauses. Dark areas, apparent geometry
  gaps and border errors remain, so this is partial rendering progress only.
  A repeat with the normal immutable package also restores the save and renders
  world/weapon/HUD without diagnostic code or worker errors. See the fresh-tab
  and uninstrumented Chrome records linked from the campaign checkpoint.
  A native offscreen reference shows the central rock opening is expected but
  the browser sky/background is missing. A subsequent per-array VBO/stride
  repair passes seven actual-SDK submission cases, including indexed and
  non-indexed draws after buffer unbinding. The normal candidate now restores
  the saved scene with bright cloudy sky, distant scenery and aircraft in
  Chrome; mouse-look changes yaw and Escape pauses without worker errors.
  See the native reference, binding and Chrome split-buffer records in the
  campaign checkpoint. Border sampling and wider control/campaign acceptance
  remain open. A later handoff request asks for a Chrome extension update;
  this does not invalidate the preceding captured results.

- `QUAKE4-BORDER-2026-09-05.md` records the subsequent border-sampling oracle
  and test-only GLSL prototype. All 128 isotropic desktop GL comparisons and
  128 GLES comparisons match within one channel value; 8x anisotropic filtering
  exposes 30 failures per API. No production integration or setting downgrade
  is made. This is synthetic GPU evidence, not a Chrome/campaign pass.
  A subsequent genuine multi-tap anisotropic kernel passes 4,096 desktop/GLES
  same-footprint border comparisons across all 16 settings. Differences from
  the vendor's own anisotropic kernel remain reported. Prototype shader
  conversion passes generated/material linking, lighting and depth regressions;
  A subsequent canonical-patch integration adds cached texture/program state,
  actual engine metadata and SDK call routing. The separate unlaunched candidate
  passes 91 linked image/sampler/framebuffer cases, six native API paths, 40
  desktop format cases and 4,096 GPU comparisons through packaged conversion.
  Lighting, depth, vertex, audio, save and package regressions pass. The retained
  sky container is unchanged; broader shader coverage and Chrome campaign
  quality/performance acceptance remain open. See the latest border section and
  `quake4-border-integrated-build-2026-09-05.json` for exact identities.
  With Chrome control restored, the initial border candidate fails startup on
  GLSL 130. The expanded shipped-inventory gate exposes and drives repairs for
  sampler parameters, MRT outputs and SDK normal matrices. A separate rebuilt
  candidate passes all 33 shipped pairs, targeted shader/normal-matrix cases,
  91 image cases, 4,096 GPU comparisons and staging. Chrome completes a fresh
  natural intro into textured first-person world/sky/weapon/HUD without worker
  exceptions; native pause/resume preserves rendering. The capture click opens
  pause, so movement/firing and full control/performance acceptance remain open.
  See the border checkpoint's shader-startup/Chrome sections and
  `quake4-border-dialects-*` records, including the retained screenshot.

- `QUAKE4-2026-09-05.md` records real Chrome animated-menu rendering after
  context, draw-buffer and full-width index fixes; the next campaign parser
  crash; and the built/tested, not yet Chrome-verified page-focus audio bridge.
  The isolated candidate is not deployed and gameplay/audio remain open.

- `QUAKE4-2026-09-04.md` records the native worker audio repair, WebGL procedure
  lookup and ES startup fixes, full SP/MP rebuild, and regression checks.
  No Quake 4 browser gameplay/audio acceptance is claimed.

- `d3wasm-checkpoint.json` records the 2026-08-21 Doom 3/RoE conversion state:
  the true d3wasm WebGL 1 engine is pinned, exactly patch-reconstructable, and
  clean-built for both games. Chrome formally proved Doom 3 campaign gameplay,
  real keyboard movement, audio, console resume, and same-session save/reload.
  Final-build cross-reload persistence was interrupted before its result, and
  automated Chrome could not grant pointer lock for the formal mouse gate.
  Resume from `../RESUME-RUNBOOK.md`; do not repeat the long campaign proof.
- `prey-checkpoint.json` records the 2026-08-21 Prey/d3wasm integration state:
  menu input works and the first campaign map loads completely, but the first
  sustained gameplay render remains black and must be debugged before Prey can
  be promoted from **Still in development**.
