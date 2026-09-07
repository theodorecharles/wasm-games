# Game Lab Fix TODO

Current stopped-state handoff: [RESUME-RUNBOOK.md](RESUME-RUNBOOK.md).
It records the full portfolio status and the interrupted, untested Wolf/Spear
persistence draft; do not confuse that draft with the live binding release.

Working fix list from the 2026-08-29 lab test session. Full details, evidence,
and root causes: [`GAME-LAB-TEST-ISSUES.md`](GAME-LAB-TEST-ISSUES.md).

## Fix progress — 2026-09-06

- Wolf3D/Spear binding labels: **deployed on 8011/8012**. The native name lookup
  now uses the SDK's actual special-key constants instead of legacy SDL1 table
  positions. Both live cached origins pass labels, first level, W movement,
  firing 8→7 and pause/resume. Isolated Wolf Ctrl→F editing, F firing 7→6 and
  Ctrl restoration pass. Real-SDK native tests cover names/controller translation
  (161 cases per variant) and gameplay (81 per variant), with failing old-code
  controls. All builds/image gates pass; only two services changed, preserving
  155 other containers and 18 owner files. Capture diagnostics now record
  WrongDocumentError despite a connected/focused/active trusted request; actual
  pointer lock remains absent. Binding persistence, saves, held controls and
  wider play stay open. See the
  [binding release](wolf3d-wasm/proofs/BINDINGS-RELEASE-2026-09-06.md).

- Wolf3D/Spear quick-input follow-up: **deployed on 8011/8012**. Gameplay no
  longer loses a press/release pair drained in one frame. Native regressions
  pass 81 Wolf/81 Spear/73 desktop cases, with failing old-behavior controls.
  Full builds/image gates and 28 live HTTP asset hashes pass. Real Chrome now
  shows W movement and primary-click firing (8→7) on both normal cached origins,
  plus menu entry/pause/resume. This supersedes the missed-input discrepancies
  below; actual pointer lock, held controls and broader acceptance stay open.
  Only two services were recreated; 150 other containers, all 18 owner files
  and existing mounts were preserved. See the
  [input release](wolf3d-wasm/proofs/INPUT-RELEASE-2026-09-06.md).

- Wolf3D/Spear menu/dialog release: deployed on **8011/8012**. Native palette
  updates now repaint static dialogs; screen clears no longer leave old text
  below the menu. The cumulative row-pointer, episode-caption and fast-key
  repairs are included. Both final isolated candidates pass Chrome dialogs,
  native first-level entry, W movement, mouse firing (8→7), pause and resume.
  Complete clean native builds, 16-file image/effective-shell checks and 14
  live HTTP asset checks per service pass. Only two services were recreated;
  all 147 others and 18 owner files are unchanged, with rollback images retained.
  Twenty live Chrome pairs verify both view dialogs, clean menu returns, native
  first levels and pause/resume; Wolf W movement and Spear firing pass. Two
  live Wolf fire attempts stayed at 8 rounds, and Spear's live W tap did not
  visibly move: those earlier discrepancies are addressed by the input release
  above. Custom bindings, capture/held controls, save/load, listening and wider
  gameplay remain open. See the
  [release record](wolf3d-wasm/proofs/PALETTE-RELEASE-2026-09-06.md).

- Blood/Duke Modernized release: **deployed on 8007/18007** with the accumulated
  renderer repairs, Duke save-name fix and Blood binding-slot diagnostic fix.
  The complete candidate passes 16 Chrome pairs across all four profiles:
  first-level rendering/W movement, Duke firing 48→47, Blood menu/reload mask31.
  Three canonical images and both live endpoints' exact assets pass; only two
  services were recreated, all 142 others and 98 owner files remain unchanged.
  Classic is still the default and prior images/saves are retained. Twenty-one
  live Chrome pairs now verify both native first levels in both profiles, W
  movement and Duke firing (Classic 48→47, Modernized 48→46). Original profile
  selections restored, no saves created/overwritten. Wider gameplay/fidelity,
  held controls/capture and listening remain open. Blood crash stays deferred. See the
  [release and rollback record](build-wasm/proofs/BUILD-RELEASE-2026-09-06.md).

- Blood Modernized: **implemented and Chrome-checked in isolated builds, not
  deployed**. Selectable 1280×720 Polymost rendering, actual pitch/yaw, W taps,
  pause/resume, B7 save/full reload/exact native restoration and shared-save
  loading in Classic pass. Thirty initial Chrome pairs/63 hashes. A false
  primary-slot-only controls warning is fixed with 512 native/Wasm cases per
  target. All four Blood/Duke modules now build through the canonical pipeline;
  fresh-directory linking and stale served-framework packaging were corrected.
  Current complete candidate: 32989. Integrated Chrome checks, wider gameplay,
  capture/listening and promotion remain open; Blood crash repro stays deferred.
  See the [Blood/family checkpoint](build-wasm/proofs/BLOOD-MODERNIZED-2026-09-06.md).

- Duke save-name text input: **fixed in canonical source and isolated 32986,
  not deployed**. Both renderer modules now receive a separate bounded ASCII
  queue alongside physical scan states. Real Chrome typing, Backspace and Enter
  work; Modernized TEXT7 and Classic C7 saves survive full page reload and
  restore exact native positions/views with byte-identical world screenshots.
  Classic also loads the Modernized-created save. Two new saves, no overwrites;
  26 Chrome pairs/55 hashes, 12,296 native/Wasm checks per target and failing
  missing-insertion controls pass. Movement/firing remain working. Broader
  gameplay, held controls/capture, listening, SDK uniform diagnostics, Blood
  Modernized and promotion remain open. See the
  [text-input checkpoint](build-wasm/proofs/DUKE-TEXT-INPUT-2026-09-06.md).

- Duke Modernized alpha testing: **fixed in canonical source and isolated
  32985, not deployed or fully accepted**. Custom fragments now honor native
  alpha-test enable/function/reference before color/depth writes, including
  shader switches and accounting resets. Production basic/extended shaders
  pass 7,680 color/depth cases per AMD/llvmpipe driver; 343 actual native/SDK
  state cases pass, and missing-discard/synchronization controls fail. Chrome
  verifies three shots (48→45), pitch 113→40, yaw 422→637, a W tap changing
  native XY, and pause/save-preview/cancel/resume with an identical final
  world image. Twelve new pairs/29 hashes. In that baseline, save-name T reaches
  scan 20 but produces no visible letter; the newer text-input checkpoint above
  fixes delivery and verifies save/reload/load. No save was confirmed in 32985.
  Wider gameplay/fidelity, held controls/capture, listening,
  Blood Modernized and promotion remain open. See the
  [alpha checkpoint](build-wasm/proofs/DUKE-ALPHA-2026-09-06.md).

- Duke Modernized cropped artwork and palette precision: **fixed in canonical
  source and isolated 32984, not deployed or fully accepted**. False NPOT
  detection rounded UV dimensions despite actual-size tile storage; the fix
  restores the complete logo, pistol/hand and readable small save-menu labels
  in Chrome. A separate lowp sampler bug selects adjacent palette entries on
  AMD; highp samplers fix exact production GLES readback. Both AMD and llvmpipe
  pass 39,960 pixels/18 draws, with old-detection failures on both and the old
  precision failure on AMD. Chrome firing 48→47 and pause/save-preview/cancel/
  resume pass; 11 new pairs/27 hashes, exact source/package audits and shader
  tests pass. No save confirmed. Alpha/depth, controls/capture, listening,
  save/load, Blood Modernized and deployment remain open. Live Classic and
  RTCW SP unchanged; Blood crash deferred. See the
  [texture checkpoint](build-wasm/proofs/DUKE-NPOT-2026-09-06.md).

- Duke selectable Classic/Modernized profiles: **implemented and Chrome-checked
  in isolated 32982, not deployed or fully accepted**. Actual launcher selection
  starts 1280×720 Polymost (mode 3 / 32 bpp); real mouse input changes native
  pitch 185→162 and yaw 422→477, and three clicks use three pistol rounds.
  Reload remembers the choice; switching to Classic restores the byte-identical
  800×600 software engine, first-level firing and Escape, then switching back
  reopens GPU mode. Settings files are separate; owner-data cache/save root
  remain shared. Seventeen new Chrome pairs/37 hashes, adapter/profile tests,
  canonical source audit, Wasm validation and GPU regressions pass. Small
  save-menu text and a stray menu texture were defective in this baseline
  (the newer texture checkpoint above addresses the cropping); sprite/alpha/depth,
  held movement/capture, listening, save/load and deployment acceptance stay
  open. No save confirmed/overwritten. Blood Modernized remains open and its
  crash is deferred; live Duke and RTCW SP unchanged. See the
  [profile checkpoint](build-wasm/proofs/DUKE-PROFILES-2026-09-06.md).

- Duke Modernized GPU bring-up: **in progress, not deployed or accepted**.
  **The GPU menu, skyline, world textures, weapon and HUD now render.** Real
  Chrome firing in the observer-free GPU build changes ammo 48 to 47. Explicit texture
  matrix initialization and sized R8 atlas/palette allocation fixed the black
  menu; RGBA-byte conversion fixed rejected BGRA/packed-pixel mip uploads.
  Forty exact-production GLES pixel checks pass on AMD and llvmpipe, with
  four failing negative controls on each. Unsupported fog/perspective hints
  are now guarded in browser builds. An infinite-far projection restores the
  skyline that the old depth-8 far plane clipped without desktop depth clamping;
  27 real GLES clipping checks pass per driver, with failing old-matrix controls.
  Observer-free native pause/resume also passes. Twenty additional Chrome
  pairs/56 hashes retain both failures and the restored skyline (33 pairs
  across both Duke checkpoints).
  This earlier checkpoint is not complete renderer or Modernized acceptance.
  Widescreen/profile integration advances in the newer checkpoint above;
  full controls and save/reload acceptance remain open. Only Duke native
  JS/Wasm differ in isolated packages; 19 installed files, live Classic and
  RTCW SP are unchanged. Blood crash deferred. See the
  [visible-renderer checkpoint](build-wasm/proofs/DUKE-VISIBLE-2026-09-06.md)
  and [earlier failure chain](build-wasm/proofs/DUKE-POLYMOST-2026-09-06.md).

