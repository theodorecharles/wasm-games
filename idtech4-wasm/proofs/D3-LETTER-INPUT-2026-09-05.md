# Doom 3/RoE letter identity and Escape routing — 2026-09-05

Status: shared key export and Escape session dispatch repaired; all 52
actual-SDL Wasm cases, 35 session-routing cases and both client rebuilds pass.
Chrome confirms normal startup through first-person Mars City and RoE Ancient
Ruins, both letter cases reaching the same native binding, repaired Escape
pause/resume and Shift+Escape console behavior in both clients. Live services
are not replaced; capture, held-key movement and broader campaign acceptance
remain open.

The preceding [Prey menu/input checkpoint](PREY-MENU-CACHE-2026-09-05.md)
found uppercase gameplay key identity distinct from the ordinary lowercase
binding. Doom 3/RoE's shared export has the same issue: it forwards page
`event.key` directly as an SDL keycode. A Shift/Caps Lock change before release
can also make the down/up edges refer to different keys.

Unlike Prey, Doom 3 initializes `SDL_INIT_VIDEO`, which calls the SDK's
`SDL_KeyboardInit` before selecting the video driver. Non-text key mappings
therefore already work. No Prey-style fallback table is added here.

The browser export now normalizes ASCII letter key identities on both edges,
preserving layout characters and separate case-sensitive text events. Its
native Escape-to-resume branch is unchanged.

## Escape follow-up

The first Chrome run exposed a separate bug: physical Escape reached SDL but
did not open the gameplay pause menu. Native output reported unknown
`togglemenu`; physical Home did open the menu. The production browser branch
of `idSessionLocal::ProcessEvent` still substituted `K_HOME` for `K_ESCAPE`,
which the export-only fixture does not execute.

The session now uses the ordinary native Escape condition, including its
Shift guard, on both targets. `D3WASM_BrowserOpenMenu` synthesizes the same
Escape event for capture loss. Game-specific `HandleESC` replies still decide
whether to ignore/skip an event, supply a GUI, or open the menu; no cinematic
logic is bypassed.

- [Session negative](d3-session-legacy-2026-09-05.json): seven browser routing
  cases fail; all 15 desktop controls pass.
- [Session repaired](d3-session-native-2026-09-05.json): 20 browser and 15
  desktop cases pass. Exact production session/export bodies run with tracing
  game, console, GUI and binding dependencies. This is not a full console,
  SDL-to-session pipeline, capture or renderer test.
- `test-d3-session-events.mjs` gates both client builds and staging.
- [First Chrome run](d3-input-chrome-before-escape-2026-09-05.json) retains
  normal New Game → Marine → natural intro → Mars City Hangar, uppercase W
  and lowercase w each executing a temporary echo binding, and the failed
  Escape/working Home comparison. The original `w = _forward` was restored
  and queried. Held-key movement and pointer capture are not accepted.

## Repaired Doom 3 package in Chrome

[Build record](d3-escape-build-2026-09-05.json) pins isolated image
`sha256:dcad39d4ca3fa738ddd6387756709a14a1698e07d46e3ca30a04056a90f6951e`
and matching hashes for ten staged/image artifacts. Doom 3/RoE run on ports
32878/32879 with read-only owner archive binds; no live service is replaced.

[Doom 3 Chrome record](d3-escape-chrome-2026-09-05.json) confirms:

- Normal New Game → Marine → unskipped intro → visible first-person Mars
  City Hangar at 100 health. The intro GUI's `paused` state is not used as a
  pause-menu test. Native map loading takes 15,116 ms in this observed run.
- Physical Escape opens the native Save/Load/Return to Game menu at
  228,903.2 ms; another Escape resumes the world at 243,064 ms. No unknown
  `togglemenu` is emitted in this repaired run.
- Shift+Escape opens the console at 255,731.7 ms, rather than pausing to the
  root menu. Uppercase W and lowercase w execute the same temporary native
  echo binding; `w = _forward` is restored and queried.
- Final state is genuinely paused/menu, resumable, at 310,383.5 ms. Worker
  errors are empty. WebAudio is running, but audible listening is not tested.

[World screenshot](d3-escape-world-2026-09-05.jpg) and
[pause screenshot](d3-escape-pause-2026-09-05.jpg) retain the visual checks.
Pointer-lock requests still produce Chrome capture errors with `locked:false`;
this is not capture or held-key movement acceptance. Save/reload and extended
campaign acceptance are also outside this checkpoint.

## Resurrection of Evil in Chrome

[RoE Chrome record](roe-escape-chrome-2026-09-05.json) uses the same image's
expansion client, `WASM_GAME_VARIANT=roe`, and separate `/save/roe` persistence
namespace. Both owner d3xp packs mount with native checksums `0x3003a1eb` and
`0x38a5e7d5`; this is not the base campaign relabeled as RoE.

- Native expansion menu → New Game → Marine → `game/erebus1`, with an
  observed 21,685 ms native map load. The normal intro proceeds through the
  control room, excavation/artifact sequence and into first-person Ancient
  Ruins without skipping or console map/script overrides.
- The world, pistol (12/36 ammunition), radio display and 100-health HUD are
  visible. [Intro](roe-escape-intro-2026-09-05.jpg) and
  [first-person world](roe-escape-world-2026-09-05.jpg) screenshots are retained.
- Escape opens the real [pause menu](roe-escape-pause-2026-09-05.jpg) at
  363,972.1 ms; another Escape resumes gameplay at 377,233.6 ms. Shift+Escape
  opens the native console at 388,031.1 ms.
- Uppercase W and lowercase w each execute the same temporary native echo
  binding. The original `w = _forward` is restored and queried. Final state
  is paused/menu with resume available at 445,374.2 ms; worker errors are empty.

This is first-map startup/world and discrete native input acceptance, not
extended play. Pointer-lock requests fail here too. WebAudio is running but
audible listening is untested. The logs retain duplicate content/animation
warnings and an overlapping startup `FS.syncfs` warning; this checkpoint does
not establish that those warnings are harmless in later gameplay or saves.

- [Actual export negative](d3-input-case-legacy-2026-09-05.json): uppercase W/S,
  uppercase layout remapping and both mixed-case key-release cases fail; the
  non-text and Escape controls pass.
- [Repaired actual export](d3-input-case-native-2026-09-05.json): all 52 pass.
  The fixture compiles the production exports with real SDL2's event queue and
  exact keymap initializer. Session/console objects are fixtures for seven
  Escape states. It does not create a browser window or run a campaign.
- Both Doom 3 and RoE clients rebuild from their existing prepared trees;
  `test-d3-input.mjs` is now a `build-all.sh` gate. It shares the keyboard/text
  vectors with Prey's fixture while testing the actual Doom 3 export.

Canonical Doom 3/RoE engine patch:
`18d58a9b1fc01eae22fae1396b728015e5152273e1f849a7317df2f914b55059`.

No movement binding, owner archive, renderer setting, Prey or Quake 4 native
artifact is changed. Blood remains deferred and the user-confirmed RTCW
renderer is untouched.