- Prey blank quickload key: **fixed in canonical source and rebuilt isolated
  32877, not deployed**. Chrome now shows F9, expires the unconfirmed prompt,
  restores the newest quicksave's exact position, loads the prior build's
  second-map autosave and quickloads back. Baseline also creates two distinct
  quicksaves and diagnostically triggers the real next-map path (not normal
  campaign progression). Thirty-nine Chrome pairs/88 hashes, seven save loads,
  two clean quits, 26 prompt cases and 14 expected negative failures pass.
  Trace repair unchanged; only native JS/Wasm differ, 45 package files unchanged.
  Previous trace container retained stopped; six saves retained, tab blank.
  Live Prey/RTCW SP untouched; Blood deferred. Full campaign, held controls,
  capture/listening, ring wrap and promotion remain open. See the
  [current Prey checkpoint](idtech4-wasm/proofs/PREY-QUICKLOAD-2026-09-06.md).

- Prey saved trace-cache ownership: **fixed in canonical source and rebuilt
  isolated 32877, not deployed**. Five Chrome native loads and two quits emit
  zero cleanup warnings. Both old saves load; distinct new save/preview survive
  full page reload and exact new/old positions restore. Twenty-eight Chrome
  pairs/65 hashes, 22 repaired native/Wasm cases and 18 expected old-call
  failures pass. Existing Ctrl/Alt fix is also integrated and both edges are
  Chrome-verified; only Wasm/adapter changed, 45 files unchanged. Old isolated
  container retained stopped; live Prey/RTCW SP untouched, Blood deferred.
  Three saves retained, owned tab blank. Broader campaign/control/listening/
  promotion gates remain open. See the
  [Prey repair checkpoint](idtech4-wasm/proofs/PREY-TRACE-CACHE-2026-09-06.md).

- Quake 4 Ctrl/Alt integration: **fixed in isolated 32962, not deployed**.
  Current source adapter replaces the old guard; 46 other installed files are
  unchanged. All six packaged variants and 402 modifier cases pass with failing
  old-code controls. Chrome reproduces old dropped presses, verifies new
  Ctrl/Alt pairs, and completes native Continue with Ctrl alone. World/pause/
  resume/quit and ten Chrome pairs/26 hashes pass. Pointer lock remains denied;
  held controls/listening stay open. Old 32961/saves and live services are
  unchanged. See the [input checkpoint](idtech4-wasm/proofs/QUAKE4-INPUT-2026-09-06.md).

- Quake 4 current-renderer saves: **native named save/full reload/load verified
  in Chrome on unchanged isolated 32961**. Correct preview and original printed
  position survive; a native-console teleport comparison is undone by a second
  load. Pause/resume/quit, 19 Chrome pairs/40 hashes and exact package audits
  pass. Eight short W taps did not establish movement; capture/listening/held
  controls stay open. The later input checkpoint above integrates the existing
  Ctrl/Alt fix into a separate 32962 candidate, leaving this save-tested package
  unchanged. No live changes or overwritten saves. See the
  [save checkpoint](idtech4-wasm/proofs/QUAKE4-SAVES-2026-09-06.md).

- Quake 4 software sampling gate: **false renderer rejection corrected**.
  Native-only probes trace the nine retained differences to llvmpipe's quad
  LOD/fast-log choices. An independent CPU oracle verifies 46,464 production
  GL/GLES channels across AMD and both software versions at the unchanged
  one-channel tolerance; broken mip/edge samplers fail. Packaging now requires
  that contract plus every same-footprint native border gate, while retaining
  the old vendor-exact failure as a diagnostic. No renderer/artifact/live changes.
  Anisotropy 1 passes on all three drivers and 16 on AMD/old software. See the
  [LOD checkpoint](idtech4-wasm/proofs/QUAKE4-LOD-2026-09-06.md).

- Quake 4 intro gray polygons: **fixed in canonical source and isolated 32961,
  not deployed**. The SDK brightness quad now uses its CPU vertices and restores
  the application's VBO; WebGL no longer mistakes intentionally absent desktop
  ARB programs for failed GLSL interactions. Six actual SDK transitions and
  1,280 ambient-policy cases pass, with failing old-code controls. Exact source,
  fresh build, package and HTTP audits pass; earlier observer packages stay
  unchanged. Chrome shows clean ships/characters, and explicit brightness
  evenly covers the frozen scene; restoring 0 restores the byte-identical
  screenshot. Decals/overlays stay enabled. The natural intro reaches pistol/
  HUD/world gameplay and native pause/resume passes. The broader renderer,
  campaign/control/listening gates remain open. See the
  [repair checkpoint](idtech4-wasm/proofs/QUAKE4-QUAD-2026-09-06.md), which
  supersedes the earlier [diagnostic checkpoint](idtech4-wasm/proofs/QUAKE4-INTRO-2026-09-06.md).

- Quake 4 software mip-size bug: **fixed in source and isolated 32957, not
  deployed**. Mesa 25.2.8 incorrectly broadcasts varying mip-size queries;
  an independent GPU probe reproduces 680 wrong dimensions. Deriving sizes
  from the base mip removes all same-footprint errors in 4,096 comparisons
  on each of old llvmpipe and AMD. Fresh linking changes only the serialized
  shader helper; Wasm and 46 other installed files are unchanged. All 33
  shipped shader pairs compile. Nine small implicit-filter differences still
  fail the historical vendor-exact gate; the LOD checkpoint above explains and
  supersedes that packaging criterion without relaxing tolerances. Chrome completes
  the natural intro into first-person world/pistol/HUD and pauses/resumes.
  The subsequent quad repair above resolves the observed gray intro polygons;
  this is not blanket renderer acceptance. See the
  [mip-size checkpoint](idtech4-wasm/proofs/QUAKE4-BORDER-SIZE-2026-09-06.md).

- Fullscreen gate narrowed: **Chrome rejects the independent engine-free
  control**, not only game launchers. Two pointer paths and Enter produce
  trusted clicks with active user gestures, but all three requests reject with
  `TypeError: not granted` and `fullscreenerror`, without entering fullscreen.
  The installed launch request is synchronous and its server sends no denying
  fullscreen header. No browser security setting, framework, engine, image or
  live service was changed; fullscreen acceptance remains open. See the
  [fullscreen observation](dosbox-wasm/proofs/FULLSCREEN-2026-09-06.md).

- DOSBox WASD/typing: **explicit policy fixed in source and isolated v3; six
  Chrome controls verified, not deployed**. Jill 1–3, Jazz and Duke 1–2 get a
  visible movement switch, off by default for original letters/menu shortcuts/
  save names. Arrows always retain their meaning; Shift+Tab reaches the switch.
  Physical/controller ownership prevents aliases releasing each other, and
  mode/focus changes release held keys. Five broken-policy mutations fail;
  92 actual adapter-to-DOS BIOS cases pass on each of the current and exact-live
  engines. Chrome verifies all six switches, keyboard/pointer activation,
  focus return and reload reset; the other three titles have no added control.
  Short-tap gameplay and requested fullscreen transitions remain unaccepted.
  Full package checks, 14 HTTP hashes and 47 evidence hashes pass. All 105
  pre-existing containers and 696 curated owner files remain unchanged; RTCW
  rendering is untouched and Blood stays deferred. See the
  [WASD checkpoint](dosbox-wasm/proofs/WASD-POLICY-2026-09-06.md).

- Jazz input/save follow-up: **current-engine native menu, text, movement and
  save/load verified; Chrome acceptance remains open**. Native New Game reaches
  level 1:1; `WASD906`, digits and Backspace work in Save Game. Right/Left holds
  move Jazz and enemy damage reduces health; loading the named slot restores
  the original visible position/full health bar. Native Quit Game returns an
  intact main menu. A separate ten-minute diagnostic falsely rejected an
  advancing unsigned Wasm counter as negative; normalization and regression
  controls fix that gate. Full package checks and exact-live 70 BIOS-key cases
  pass. Engine/adapter/images and all 66 owner files are unchanged. Chrome's
  short-tap menu test and browser save persistence remain open; the subsequent
  WASD policy checkpoint above covers the separate movement/text change. See the
  [Jazz checkpoint](dosbox-wasm/proofs/JAZZ-NATIVE-INPUT-2026-09-06.md).

- Doom 3 SP/RoE saved trace-cache ownership: **fixed in isolated v8 and verified
  in Chrome, not deployed**. Save restoration replaced the cache without
  reacquiring the clip-owned default reference. Both canonical patches now
  release old ownership before restore and reacquire the default by shape;
  serialization and the original warning guard remain unchanged. All 44
  native/Wasm cases pass and restoring the old call fails the expected save
  cases. Exact source/build/package and 47 lifecycle checks pass. Chrome loads
  each original v7 save twice, creates distinct v8 saves, reloads the pages,
  restores the same positions/HUD, resumes and quits normally with zero
  uncached trace-model warnings. The two owned v7 campaign containers were
  stopped, not deleted, for v8 on the same 32953/32954 origins. Both test
  supervisors stay asleep; live services, RTCW and owner data are unchanged.
  Blood remains deferred. See the
  [trace-cache checkpoint](idtech4-wasm/proofs/D3-TRACE-CACHE-2026-09-06.md).

- Doom 3 SP/RoE save regression: **first-map saves verified in exact local v7**.
  Both campaigns reach native gameplay through New Game/Marine and natural
  intros. Named saves and preview images survive full page reload; native
  SaveGame loads restore health/ammo and the original printed view coordinates
  after short W inputs. Pause/Return to Game, exact package/HTTP hashes and
  persistence/evidence tests pass. No MP wake, owner-data write or live service
  replacement. This narrows the promotion gate, not full campaign or held-input/
  capture/listening acceptance. See the
  [campaign/save checkpoint](idtech4-wasm/proofs/D3-CAMPAIGN-SAVES-2026-09-06.md).

- Doom 3 Delta roundtrip blackout: **reproduced and verified fixed by the v7
  mixer repair**, still not deployed. Test-only native camera/health/clock
  telemetry makes a 306 ms lit→zero→lit material-amplitude comparison exact.
  A separate old-mixer build uses no amplitude override: fresh Delta is lit,
  but Delta→Tomiko→Delta freezes all 90 sampled amplitudes at zero and gives a
  black room at the same recorded camera/100 health. The repaired roundtrip
  returns to lit Delta with advancing clock/nonzero amplitudes and a camera
  difference of only 0.000030 units. Both controls retain healthy native bots,
  normal disconnect and natural idle. Package/source/evidence audits and the
  native/Wasm positive/negative mixer tests pass. Only test instrumentation
  was added here; release artifacts, shaders, owner data and live services
  are unchanged. Broader visual/control/audio/SP regression gates remain.
  See the [lighting checkpoint](idtech4-wasm/proofs/D3-LIGHT-CLOCK-2026-09-06.md).

- Doom 3 MP sound scheduling: **fixed in isolated v7, not deployed**. The
  default inline mixer was only called by the single-player session path,
  which active multiplayer skips. V6 Chrome has zero playback starts in the
  match, then hundreds after native disconnect. The MP-only call repair
  passes all four mixer modes through join/play/disconnect/rejoin on native
  and Wasm fixtures; removing it restores exactly the expected failures.
  Fresh sources, full Wasm build, nine package hashes and 47 lifecycle checks
  pass. Actual Chrome playback advances on Delta Lab, after a native Tomiko
  vote and after reconnect. The lighting checkpoint above verifies the
  roundtrip lead; complete visuals, listening, held input/capture and promotion remain
  open. See the [audio checkpoint](idtech4-wasm/proofs/D3-MP-AUDIO-2026-09-06.md).

- Counter-Strike main/pause menu cleanup: **installed on 8017** after actual
  Chrome acceptance. Cold/disconnected is Join only; connected is compact
  Resume/Disconnect/Configuration/Console, with Customize preserved directly
  under Configuration. Unsupported campaign/save/server-hub/game-switch/readme/
  minimize actions are no longer registered. Chrome caught a separate initial
  Enter-focus failure; selecting Join/Resume after the base window's Show reset
  fixes it, with the rejected source retained as a negative control. Candidate
  keyboard Join/Resume, pointer Resume, settings navigation, first-person HUD,
  Console/nine bots and disconnect/rejoin pass. Live keyboard Join/Resume,
  pointer Resume into first-person gameplay, Console/nine bots and clean
  native Disconnect → OK also pass. Full tests, clean/incremental build identity
  and 27 HTTP checks pass;
  only two of 38 immutable files change, with all 97 other containers and all
  original/active owner files unchanged. Capture/held/audio acceptance remains
  open. See the [managed-menu checkpoint](goldsource-wasm/proofs/CS-MANAGED-MENU-2026-09-06.md).

- Counter-Strike preceding menu-global repair: **fixed and installed on 8017**. The menu and CS weapon
  client exported incompatible `gpGlobals` pointers through the same Wasm GOT;
  weapon initialization overwrote the menu's dimensions/visibility/input state.
  Menu-only hidden visibility fixes the reproduced Resume-button failure and
  lost Console/Disconnect controls/background. Actual original/patched Wasm
  entrypoints provide a negative control; clean and incremental builds match.
  Candidate and live Chrome verify the exact formerly failing Resume click,
  first-person pistol/HUD, Console, nine-bot roster and native Disconnect → OK
  returning to an intact menu. Candidate rejoin also passes. Exactly two of
  38 immutable files change; all 27 HTTP checks pass, all 95 other containers
  and both original/active data installations remain unchanged. Main/pause
  menu cleanup is handled by the later release above; capture/held/audio remains open. See the
  [menu repair checkpoint](goldsource-wasm/proofs/CS-MENU-GLOBALS-2026-09-06.md).

- GoldSource preceding cumulative release: the exact 32932 candidate was
  **installed on 8017**, including stored-WAD loading, native save-key hints,
  selected-server fallback and pending-capture/loading-canvas repairs.
  All 27 public package files match accepted hashes; native artifacts other
  than the generic menu are unchanged. A separate private installation
  preserves all 10,174 member payloads; all 16 original files remain intact.
  Full tests and image audits pass, and all 94 other containers—including the
  native Counter-Strike host—are unchanged. Chrome restores the old-build
  Blue Shift save after deployment with its original slot/preview, textured
  tram and 100 health; the live native save menu now displays F6/F7.
  Fresh live Blue Shift map startup drops from 20 to about 1 second;
  Opposing Force also reaches its textured helicopter intro in the repaired
  loading path. Both native map identities and clean departures are recorded.
  Half-Life starts and pauses/resumes; CS joins the current `de_dust`, selects
  team/appearance, reaches first-person pistol/HUD and confirms nine bots.
  This earlier checkpoint reproduced a broken CS Resume button and lost
  post-disconnect background/Console label; the later menu repair above fixes
  those issues without changing its data or other native artifacts.
  Capture, held controls, listening and broader acceptance remain open.
  See the [release checkpoint](goldsource-wasm/proofs/RELEASE-2026-09-06.md).

- OpenRCT2 cumulative release: candidate 32940's exact image is now
  **installed on 8026**, including scenery indexing, RCT1 sprite paths,
  construction/dialog fixes, callback ABI and stable object caching. The
  versioned private installation preserves every original file and adds only
  22 checked scenery objects; the original directory remains unchanged.
  All 19 public files match accepted hashes, full package/image tests pass,
  and all 94 other containers are unchanged. Chrome restores the existing RCT2
  save with matching park/cash/guests/date, resumes it, then verifies a full
  reload without index rebuilding. Live RCT1 Diamond Heights renders, runs and
  pauses with moving vehicles and advancing park values. Listening and broader
  acceptance remain open. Post-upgrade evidence is in the
  [release checkpoint](openrct2-wasm/proofs/RELEASE-2026-09-06.md).

- SimCity 2000: the existing DOSBox timing fix is now **installed on 8025**
  after acceptance on candidate 32944. A matched native run reaches the menu by 25 seconds while
  the installed engine remains at its splash at 30 seconds; nonzero native
  audio callbacks increase from 2 to 1,196. Actual Chrome creates a named 1950
  city, selects the road tool and places a tile with the expected $10 cost.
  Full DOS tests pass; only two of 28 image files change, with 13 exact HTTP
  checks. Native menus/shortcuts are now verified. Save investigation shows
  that the game writes its final header only after `Game Saved As` is dismissed;
  the earlier premature reload was not a completed save. An attempted native
  buffer flush did not address that guest behavior and was withdrawn. A completed
  save now passes full Chrome reload with matching terrain, three roads,
  January 1950 and $19,970, then resumes. Installed HTTP/package checks pass;
  all 94 other containers, owner-data mounts and RTCW SP are unchanged. Broader
  mouse, listening and performance acceptance remain open. See the
  [SimCity checkpoint](dosbox-wasm/proofs/SIMCITY-CHROME-2026-09-06.md).

- Quake III: actual installed Chrome joins sleeping Q3DM11 on the first native
  click, renders gameplay, pauses, resumes with Escape/the native button, and
  disconnects. Fixed a separately reproduced stale `JOINING` label after
  disconnect. Candidate 32943 cold-joins Q3DM7, returns to a clean main menu and
  rejoins with seven bots. Full adapter/family tests and an old-code negative
  control pass; exactly one of 53 packaged files changes, with 11 HTTP matches.
  That exact candidate is now **installed on 8083**. Live Chrome cold-joins
  Q3DM11, leaves to a clean menu without stale status and rejoins seven bots.
  All nine owner PAK hashes and the other 94 containers are unchanged; native
  binaries are unchanged. Capture, saved-resolution metadata, held controls,
  listening, performance and wider acceptance remain open. See the
  [Chrome checkpoint](idtech3-wasm/proofs/QUAKE3-CHROME-2026-09-06.md).

- RTCW menu packaging: removed wall-clock ZIP timestamps from generated MP/SP
  menu packs. Seven tests cover repeat-build equality, host/input metadata,
  payload changes, empty input and an old-policy negative control. All 13
  authored entries retain identical contents and compressed streams; the full
  family suite passes. This changes packaging metadata only, not deployed
  menus, native binaries or the confirmed-good SP renderer. See the
  [packaging checkpoint](idtech3-wasm/proofs/RTCW-MENU-PACKAGING-2026-09-06.md).

- RTCW MP: actual live Chrome confirms native Join Game wakes the managed
  `mp_depot` server, joins seven bots and supports team/class selection, spawn
  and short firing. It also reproduces triangular world-lighting corruption.
  Patch 0021 isolates legacy client arrays around the explicit lightmap draw;
  96 sanitized native cases and 16 emitted-wrapper cases pass, with an
  old-source negative control. Two source reconstructions, the MP build and
  full family suite pass. Prototype and final candidate 32942 render the same
  garage without the artifacts. Exactly one of 199 image files changes—the
  MP Wasm—and 12 HTTP checks pass. A further Chrome pass verifies short firing
  on the final image (30/60 → 29/60), native disconnect and rejoin with seven
  bots. That exact image is now **installed on 18085**; live package checks
  pass, the data mount is preserved, and all 94 other containers—including
  SP—are unchanged. Capture, held controls, reload-key acceptance,
  performance/audio and broader rendering remain open. See the
  [MP checkpoint](idtech3-wasm/proofs/RTCW-MP-LIGHTMAP-2026-09-06.md).

- OpenRCT2 index cache: fixed bundled objects receiving fresh launch-time
  mtimes and invalidating the persisted index. Stable content-derived stamps
  apply only to bundled indexed files before private/user mounts; native
  invalidation remains unchanged. All 2,484 real public object payloads and
  14 complete native FileIndex cases pass, including same-size changes and
  damaged-cache recovery. Actual Chrome reproduces the old 2.92-second rebuild,
  then candidate 32940 cold-builds once and reuses all indexes on two full
  reloads. Diamond Heights loads, saves, restores exact park values and resumes
  with moving vehicles. Full package/image/evidence checks pass; only the
  worker changes, with native artifacts, owner data and live 8026 untouched.
  Audio/listening, broader acceptance and live promotion remain open. See the
  [index-cache checkpoint](openrct2-wasm/proofs/INDEX-CACHE-2026-09-06.md).

- OpenRCT2 ride-music build: fixed an uninstantiated callback return type
  becoming a placeholder `void()` declaration in Wasm IR. Complete pre-fix
  objects reproduce the signature mismatch; repaired objects pass the same
  full link with fatal warnings. Forty-eight reduced callback cases, full
  package/image checks and exact 19-file HTTP checks pass. Actual Chrome
  candidate 32939 runs RCT1 Diamond Heights with Snake River Falls music
  enabled, completes eight additional passenger trips, and preserves exact
  park values and the checked music setting across a unique save/full reload.
  Resumed boats/coasters move. Only native Wasm changes; private data and live
  8026 remain untouched. This is not a demonstrated crash or audible-playback
  fix. Object-index invalidation, listening and broader acceptance remain
  open. See the [ride-music checkpoint](openrct2-wasm/proofs/RIDE-MUSIC-2026-09-06.md).

- OpenRCT2 construction/dialogs: fixed entrance/exit preview cleanup using the
  newly selected tool's identity, and browser save/load probing unavailable
  desktop applications. Twenty-eight sanitized construction cases and 32
  browser/desktop dialog cases pass; both old-source controls reproduce their
  defects. Full package/image and exact 19-file comparisons pass. Actual Chrome
  candidate 32938 repeats the tool-switch sequence cleanly, completes carousel
  trips, saves a unique park and restores exact cash/guests/date/ride/paths after
  full page reload. The restored ride rotates with ten guests aboard. RCT1
  Forest Frontiers remains free of fallback-sprite warnings. Native JS/Wasm
  alone change; private data and live 8026 remain untouched. A separate native
  ride-music signature/linker warning, object-index cache invalidation, audio
  listening and broader acceptance remain open. See the
  [construction/dialog checkpoint](openrct2-wasm/proofs/CONSTRUCTION-DIALOG-2026-09-05.md).

## Fix progress — 2026-09-05

- OpenRCT2 RCT1 sprites: fixed the native loader ignoring the resolved RCT1
  data path when saved config is empty. Eight compiled cases, an old-source
  negative control, the full Wasm build/package suite and exact 19-file HTTP
  checks pass. Actual Chrome candidate 32937 starts Forest Frontiers without
  the fallback warning; its native save survives full page reload and resumes.
  RCT2 Electric Fields also survives save/reload with a newly built carousel,
  entrance/exit, connected queue/paths and exact cash/guests/date. Customers
  board and complete trips; the restored ride rotates with guests aboard.
  Asset pack, framework, private installation and live 8026 are unchanged.
  Desktop-picker/construction diagnostics, audio listening, wider park tests
  and live promotion remain open. See the [native repair checkpoint](openrct2-wasm/proofs/RCT1-SPRITE-PATH-2026-09-05.md).

- OpenRCT2 private scenery: repaired private `.parkobj` files being mounted
  outside the native object index. A separate hash-checked supplement supplies
  the 22 objects excluded from Debian's package; all 2,953 original owner files
  remain unchanged. Paired actual Chrome with identical data reproduces missing
  objects in the old path and completes 2,506-object/143-scenario indexing with
  none in the repaired path. Tests, exact native/public byte checks and private
  boundaries pass. Forest Frontiers starts and pauses, but exposes a separate
  RCT1 sprite-loader/config-path disagreement; full RCT1 graphics, audio and
  live promotion remain open. See the [object repair and next native fix](openrct2-wasm/proofs/RCT1-OBJECTS-2026-09-05.md).

- OpenRCT2/RCT2: actual Chrome on live 8026 starts Electric Fields through
  the RCT2 scenario menu, places a merry-go-round, accepts a unique typed save
  name and restores the ride/park after a full page reload. The existing entry
  already provides RCT2; corrected the stale README request. An isolated 32934
  framework refresh preserves all native bytes and passes exact 19-file/HTTP,
  privacy, range/isolation, audio/cache and Wasm checks. Candidate construction
  and filename entry work; its own park/ride also survives full page reload.
  Missing scenery-object indexing warnings, audible
  playback, longer park management and live promotion remain open. See the
  [RCT2 checkpoint](openrct2-wasm/proofs/RCT2-CHROME-2026-09-05.md).

- GoldSource saves/menu hints: actual Chrome verifies Blue Shift's native-menu
  save survives a full page reload with preview and textured world restored;
  F6/F7 quick-save/load also work. Fixed the native save menu querying obsolete
  binding names and falsely showing KEY NOT FOUND. Ten compiled cases, an
  old-expression negative control, full tests and exact package checks pass.
  Chrome shows correct F6/F7 hints in local candidate 32932. Engine/renderers,
  persistence, owner data and live services are unchanged. Capture, other-game
  saves and extended campaigns remain open. See the
  [save/menu checkpoint](goldsource-wasm/proofs/GOLDSOURCE-SAVES-2026-09-05.md).

- GoldSource expansion load times: fixed the owner packager's compressed WAD
  texture archives, which forced repeated decompression on native texture
  seeks. Actual Chrome native map-start timing improves Blue Shift 19 → 1 sec
  and Opposing Force 15 → 1 sec (about 3 sec through resource completion);
  a fresh original-data Blue Shift run again takes 19 sec. Both scenes render.
  Five packaging/staging tests, all 10,174 payload comparisons, exact non-WAD
  compressed streams, 26 unchanged browser/package files and four owner-data
  readiness checks pass. A matched local image/private data pair is retained
  at 32931; original owner data, live services and native binaries are unchanged.
  Capture, extended campaign/save/audio tests and live promotion remain open.
  See the [load-time checkpoint](goldsource-wasm/proofs/GOLDSOURCE-STORED-WAD-2026-09-05.md).

- GoldSource normal campaign/capture follow-up: actual Chrome advances
  Half-Life through four tram maps without time acceleration. Reproduced and
  fixed overlapping asynchronous pointer-lock requests in the shared shell,
  plus loading overlays hiding the canvas while native capture intent is
  active. Negative regression cases and both full test suites pass; isolated
  candidate package checks preserve all 13 native/support artifacts. Browser
  checks also show normal Blue Shift tram and Opposing Force helicopter scenes,
  but their initial map loads take roughly 19/15 seconds; nested compressed
  WAD seeks are a concrete, still-unprofiled performance lead. Capture still
  fails in the candidate even with a visible canvas. Live services, RTCW and
  deferred Blood work are unchanged. See the
  [capture/campaign checkpoint](goldsource-wasm/proofs/GOLDSOURCE-CAPTURE-CAMPAIGNS-2026-09-05.md).

- Counter-Strike Chrome follow-up: actual live Dust II join, nine-bot/native
  player roster, team selection and first-person spawn now verified. A separate
  four-bot host supports Chrome join, shutdown detection and a fresh connection
  after restart. Fixed explicit `server=` failures silently falling back to
  another host: 27 exact-method cases and the old-policy negative control pass;
  Chrome confirms the selected-host error and successful retry once it returns.
  Candidate/native/framework byte checks pass; live services are unchanged.
  Sustained capture/mouse look, audible playback, seamless same-engine transport
  reconnection, recoverable DLL/GL/decal warnings and the historical model
  overflow cause remain open. See the
  [Chrome checkpoint](goldsource-wasm/proofs/COUNTER-STRIKE-CHROME-2026-09-05.md).

- id Tech 4 Ctrl/Alt input: the shared browser adapter discarded a modifier's
  own keydown, including Doom 3's default Ctrl fire binding. Fixed while
  retaining browser shortcuts; 402 new cases across six variants and an old-guard
  negative control pass. Actual Chrome delivers both edges and Ctrl invokes
  native spectator follow. Local v6 has nine checked image files and passes
  all 47 packaged checks; production/live services and engine binaries unchanged.
  See [modifier-key proof](idtech4-wasm/proofs/IDTECH4-MODIFIER-KEYS-2026-09-05.md).
  [Delta's direct/roundtrip comparison](idtech4-wasm/proofs/D3-DELTA-DIAGNOSTIC-2026-09-05.md)
  finds textured fresh loading but leaves strict renderer acceptance open:
  camera/respawn, intended death fade and raised free spectator views must be
  separated from missing lighting. No speculative renderer workaround applied.

- Doom 3 bot voting: bots were counted as waiting voters but never cast votes,
  preventing a two-human majority in a two-bot match. Excluding actual bots
  from eligibility/quorum passes 16,258 exact-method checks per native/Wasm
  target, preserves non-bot behavior and reproduces the old failure. Both game
  builds, fresh source reconstruction and 47 packaged v4 checks pass. Real
  Chrome's native map vote passes and rejoins Delta Lab with both bots, but its
  post-transition rendering is largely dark/missing. Fixed a separately
  reproduced stale API map field in v5 (40 method/47 package checks); another
  real Chrome vote verifies corrected API/native map agreement, same process
  and healthy human/bots. Rendering diagnosis remains open; temporary shadow
  and spectator settings were restored before normal disconnect. See the
  [voting checkpoint](idtech4-wasm/proofs/D3-SABOT-VOTING-2026-09-05.md).

- Doom 3 automatic bot population: an isolated v3 package now maintains two
  bots and yields capacity to humans. Eight real Chrome clients reach gameplay;
  six/seven/eight humans report two/one/zero bots with healthy status. Exact
  snapshot and population methods pass 59,797/2,214 checks per native/Wasm
  target with sanitizers, automatic five-map native cycling passes without
  `addBots`, and 47 packaged lifecycle checks pass. Normal departures restore
  one/two bots with the remaining clients still in gameplay. Production/live
  services remain unchanged; managed map changes, full controls,
  browser malformed-packet recovery and campaign/save regression remain open.
  See the [population checkpoint](idtech4-wasm/proofs/D3-SABOT-POPULATION-2026-09-05.md).

- Doom 3 browser bots: matching 144-class native/Wasm pair now supports two
  actual Chrome humans and two bots, with bot-on-bot and bot-on-human kills in
  both browser logs. A separate self-contained local image passes 42 packaged
  readiness/auth/lifecycle checks, 26 bounded telemetry tests and 8 MP-only
  asset/SP-RoE isolation checks. Fresh source reconstruction matches exactly.
  Fixed a silently skipped packaging patch with stage and image hash checks.
  The newer population checkpoint above supersedes capacity and malformed
  fixture gaps. Direct visuals/held controls, browser malformed-packet recovery
  and fresh campaign/save regression remain open; live services are unchanged.
  See the [browser bot checkpoint](idtech4-wasm/proofs/D3-SABOT-BROWSER-2026-09-05.md).

- Doom 3 bot prototype: ported pinned SABot into a separate native build and
  fixed spawn-order and match-restart AI loss. Both real bots navigate and
  acquire weapons on all five stock DM maps; native kill/score evidence exists
  on three, with respawning in the 90-second d3dm1 run. Navigation ownership
  and compatibility fixes are preserved in a checksum-locked reproducible
  patch. Those native-only runs did not establish browser wire/class parity,
  MP-only assets or mixed human/bot lifecycle; the browser follow-up above
  supplies that narrower integration evidence. The accepted human-only
  candidate and production sources/packages are unchanged. See the
  [bot checkpoint](idtech4-wasm/proofs/D3-SABOT-NATIVE-2026-09-05.md).

- Doom 3 MP integration: normal Play now wakes a provisioned managed native
  deathmatch server and autoconnects through the authenticated datagram relay.
  Restoring the missing `idTestModel` class fixes a first-snapshot player-as-AI
  crash; all 142 wire IDs match. Two isolated Chrome clients join the textured
  map with pistol/HUD, and native reconnect succeeds while the other stays
  connected. Packaged lifecycle checks pass. Native disconnect's lingering
  relay peer and overlapping save-sync callbacks are also repaired with
  negative controls. Final Chrome verifies both disconnects releasing peers,
  idle sleep removing the native child/session, and reconnect waking a new
  server and returning to the world without the sync-overlap warning. Both
  clients rebuild, exact patches and full staging pass. Bots, held controls,
  capture/combat and broader acceptance remain open; live services are unchanged.
  See the [integration checkpoint](idtech4-wasm/proofs/D3-MANAGED-CHROME-2026-09-05.md).

- Quake 4 border-driver follow-up: the unchanged sampling oracle fails 14/128
  cases on container Mesa 25.2.8 llvmpipe but passes 128/128 on host AMD/Mesa
  26.1.6. No tests or shaders were relaxed. Software-driver parity remains open;
  host staging success does not close it. See the
  [driver checkpoint](idtech4-wasm/proofs/QUAKE4-BORDER-DRIVERS-2026-09-05.md).

- DOSBox input follow-up: 70 actual DOS BIOS keyboard cases pass both current
  staged and exact live Jill/Jazz binaries. Chrome reaches Jill's normal map
  without the reported Left-arrow modal, but short taps show no displacement;
  Jazz menu navigation/text entry remains unaccepted. An independent trusted
  DOM control measures 1–2 ms taps, not held keys. Exact-live native Jill tests
  visibly move right to the gem gate and left away from it. No Chrome movement
  claim or timing workaround is made. Refreshing a stale staged shared-shell
  copy restores the complete no-build package gate; native/live images are
  unchanged. The existing WASD launcher promise still needs a movement/text
  policy because the explicit keyboard queue preserves letters. See the
  [input checkpoint](dosbox-wasm/proofs/INPUT-2026-09-05.md).

- Source-note preservation: removed eight more recursive Markdown-deletion
  paths from source preparation, including WolfET's exit trap. Nine scripts
  pass deletion/syntax guards; two actual disposable DOSBox preparations
  preserve four edited/untouched/nested note fixtures, with an old-deletion
  negative control. Existing deleted notes were not blindly restored. See the
  [preservation checkpoint](proofs/SOURCE-NOTES-2026-09-05.md).

- Wolf3D/Spear menu input: repaired hidden browser cursor policy, ignored
  native row-menu clicks and quick Escape presses lost in the SDL event pump.
  Wolf3D episode subtitles now share the title's hit box, including Episode 6.
  All 80 native pointer/movement/menu-key checks pass, with negative controls;
  both clients rebuild, three exact patches, adapter/package and both HTTP
  checks pass. Isolated Chrome verifies mouse-driven first-level startup and
  Escape pause/mouse resume in both games. Caption-aware final-package checks
  are recorded in the [menu checkpoint](wolf3d-wasm/proofs/MENU-POINTER-2026-09-05.md).
  Non-row dialogs, gameplay capture, held controls, saves and extended play
  remain open; live services are unchanged. Source preparation also no longer
  deletes upstream/user Markdown files.

- Doom 3/RoE input: shared uppercase letter identity and browser-only Home
  substitution in native Escape routing are repaired. All 52 real-SDL input
  cases and 35 session cases pass; both clients rebuild, exact patches and full
  staging pass. Chrome confirms normal intros through first-person Doom 3 Mars
  City and RoE Ancient Ruins. Upper/lowercase W execute the same native binding,
  restored to `_forward`; Escape pause/resume and Shift+Escape console routing
  pass in both clients. Mouse capture, held-key movement and broader campaign/
  save acceptance remain open. Live services remain unchanged. See the
  [input checkpoint](idtech4-wasm/proofs/D3-LETTER-INPUT-2026-09-05.md).

- Prey menu/input follow-up: startup sound/font packs now load before the menu;
  a bounded 1 MiB worker cache avoids repeated tiny archive reads. All 65 cache
  checks and 43 real-SDL keyboard/text cases pass, with negative controls.
  Chrome verifies real menu score, startup console, normal Roadhouse intro/world
  and unchanged pack checksums. Native initialization is about 1.88 s versus
  6.21 s in the preceding observed run; the two deferred packs mount in 0.29 s.
  Upper/lowercase W execute the same native binding; its original `_forward`
  binding is restored and queried. Held-key movement, mouse capture and audible
  listening remain open. Live services are unchanged. See the
  [menu/cache checkpoint](idtech4-wasm/proofs/PREY-MENU-CACHE-2026-09-05.md).

- Prey intro/audio: native Chrome script diagnostics place the black-screen
  stall at the first Roadhouse `waitForSilence`, while game time advances.
  The worker's unavailable OpenAL device leaves that callback waiting forever.
  A real worker-to-page audio bridge now builds into Prey and passes SDK-negative/
  bridge-positive Wasm device, PCM, queue/control and natural voice-completion
  checks. The shared adapter's Prey receiver passes the six-variant suite.
  Full client rebuild, four exact patch trees and staging pass. Deferred archive
  declaration discovery/default adoption and image/sample retry repair eight
  more failing regressions, with all 46 native cases passing. Packaged Chrome
  confirms real intro OGG paths/durations, normal visible bathroom, automatic
  console recovery and pause/resume. No script or view-effect bypass is shipped.
  Sustained movement, mouse capture, audible listening and pre-mount menu audio
  remain open; quick browser key taps do not establish working movement.
  See the [audio/intro checkpoint](idtech4-wasm/proofs/PREY-AUDIO-INTRO-2026-09-05.md).
- id Tech 4 image diagnostics: native Prey draw statistics expose missing
  GL_RGBA accounting, shared with Doom 3/RoE. Both sources are repaired and
  all 46 CPU cases pass. Chrome then exposes a second Prey-only default-texture
  aliasing bug: missing images have format zero and can delete each other's
  shared fallback. Normal per-image ownership repairs seven failing cases;
  all 11 GLES-backed checks pass. The rebuilt isolated candidate passes four
  exact patch trees and full staging. Chrome now runs native draw statistics
  without either crash. Reloading textures restores console text, not the
  world. Temporarily bypassing view effects reveals lit, textured Roadhouse
  geometry; restoring effects makes it black again. Defaults are verified and
  gameplay paused. The actual effect/intro-state fix and automatic recovery of
  early missing textures remain open; no bypass is shipped.
  See the [image checkpoint](idtech4-wasm/proofs/D3-IMAGE-ACCOUNTING-2026-09-05.md).
- Prey Roadhouse: native New Game → Normal reproduces the black canvas, but
  new bounded post-load traces show all four following frames completing through
  session, frontend and backend. The earlier second-frame-hang diagnosis is
  not reproduced. Escape exposes an empty SDL keymap in the direct worker
  renderer: a browser-only fallback repairs 34 failing key cases, with all 37
  real-SDL Wasm cases passing. Native rebuild, four exact patch trees and full
  staging pass. Isolated Chrome verifies submenu Escape, gameplay pause/resume
  and Enter executing a native console command without unmapped-key warnings.
  The black scene, sustained controls and disabled audio remain open. See the
  [Roadhouse checkpoint](idtech4-wasm/proofs/PREY-ROADHOUSE-2026-09-05.md).
- Quake 4 campaign startup: traced `ChoiceVals` to the browser OpenAL bridge's
  unterminated device list. The old actual engine reproduces bogus-device
  enumeration and a GUI lexer error; the repaired engine accepts the correct
  choices. Enabled and verified C++ catching/destructor unwinding across the
  actual main/side-module runtime, with full SP/MP builds and regression tests.
  Chrome now passes the old parser crash and schedules actual menu audio.
  Repaired the blocking Continue loop, missing keyboard queue routing and
  absent simulation-clock driver. Chrome shows the native Continue screen,
  accepts Enter and renders an advancing opening cinematic, with 23 WebAudio
  starts. A no-skip repro identifies a null ARB shadow-parameter call in
  `RB_T_Shadow`. Repaired shadow generation/drawing capability selection and
  moved browser MD5R models onto the existing CPU-skinned silhouette path.
  Negative/positive actual-native geometry tests pass; Chrome now completes
  the natural intro into a visible first-person pistol/HUD without crashing.
  The world remains mostly black, unchanged by a temporary shadow-off test;
  native graphics diagnostics report invalid operations/values each frame.
  Traced malformed ambient shaders to the SDK's cube sampler/coordinates and
  matrix-expression hoist; repaired the generated code at build time. All 24
  real-driver shader regressions pass (20 failed in the old artifact), and
  Chrome no longer reports the shader/program/attribute errors in the restored
  first-person scene. Save restore across reload passes. Native texture
  conversion now preserves legacy lookup/font/normal semantics and thin DXT
  uploads: all 20 linked-engine cases pass (18 failed before). Chrome confirms
  corrected menu/weapon/HUD colors and no corresponding color-upload errors.
  The world stays black with flat normals; a geometry-debug pass produces
  filled white geometry. Diagnostic settings were restored. Depth allocation,
  border-clamp and framebuffer-copy errors remain. A subsequent sized-depth
  allocation repair passes 23 image regressions and removes the depth
  allocation errors in Chrome. The depth-tested geometry-debug pass also
  renders filled white geometry; normal rendering is restored, still black.
  A framebuffer-copy repair now preserves HDR storage and resolves MSAA using
  matching source formats/coordinates. All 32 native image/copy cases pass;
  Chrome verifies SDR/HDR copies and removes the game's copy/blit errors.
  Saved-scene restore still passes, but the world remains black. Border-clamp
  semantics and world lighting remain open. Synthetic depth comparisons pass
  without a production position-shader change; they are not campaign proof.
  A subsequent depth-pass trace exposes stale SDK vertex attribute bindings.
  The native regression fails five cases before repair and passes all ten
  after, retaining unchanged-draw caching. Chrome now renders textured world
  geometry with normal depth testing in the same saved scene; the depth pass
  uses 77 distinct buffers instead of 13. The normal package without diagnostic
  wrappers also restores and renders that world. Border semantics, dark areas/apparent
  geometry gaps and wider campaign/control acceptance still need checking.
  The next shader comparison finds missing ambient-light handling and divergent
  stock/specular equations. A faithful GLSL ES port of the shipped material
  shaders matches all 128 real-GPU lighting/control cases (116 differed before),
  while depth and native regressions remain green. After old-tab control
  timeouts, a fresh Chrome tab restores the comparison save at 183681.1 ms:
  textured terrain/walls/rocks and the weapon/HUD render, with no worker errors.
  Escape pauses successfully. The limited draw sample uses stock point lights;
  ambient/control coverage is native GPU evidence, not Chrome coverage.
  Dark areas, apparent geometry gaps and border errors remain. A plugin-wide
  failure was not established and no reinstall was needed. The normal immutable
  package then restores the save at 188524.5 ms with visible textured world and
  weapon/HUD, no worker errors and zero diagnostic records; Escape pauses.
  A native desktop reference shows that the central rock opening is expected,
  while the bright sky/distant scenery are missing in Chrome. The SDK loses
  per-array VBO bindings for the sky's separate vertex/coordinate streams.
  A repair passes seven split-buffer cases (four of five original cases fail
  before), plus existing native and package regressions. The normal candidate
  now renders bright cloudy sky, distant scenery and aircraft in Chrome; the
  sky remains visible while mouse-look changes yaw. Escape pauses without
  worker errors. Short keypresses are not sustained-movement acceptance.
  Border sampling and automatic capture remain open. A later handoff request
  asks for a Chrome extension update; captured sky evidence remains valid.
  Rendering/gameplay acceptance remains open. No live service changed.
  See the [campaign repair checkpoint](idtech4-wasm/proofs/QUAKE4-CAMPAIGN-2026-09-05.md).
  Border follow-up adds a real desktop-GL/GLES oracle: an isotropic-only sampler
  prototype passes 128 cases per API within one channel value, including mips
  and projected coordinates. The 8x anisotropic gate fails 30/128 cases, so the
  prototype is not installed and no filtering setting is reduced. See the
  [border checkpoint](idtech4-wasm/proofs/QUAKE4-BORDER-2026-09-05.md).
  The follow-up implements a multi-tap anisotropic prototype: all 16 settings
  pass 4,096 desktop/GLES same-footprint border comparisons. Vendor-kernel pixel
  differences remain disclosed, not claimed as exact parity. Shader conversion
  passes generated/material linking, unchanged-lighting and depth regressions.
  A subsequent integration updates the canonical patch and rebuilds a separate
  border candidate: 91 linked image/sampler/framebuffer cases, six native API
  paths, 40 desktop format cases and the 4,096 packaged-converter GPU comparisons
  pass, along with prior renderer/audio/save/package regressions. The candidate
  image is built but unlaunched; the running sky candidate is unchanged.
  Broader shader coverage and Chrome campaign quality/performance/control checks
  remain open. See the border checkpoint's integrated-build section.
  Chrome control subsequently recovers. The first border image fails startup
  on GLSL 130; a full 33-pair shipped shader inventory also exposes sampler
  parameters, MRT outputs and SDK normal-matrix handling. These are repaired
  in a separate rebuilt candidate: all 33 packaged pairs, 12 targeted shader
  cases, normal-matrix uploads, 91 image cases and 4,096 GPU border comparisons
  pass. Full staging passes. Chrome completes a fresh natural intro into
  textured first-person world/sky/weapon/HUD without worker exceptions; native
  pause/resume preserves rendering. The capture click instead opens pause,
  leaving capture, sustained movement/firing, performance and wider campaign
  acceptance open. Browser proof and screenshot are saved. The failed image
  and known-good sky candidate are retained; live services remain untouched.
  Capture follow-up repairs missing native input-mode/resume reporting,
  distinguishes root pause from submenus/console/Continue, and defers capture
  until native gameplay acknowledges the user gesture. All 24 new native
  state cases and the six-variant adapter suite pass, with negative controls;
  complete staging passes. Chrome verifies root/submenu resume intent and menu
  Escape back versus actual gameplay resume. A follow-up removes an overly
  strict activation check, with a failing initial-image regression and passing
  six-variant suite. An independent engine-free control receives Chrome's
  `WrongDocumentError` for both immediate and delayed trusted capture clicks,
  despite DOM focus/activation. Capture remains unaccepted; that browser-context
  failure is not attributed solely to Quake 4. Corrupted save-preview thumbnails
  are a separate open readback issue. Chrome also exposes cinematic console
  Escape resuming gameplay versus ordinary Escape opening pause; the adapter
  now handles both through native acknowledgement, with another negative/
  positive regression and fully staged isolated image. Final Chrome checks
  verify both branches and Continue, with exactly-once post-acknowledgement
  requests; browser lock itself is still denied. No live service changed. See the
  [capture checkpoint](idtech4-wasm/proofs/QUAKE4-CAPTURE-2026-09-05.md).
  Save-preview follow-up reproduces fresh thumbnail corruption and identifies
  unsupported RGB readback. Browser-only RGBA readback/packed RGB tile output
  passes 60 actual GLES cases (all fail before), preserving the three desktop
  controls and pack/PBO state. The native repair is rebuilt; four exact patch
  trees and full staging pass. Chrome verifies a correct fresh thumbnail,
  persistence after page reload, and native restore to the first-person world.
  Existing corrupt preview files are not regenerated; pointer capture and
  sustained-control acceptance remain open.
  See the [readback checkpoint](idtech4-wasm/proofs/QUAKE4-READBACK-2026-09-05.md).
- id Tech 1 Classic managed bots: installed two real native clients for all
  seven Original/Smooth deathmatches, with an eight-second human-join grace,
  native network audio, late/stale-match rejection and complete process cleanup.
  Fourteen real Chrome joins render the correct three-player matches and start
  WebAudio; click capture and Escape release pass. Native Original/Smooth joins,
  two-human admission, failed-start cleanup, bot/relay recovery and 32 SP cases
  pass. The final one-minute bot combat matrix passes 6/7; Doom's same binary
  passes a three-minute frag/respawn follow-up. That shorter failure is retained.
  Actual installed Doom II Chrome firing consumes ammo and renders a muzzle
  flash. Only idtech1 changed; 31 other services and owner data are preserved.
  Automatic capture, sustained keyboard controls, listening and longer/more-map
  acceptance remain open. See the [managed checkpoint](idtech1-wasm/proofs/CLASSIC-MANAGED-2026-09-05.md).
- id Tech 1 Classic bots: implemented an isolated native-client prototype
  preserving the existing browser engines and synchronized command protocol.
  All seven first maps pass one-minute two-bot movement/attack/health smoke
  tests after fixes for doors, prop overlap and stalled pursuits. The unchanged
  Wasm Original/Smooth matrix passes 13/14 at one minute; Heretic Smooth passes
  a separate two-minute follow-up with the same binaries. The initial failure
  is retained. No deployment:
  managed lifecycle, two-human lobby policy, network audio and Chrome bot
  acceptance remain open. The 32-case single-player regression matrix passes.
  See the [native bot checkpoint](idtech1-wasm/proofs/CLASSIC-BOTS-2026-09-05.md).

## Fix progress — 2026-09-04

- id Tech 1 Original/Smooth Chrome: extended the duplicate-input repair to all
  profiles. All seven titles now pass native New Game into their actual first
  levels, rendering, physical firing and capture/Escape-release checks in both
  classic profiles. Real WebAudio suspended-to-running transitions are recorded
  for all fourteen cases. DSDA Doom also passes rendering, mouse turn/fire and
  cursor/capture checks; one very brief menu click was missed, while a held
  click works. Modernized Doom II's two-bot match still works on this adapter.
  Classic lobby waiting is confirmed: Space manually starts an empty solo
  match, but no bots exist and classic network audio is disabled. Those remain
  open, as do sustained keyboard movement, listening, fullscreen and campaign
  acceptance. Only the idtech1 adapter changed; all other service IDs, native
  artifacts and owner data are preserved. See the [classic Chrome checkpoint](idtech1-wasm/proofs/CLASSIC-CHROME-2026-09-04.md).
- id Tech 1 Chrome: fixed duplicate physical input found during browser
  testing (one click skipped two native menus). Installed an adapter-only
  repair and verified single-step menu selection/back navigation. All seven
  Modernized titles now render their own two-bot matches in real Chrome, with
  mouse fire, click capture, Escape release and progressing native audio.
  Real WebAudio scheduling is verified, not audible listening. Automatic
  join/resume capture, sustained keyboard movement, fullscreen, Classic bots
  and other profile acceptance remain open. Native engines/framework, saves
  and 31 other services are unchanged. See the [Chrome checkpoint](idtech1-wasm/proofs/MODERNIZED-CHROME-2026-09-04.md).
- Blood crash: not reproduced in eight live-native first-level pitchfork
  cases, eight equivalent instrumented cases, or the 34-case weapon matrix.
  Source preparation now preserves Markdown; the broken prepared Git object
  reference was recovered without changing code or the live image. The user
  identified the starting pitchfork and asked to defer further reproduction
  until their repro tomorrow. The crash stays open; these are native tests,
  not Chrome acceptance. See the [firing checkpoint](build-wasm/proofs/BLOOD-FIRING-2026-09-04.md).
- Chrome reopening was explicitly approved and the connection is restored.
  Earlier notes below about pending browser-reopening approval are superseded;
  actual browser acceptance remains title-specific.

- id Tech 1 Modernized audio: installed native OPL music and an SDL/WebAudio
  effect mixer, with WAV/FLAC/Ogg decoding and bounded voice/queue handling.
  The previous client reproduces silence in Doom II, Heretic, and Hexen.
  The final image passes 25 native cases across all seven titles, separate
  music/effects, mute/disabled output, suspended-start recovery, and three
  30-second sustained runs. Native codec, source reconstruction, static, and
  pre/post image audits pass. Live bytes match the tested artifacts; only
  Zandronum JS/Wasm and audio notices changed, preserving the other 31 services
  and all owner data. `NO_SOUND=ON` still excludes desktop dependencies, but
  the new `BROWSER_SOUND` backend supplies browser audio. Chrome is closed and
  reopening approval is pending: audible playback and actual browser controls
  remain unaccepted. Classic bots and the wider checklist remain open. See the
  [Modernized audio checkpoint](idtech1-wasm/proofs/MODERNIZED-AUDIO-2026-09-04.md).
- id Tech 1 Modernized menus: installed profile-specific shell cursor policy
  (DSDA browser cursor, Zandronum native cursor, classic none), corrected native
  menu/console state reporting, and added capture-loss main-menu recovery with
  refreshed input routing. The old client reproduces the menu-state defect in
  all seven titles; the final image's served Wasm passes all seven native
  menu/console, join, movement, firing, and lifecycle cases. Full framework,
  adapter/static, exact source reconstruction, and pre/post image audits pass.
  Only idtech1 changed; classic/DSDA engines, servers, owner data, and 31 other
  services (including RTCW) are preserved. Actual Chrome cursor/capture
  acceptance still needs approval to reopen Chrome. Classic bots remain open;
  the later audio checkpoint above supersedes the silent-client limitation.
  See the
  [Modernized menu checkpoint](idtech1-wasm/proofs/MODERNIZED-MENUS-2026-09-04.md).
- id Tech 1 deathmatch selection: corrected reuse of a running server with the
  wrong engine/IWAD. Selection now reserves and validates a match, preserves
  connected players, and rejects stale relay URLs. The old image reproduces a
  Heretic request returning Doom. All seven Modernized titles now pass real
  native-Wasm multiplayer joins with two bots, movement and firing, plus
  lifecycle/admission tests against the final image. Installed only idtech1;
  all engine artifacts (including the classic startup repair), framework, owner
  data, and other service IDs are preserved. Chrome retesting, Modernized
  cursor/capture and classic solo-with-bots remain open. The later audio
  checkpoint above supersedes the null sound renderer in this older build.
  See the
  [match-selection checkpoint](idtech1-wasm/proofs/MATCH-SELECTION-2026-09-04.md).
- id Tech 1 Original/Smooth: fixed an OPL initialization deadlock that blocked
  browser mixer callbacks on the main thread. All three old engines reproduce
  it; the rebuilt engines pass 32 native startup/control/audio cases across all
  seven titles. Corrected classic DOS-scan-code config values with a backed-up,
  exact-fingerprint migration that preserves customized layouts. Native Q-turn
  negative/positive controls pass. Repaired source patch ordering and Markdown
  preservation; exact source reconstruction, adapter/package/HTTP checks, and
  lab image audits pass. Installed only the idtech1 service; Modernized engines,
  servers, framework, owner data, and other services are unchanged. Chrome
  acceptance and both deathmatch/cursor issue sets remain open. See the
  [classic startup checkpoint](idtech1-wasm/proofs/CLASSIC-STARTUP-2026-09-04.md).
- Quake II startup: fixed and installed in the three lab services. The native
  server runs as UID/GID 65534 from a disposable portable directory. Six
  integration cases passed: repeated base deathmatch wake and both expansion
  modes, native UDP map replies, and idle cleanup. Game-data permissions are
  unchanged. Full browser gameplay and bot verification remain pending.
- Blood/Duke3D mouse buttons: adapters now forward gameplay press/release;
  regression, package, and image HTTP checks pass. Both lab services were
  recreated. Browser firing and the reported Blood crash still need a
  connected browser.
- DOSBox input: corrected SDL 1.2 versus Emscripten key constants and added
  Backspace. A real DOS program now receives the expected BIOS key values.
  Nine installed-title launches and all native/adapter/package checks pass;
  the seven lab services have the rebuilt images. Gameplay retests remain.
  A subsequent NFS/SimCity-only mouse override disables desktop auto-lock and
  restores absolute coordinates at 100% sensitivity without rewriting saved
  configs. The native DOS mouse regression verifies three scaled positions and
  first-click press/release; full package checks and both installed-title launch
  checks pass. Rebuilt all ten images and deployed the two affected lab services.
  Chrome alignment and NFS race-start acceptance remain pending.
- GTA: corrected DOSBox's idle/yield accounting for automatic CPU cycles and
  seeded a missing first-run Sound Blaster 16 configuration without replacing
  saved sound choices. The real native Wasm now reaches the street scene and
  delivers non-silent PCM through the page audio handoff. Timing regression,
  all nine installed-title launch checks, adapter/package/HTTP tests, and exact
  patch reconstruction pass. Only the GTA lab service was updated; Chrome
  controls/performance/audio acceptance remains pending. See the
  [GTA repair checkpoint](dosbox-wasm/proofs/GTA-2026-09-04.md).
- NFS: the repaired DOS runtime reaches a City race through keyboard menus,
  shifts into gear and drives at 82–83 mph with advancing road graphics and
  non-silent native/page PCM in repeated native Wasm tests. A stronger optional
  race regression rejects menu-only runs and exited DOS programs. Updated only
  the NFS service; package/image checks and lab audits pass. Traced NFS's own
  relative cursor and added NFS-only captured input with acquisition-click
  suppression, single delivery and loss/release handling. Native mouse-driven
  Drive selection, racing, and Escape pause/Enter resume pass; browser capture,
  menu interaction, fullscreen and audio acceptance remain pending. The installed
  data also lacks the optional Ferrari showcase file. See the
  [NFS checkpoint](dosbox-wasm/proofs/NFS-2026-09-04.md) and
  [pointer repair](dosbox-wasm/proofs/NFS-POINTER-2026-09-04.md).
- Wolf3D/Spear: rebuilt from the current source patches, including the existing
  A/D strafe-only correction; both adapter and image checks pass, and the lab
  services now use those images. Menu/pointer verification remains.
- Quake III: rebuilt and installed the current pinned source. Fixed source
  preparation deleting lcc `.md` machine descriptions. The rebuilt service
  wakes and reports native bots. The [09-06 Chrome checkpoint](idtech3-wasm/proofs/QUAKE3-CHROME-2026-09-06.md)
  subsequently verifies first-click join and native pause/resume/disconnect;
  pointer capture remains open.
- RTCW: two independent source reconstructions produced commit `15d2a12d`
  and tree `7d2c9351`, not the historical `e9782a8d`/`256dd10d` lock. Corrected
  the derived lock while retaining the same upstream commit and 18 patches.
  Both images are rebuilt and installed; corrected missing MP framework image
  metadata. MP wakes on `mp_depot` and reports eight Omni-bots. Automated family
  tests and the lab image audit pass. Browser testing exposed a missing
  `com_sv_running` guard in the packet drain; new patch `0019` fixes the
  pre-menu memory trap in both clients. Patch `0020` replaces the SP renderer
  binding with GL4ES, pinned before its negative-origin viewport regression.
  The final reproducible source lock is `a22b0594` / tree `1c7e5009`.
  Rebuilt and installed both images. Chrome verified SP menus, both briefing
  transitions, the textured/lit intro, and first-person `escape1` rendering.
  Corrected stretched-canvas pointer mapping, which had shifted the briefing
  Continue button's hit area. A new manual save survived page reload and
  restored the level. Short W/S movement and knife animation checks passed;
  the user also confirmed the renderer looks good. Fixed delayed native
  menu-to-game capture timing; foreground Chrome verified Escape release/resume
  and save-load recapture. Sustained controls/combat and extended campaign
  testing remain.
  MP retained its existing renderer at this checkpoint; the
  [September 6 MP follow-up](idtech3-wasm/proofs/RTCW-MP-LIGHTMAP-2026-09-06.md)
  verifies live joining and repairs a separately reproduced lightmap defect.
  [Wwasm renderer comparison](idtech3-wasm/games/rtcw/RENDERER-REFERENCE.md)
  records the controlled comparisons, library pin, and browser evidence.
- GoldSource: corrected the Xash build to apply only Xash patches; it had
  attempted to apply the Opposing Force game-code patch to the engine tree.
  Native artifacts and the suite image are rebuilt and installed; adapter,
  package, and static HTTP tests pass. The current CS host is alive with bots; its
  historical MAX_MODELS crash is not considered fixed by that observation.
  Fixed the shared framework logger replacing selected text nodes and forcing
  readers to the bottom on every message. Selection now defers bounded output;
  clearing it flushes pending messages. The full framework suite passes, and
  the new regression rejects the previous logger. Installed this local framework
  development change only in GoldSource, keeping its exact release pin and
  engine artifacts unchanged. All four owner-data checks and pre/post image
  audits pass; other service IDs are unchanged. Chrome is currently closed:
  browser selection, mouse look, and BS/OF startup acceptance remain open.
  See the [GoldSource checkpoint](goldsource-wasm/proofs/REPAIR-2026-09-04.md).
- Counter-Strike host: reproduced the dead-match/live-bridge condition on an
  isolated host using native `host_error`. The rebuilt managed engine now exits
  after cleanup, the Go wrapper propagates the failure status, and Docker
  restarts it. Repeated native tests verify two recoveries, restored map/four-bot
  status, stable model counts across repeated maps, and deliberate stop/start.
  Deployed the host with nine bot connections. Moved signaling from Fetch-blocked
  4190 to 4192 in the launcher, adapter fallback, and lab shortcut/Compose mapping;
  a real Fetch/WebSocket smoke receives the native `v1:offer`. This does not prove
  that 4190 caused the original Chrome timeout. Only GoldSource and its CS host
  were replaced; lab audits and all four data gates pass. The historical
  `MAX_MODELS` initiating cause is still unproven, and browser join/reconnect
  acceptance remains. See the [CS host checkpoint](goldsource-wasm/proofs/COUNTER-STRIKE-2026-09-04.md).
- Quake 4: replaced the worker's no-audio OpenAL stub with PCM/source/queue
  forwarding to the existing page-owned WebAudio bridge. Native tests cover
  device/context state, PCM delivery, static/streaming source queries, repeated
  processed-buffer queries, pause/stop, and cleanup. Page-side playback,
  full SP/MP compilation, exact patch reconstruction, shader/artifact, worker,
  memory, and package checks pass. Corrected the GL procedure resolver,
  implemented two-texture immediate UV data, and changed capability/startup
  gates to validate the actual ES renderer without requiring ARB assembly.
  Real GLEW/SDK Wasm tests exercise those gates, including missing-function and
  insufficient-input rejection; the rebuilt SP/MP engine and exact patch trees
  pass. September 5 Chrome testing then exposed and fixed direct-context
  legacy initialization, aborting draw-buffer calls and uint32 index handling:
  the animated menu and campaign-selection screens now render in Chrome.
  Start Game still fails with a ChoiceVals newline parse error, followed by
  disabled exception-catching abort. The page-focus audio bridge is built and
  passes native/adapter/worker tests but has not been Chrome-verified after
  browser control timed out. Live images are unchanged; campaign and audio
  acceptance remain open. See the
  [latest Quake 4 checkpoint](idtech4-wasm/proofs/QUAKE4-2026-09-05.md).
- OpenRCT2: verified the active `/data` mount contains the combined RCT1/RCT2
  installation (2,953 files, `rct2-installation`, `Data/g1.dat`). The existing
  OpenRCT2 entry already supplies RCT2 content.
- Browser testing was initially blocked; Chrome became available later in the
  session. RTCW SP renderer acceptance is recorded above; other families still
  need the listed gameplay retests.

## P0 — hard blockers (game completely unplayable)

- [x] **idtech2:** q2ded refuses to run as root — server wake 500 (Quake II DM, Reckoning, Ground Zero)
- [x] **idtech1:** Chocolate/Crispy startup freeze; deathmatch never starts (no bots); Modernized cursor + DM console-only — repaired and first-map Chrome joins verified; remaining control/quality acceptance below
- [ ] **idtech3:** rebuild stale images (rtcw-sp, rtcw-mp, quake3) from current pinned source, then retest
- [ ] **idtech4 Quake 4 SP+MP:** startup/GLSL/audio initialization and observed gray intro geometry are repaired in isolated builds; portable sampling gates pass. Broader renderer/SP/MP gameplay, held controls/capture/listening and live promotion remain open; see the latest LOD and quad checkpoints above.
- [ ] **dosbox input:** arrows may be delivered as Escape (Jill 1-3, Duke 1-2, Jazz); Jazz text input dead
- [ ] **dosbox performance:** GTA ~1fps + no sound (confirmed on re-test); NFS game never starts (menu only)
- [x] **Duke3D:** left mouse click fires — both deployed profiles verified in Chrome on 18007, with visible ammo consumption.
- [ ] **Blood:** left mouse click is wired; final Chrome weapon/crash acceptance remains deferred with the user's crash repro request.
- [ ] **Blood:** crash after firing starting pitchfork — not reproduced; deferred at the user's request until their repro
- [ ] **pointer-lock lifecycle:** capture on gameplay start / menu close, release on Escape to main menu (idtech2, idtech3, goldsource, wolf3d)
- [ ] **goldsource:** no mouse look (HL/BS/OF); BS+OF slow startup regression; log text selection broken; rebuild stale image first
- [ ] **Counter-Strike:** MAX_MODELS limit exceeded crash killed the host game server; WebRTC bridge times out
- [x] **wolf3d + Spear menu/display:** cumulative A/D strafe-only, row-menu cursor/clicks, episode-caption hit boxes, fast menu keys, blank palette dialogs and stale screen clears are installed on 8011/8012. Native regressions and both candidates' Chrome dialogs/first-level movement/firing/pause/resume pass; broader acceptance is separate below.
- [ ] **dosbox mouse:** SimCity 2000 + NFS cursor renders offset from pointer
- [ ] **Prey:** isolated candidate verifies normal intro/world, real menu/voice media, startup console, upper/lowercase key identity and pause/resume. Bounded archive cache accelerates startup/mounting. Held-key movement, mouse capture, audible mix and broader campaign/save acceptance remain open.

## P1 — feature requests

- [ ] Rebuild remaining diagnostic images: cod2, source/HL2. GoldSource, Wolf3D, Spear and OpenRCT2 have scoped release records above; broader testing is separate.
- [x] **build-wasm:** requested Modernized profiles deployed for Blood + Duke3D: widescreen OpenGL and full mouse pitch/yaw (isolated Chrome), native save/reload checks and all four live first-level/profile-selection checks pass. Broader acceptance is tracked separately below.
- [x] **OpenRCT2:** verify RCT2 data in the active combined library (existing OpenRCT2 entry)
- [x] **RTCW SP:** hide the "Multiplayer" main-menu button on the SP entry (rebuilt menu pack verified in Chrome)
- [ ] **Doom 3 MP:** connect to a managed dedicated deathmatch server with bots (like WolfET) instead of the server browser

## P2 — verify after fixes

- [x] **wolf3d + Spear quick input:** preserve down/up presses through one gameplay sample; both normal cached origins now pass W movement and primary mouse fire. See the input release; actual browser capture is not claimed.
- [x] **wolf3d + Spear binding labels:** correct SDK special-key names and bounded fallbacks; both live labels pass, and isolated Wolf Fire rebinding/gameplay/restoration is Chrome-proven. Physical controllers and binding persistence are separate.
- [ ] **wolf3d + Spear:** binding persistence/additional binding types, confirmations, save/full-reload/load, capture/fullscreen (WrongDocumentError recorded; native grab is not real pointer lock), native launch-intent/Escape capture timing, held controls, audible mix and extended play; see current release evidence above.
- [ ] **build-wasm:** broader campaign/combat/renderer fidelity, held controls, pointer capture/fullscreen, audio listening and known SDK diagnostics; Blood weapon/crash acceptance stays deferred.
- [ ] Retest rebuilt images: wolf3d, spear, cod2, HL2, openrct2, goldsource, idtech3
- [x] Retest idtech1 first-map startup/rendered deathmatch: Doom II, TNT, Plutonia, Heretic, Hexen, Chex (Original/Smooth and Modernized DM)
- [ ] **idtech1:** automatic join/resume capture, sustained keyboard controls, audible listening, fullscreen and extended/multiple-map acceptance
- [ ] Retest DOSBox input after keymap fix: Jill 1-3, Jazz, Duke 1-2, Duke 2

## Done

- [x] Test all launchable games in the lab (session complete 2026-08-29)
- [x] Finalize GAME-LAB-TEST-ISSUES.md handoff doc
- [x] Retest sound on Modernized Doom, Wolf3D, WolfET (was a local Chrome mute)
- [x] Retest GTA (still broken — real issue) and NFS (starts now; new issues found)
- [x] Test Duke 2 (same issues as Duke 1) and Spear of Destiny (same as Wolf3D)
- [x] Start Doom 3 SP/MP services; Doom 3 SP passes, MP needs managed server
