# Game Lab Test Issues — 2026-08-29

Full-portfolio browser test session of the WASM Game Lab, performed by the
owner. This document is the handoff for fix work.

## Context

- Portal: http://127.0.0.1:8080/ (Windows XP desktop, 45 shortcuts)
- Lab: `~/Development/wasm-game-lab` — Compose project `wasm-game-lab`,
  30/32 services running. Doom 3 SP (8086) and Doom 3 MP (18086) are
  intentionally stopped at handoff.
- Game data: `/home/ted/wasm-game-data`
- Source monorepo: `~/Development/wasm-games` (final commit `d498733`, 2026-08-21)
- Shared runtime: `~/Development/wasm-game-framework` (0.9.6 @ `ebb1ebe`)
- Start/stop: `WASM_GAME_LAB_APPLY=1 ./start.sh` / `./stop.sh` in the lab repo

## Executive summary

- **Pass (4):** WolfET, Doom 3 SP, Doom 3: Resurrection of Evil, OpenRCT2.
- **Fail (38):** every other launchable entry, including the whole id Tech 1
  suite (7 titles share one engine-level failure set).
- **Untested (1):** Doom 3 MP (service started 2026-08-29, awaiting test).
- **Not launchable, as designed (4):** NES, SNES, PS1, PS2 — catalog-only,
  `launchable: false`, no runtime images exist yet.
- **Resolved during the session:** all "no sound" reports (Modernized Doom,
  Wolf3D, WolfET) were a locally muted Chrome tab. Retested unmuted — sound
  works. Do not chase sound bugs in these three.

### Root causes already identified

1. **Quake II "Server wake failed with HTTP 500"** (Q2 DM, Reckoning,
   Ground Zero — SP *and* MP): the managed `q2ded` server refuses to start:
   `Quake II shouldn't be run as root! Backing out to save your ass.` →
   `exited code=1` → `state=failed`. Container runs as root; the server
   binary has a root check. Affects all three entries at once.
2. **Stale images.** Several running images predate the repo's final commit
   (2026-08-21). No newer local images exist under alternate tags — testing
   current code requires a rebuild. See "Image vintage" below.
3. **Quake 4 renderer abort (SP + MP):** openQ4's desktop-GL feature gate
   (`GL_ARB_multitexture`, `texture_env_combine/dot3`,
   `vertex/fragment_program` entry points) is fatal under WebGL2
   (browser reports GL 3.0 ES). Needs the d3wasm-style renderer path Doom 3
   uses, or ES-equivalent feature mapping. OpenAL also fails to init.
4. **DOSBox arrow keys may be delivered as Escape** (owner hypothesis, fits
   all symptoms): Jill 1-3 left arrow opens the pause modal; Duke 1 arrows
   open the menu and left/right movement is dead; Jazz menu navigation is
   dead. A single keymap bug in the DOSBox adapter would explain all three.
5. **Counter-Strike 1.6 bridge timeout:** the CS host's GoldSource server
   crashed on 2026-08-27 with `Host_Error: MAX_MODELS limit exceeded (4096)`
   → `Server was killed due to an error`. The container is still up and the
   bridge answers HTTP, but the game server is dead, so the browser's
   `ws://127.0.0.1:4190/websocket` connect times out.

## Image vintage

Repo final commit: **2026-08-21** (`d498733`).

| Image (as used by compose) | Built | Verdict |
|---|---|---|
| blood-wasm:dev | 2026-08-21 | current |
| duke3d-wasm:dev | 2026-08-21 | current |
| idtech1-wasm:dev | 2026-08-21 | current |
| dosbox-wasm:dev + jazz/duke1/duke2/gta1/nfs1/simcity2000-wasm:dev | 2026-08-21 | current |
| quake1/quake2/quake2-xatrix/quake2-rogue-wasm:dev | 2026-08-21 | current |
| local/idtech4-wasm:{doom3,doom3-mp,roe,quake4,quake4-mp,prey}-dev | 2026-08-21 | current |
| goldsource-wasm:dev | 2026-08-20 | **stale** (1 day) |
| wolf3d-wasm:dev, spear-wasm:dev | 2026-08-15 | **stale** |
| local/cod2-wasm:cod2-mp-dev | 2026-08-15 | **stale** |
| local/source-wasm:hl2-dev | 2026-08-15 | **stale** |
| openrct2-wasm:dev | 2026-08-15 | **stale** |
| idtech3-rtcw-sp-wasm:devel, idtech3-rtcw-mp-wasm:devel | 2026-08-15 | **stale** |
| idtech3-quake3-wasm:devel | 2026-08-14 | **stale** |
| wolfet (docker.io digest) | pinned digest | current by contract |

No newer images exist under alternate tags (checked `local/*` variants —
same vintages). Rebuild from the current pinned source to test current code.

## Results table

Status: `pass` / `fail` / `pending` / `n/a`

| # | Game | URL | Status | Issue |
|---|------|-----|--------|-------|
| 1 | Wolfenstein: Enemy Territory | http://127.0.0.1:8088/ | pass | production ready |
| 2 | Blood | http://127.0.0.1:8007/ | fail | mouse click not bound to fire (RCtrl fires); crash after firing; wants Modernized profile (widescreen, OpenGL, mouse look) |
| 3 | Duke Nukem 3D | http://127.0.0.1:18007/ | fail | mouse click not bound to fire (RCtrl fires); wants Modernized profile (widescreen, OpenGL, mouse look) |
| 4 | Quake | http://127.0.0.1:8081/ | fail | mouse not captured on game start (SP + MP); mouse not released on Escape to main menu; otherwise works good |
| 5 | Quake II | http://127.0.0.1:8082/ | fail | DM: "Server wake failed with HTTP 500."; SP: mouse not captured when Escape closes main menu; otherwise perfect |
| 6 | Quake II: The Reckoning | http://127.0.0.1:18082/ | fail | "Server wake failed with HTTP 500." on BOTH single and multiplayer; game does not work at all |
| 7 | Quake II: Ground Zero | http://127.0.0.1:28082/ | fail | "Server wake failed with HTTP 500." on BOTH single and multiplayer; game does not work at all (same as Reckoning) |
| 8 | Quake III Arena | http://127.0.0.1:8083/ | fail | first Join shows "arena sleeping" (race between server wake and join; second click works); mouse not captured on game start or when Escape closes in-game menu |
| 9 | RTCW Single Player | http://127.0.0.1:8085/ | fail | black areas in main menu; "Multiplayer" main-menu button should be hidden; opening cinematic renders dark/foggy/weird; after briefing load page the game never starts |
| 10 | RTCW Multiplayer | http://127.0.0.1:18085/ | fail | goes to server browser instead of starting the managed dedicated server; MP worked before — image is stale (built 08-15, repo updated 08-21) |
| 11 | Doom / Ultimate Doom | http://127.0.0.1:8010/?game=doom | fail | Chocolate: freezes on startup; Chocolate DM: lobby shows but no start, no bots; Crispy: same issues; Modernized: no mouse cursor in main menu, DM shows console only and never starts (sound OK on re-test) |
| 12 | Doom II | http://127.0.0.1:8010/?game=doom2 | fail | same suite-wide profile issues as Doom 1 (see row 11) |
| 13 | Final Doom: TNT | http://127.0.0.1:8010/?game=tnt | fail | same suite-wide profile issues as Doom 1 (see row 11) |
| 14 | Final Doom: Plutonia | http://127.0.0.1:8010/?game=plutonia | fail | same suite-wide profile issues as Doom 1 (see row 11) |
| 15 | Heretic | http://127.0.0.1:8010/?game=heretic | fail | same suite-wide profile issues as Doom 1 (see row 11) |
| 16 | Hexen | http://127.0.0.1:8010/?game=hexen | fail | same suite-wide profile issues as Doom 1 (see row 11) |
| 17 | Chex Quest | http://127.0.0.1:8010/?game=chex | fail | same suite-wide profile issues as Doom 1 (see row 11) |
| 18 | Wolfenstein 3D | http://127.0.0.1:8011/ | fail | no mouse cursor (maybe expected); menu system unusable; A/D bound to turn AND strafe at once (should be strafe only) (sound OK on re-test) |
| 19 | Spear of Destiny | http://127.0.0.1:8012/ | fail | confirmed same issues as Wolf3D (same engine): no mouse cursor, menu unusable, A/D turn+strafe |
| 20 | Doom 3 SP | http://127.0.0.1:8086/ | pass | works good (service was stopped at handoff; started 2026-08-29) |
| 21 | Doom 3 MP | http://127.0.0.1:18086/ | fail | shows the in-game server browser instead of connecting to a dedicated server; expected: managed dedicated deathmatch server with bots like WolfET |
| 22 | Doom 3: Resurrection of Evil | http://127.0.0.1:18087/ | pass | working good |
| 23 | Quake 4 SP | http://127.0.0.1:8084/ | fail | never starts: renderer aborts — browser exposes WebGL2 (GL 3.0 ES) but openQ4 requires desktop GL features (GL_ARB_multitexture, texture_env_combine/dot3, vertex/fragment program entry points); OpenAL device also fails to init (no sound) |
| 24 | Quake 4 MP | http://127.0.0.1:18084/ | fail | same renderer abort as Quake 4 SP (desktop GL feature gate fatal under WebGL2) |
| 25 | Prey (2006) | http://127.0.0.1:8087/ | fail | main menu shows; clicking New Game freezes (can't tell if loading very slowly or stuck) |
| 26 | Jill of the Jungle | http://127.0.0.1:8016/?game=jill1 | fail | left arrow does not move the player — it opens an in-game modal instead; unplayable; sound works |
| 27 | Jill Goes Underground | http://127.0.0.1:8016/?game=jill2 | fail | same issues as Jill 1 (left arrow opens modal instead of moving) |
| 28 | Jill Saves the Prince | http://127.0.0.1:8016/?game=jill3 | fail | same issues as Jill 1 (left arrow opens modal instead of moving) |
| 29 | Jazz Jackrabbit | http://127.0.0.1:8020/ | fail | menu system unusable (can't interact or change settings; unclear if mouse or keyboard expected); can't play — save prompt asks for a name but no text input works; game itself runs |
| 30 | Duke Nukem | http://127.0.0.1:8021/ | fail | cannot move left or right — only jump and fire work |
| 31 | Duke Nukem II | http://127.0.0.1:8022/ | fail | same issues as Duke 1 (cannot move left or right — only jump and fire work) |
| 32 | Grand Theft Auto (DOS Demo) | http://127.0.0.1:8023/ | fail | retest 2026-08-29: still the same — startup takes forever; game loads very slowly after Start Game; runs at ~1fps; can't move the character; no sound (confirmed on unmuted re-test, not the mute) |
| 33 | The Need for Speed | http://127.0.0.1:8024/ | fail | retest 2026-08-29: starts up now and plays with sound; mouse cursor is offset; only the menu system works — starting a game doesn't work |
| 34 | SimCity 2000 | http://127.0.0.1:8025/ | fail | takes forever to load; mouse cursor is offset (needs fixing); works okay otherwise, kinda slow |
| 35 | OpenRCT2 | http://127.0.0.1:8026/ | pass | works good; owner wants an RCT2 entry ("Open RCT 2") — verify RCT2 data in combined library or add a separate shortcut |
| 36 | Half-Life | http://127.0.0.1:8017/?game=half-life | fail | starts right up and works great, but no mouse look; clicking does not capture the mouse (nothing captures it) |
| 37 | Half-Life: Blue Shift | http://127.0.0.1:8017/?game=blue-shift | fail | used to work; now takes forever to start up; log errors can't be selected (text selection broken); game does start; same mouse issue as Half-Life |
| 38 | Half-Life: Opposing Force | http://127.0.0.1:8017/?game=opposing-force | fail | same issues as Blue Shift (slow startup, unselectable log errors, mouse issue) |
| 39 | Counter-Strike 1.6 | http://127.0.0.1:8017/?game=counter-strike&server=127.0.0.1:4190 | fail | "Timed out connecting to the GoldSource WebRTC bridge at ws://127.0.0.1:4190/websocket" — root cause: host game server crashed 2026-08-27 (MAX_MODELS limit exceeded) |
| 40 | Half-Life 2 | http://127.0.0.1:8019/ | fail | doesn't start; shows a stub menu instead of the game engine; image stale (built 08-15) |
| 41 | Call of Duty 2 MP | http://127.0.0.1:8014/ | fail | same as HL2 — stub menu instead of the game engine; image stale (built 08-15) |
| 42 | NES | n/a | n/a | not launchable — no runtime image (by design) |
| 43 | SNES | n/a | n/a | not launchable — no runtime image (by design) |
| 44 | PlayStation | n/a | n/a | not launchable — no runtime image (by design) |
| 45 | PlayStation 2 | n/a | n/a | not launchable — no runtime image (by design) |

## Issue log

### build-wasm (Blood 8007, Duke3D 18007) — image current (08-21)

**Blood:**
1. **Mouse click not bound to fire.** Firing currently requires right Ctrl;
   left mouse button should fire the weapon.
2. **Crash after firing the weapon.** Observed once during testing; needs
   investigation (may be related to issue 1 if the crash happened while
   firing with RCtrl).
3. **Missing "Modernized" profile.** Requested: widescreen rendering,
   OpenGL renderer, and proper mouse look (up/down pitch, not just yaw).

**Duke Nukem 3D:**
1. **Mouse click not bound to fire.** Firing currently requires right Ctrl;
   left mouse button should fire the weapon.
2. **Missing "Modernized" profile.** Requested: widescreen rendering,
   OpenGL renderer, and proper mouse look (up/down pitch, not just yaw).

### idtech2-wasm (Quake 8081, Quake II 8082, Xatrix 18082, Rogue 28082) — images current (08-21)

**Quake (SP + MP):**
1. **Mouse not captured when the game starts.** Pointer lock should engage
   automatically when gameplay begins (single player and multiplayer).
2. **Mouse not released on Escape to main menu.** Pointer lock should be
   released when the player returns to the main menu.
3. Otherwise works good.

**Quake II:**
1. **Deathmatch: "Server wake failed with HTTP 500."** Root cause found:
   `q2ded` (3ZB2 build) prints `Quake II shouldn't be run as root!` and
   exits code 1; supervisor logs `state=failed`. Fix: run the server as a
   non-root user in the container, or remove the root check in the pinned
   source.
2. **Single player: mouse not captured when Escape closes the main menu.**
   Pointer lock should engage when the menu closes and gameplay starts.
3. Otherwise seems perfect.

**Quake II: The Reckoning (SP + MP):**
1. **"Server wake failed with HTTP 500." on both modes.** Same q2ded root
   failure; the game does not work at all.

**Quake II: Ground Zero (SP + MP):**
1. **"Server wake failed with HTTP 500." on both modes.** Same q2ded root
   failure; the game does not work at all.

### idtech3-wasm (Quake3 8083, RTCW SP 8085, RTCW MP 18085) — ALL images stale (08-14/15 vs repo 08-21)

> Rebuild all three images from the current pinned source
> (`rtcw-wasm.git` @ `438e7d4`, downstream `e9782a8`;
> `quake3-wasm.git` @ `977b188`) before debugging further — RTCW MP "used to
> work", which points at the stale image.

**Quake III Arena:**
1. **"arena sleeping" on first Join.** Race between the dedicated server
   waking and the client joining; the second Join click succeeded.
2. **Mouse not captured when the game starts**, and not captured when
   Escape closes the in-game menu.

**RTCW Single Player:**
1. **Black areas in the main menu.**
2. **"Multiplayer" main-menu button should be hidden** on the SP entry.
3. **Opening cinematic renders dark, foggy, and weird-looking.**
4. **Game never starts.** The opening cinematic plays, then the loading
   page with the briefing appears, and the game stalls there.

**RTCW Multiplayer:**
1. **Goes to the server browser instead of starting the managed dedicated
   server.** MP worked great before; image is stale (built 08-15, repo
   updated 08-21). Rebuild first, then retest.

### idtech1-wasm (suite 8010) — image current (08-21)

Confirmed by owner: the profile issues seen on Doom 1 affect **every**
id Tech 1 title in the suite (Doom, Doom II, TNT, Plutonia, Heretic, Hexen,
Chex) — they all share the same engine.

1. **Chocolate Doom profile: freezes instead of starting up.**
2. **Chocolate Doom deathmatch: not working.** A multiplayer lobby is
   visible, but the game never starts and there are no bots.
3. **Crispy Doom profiles: same issues** (startup freeze; deathmatch not
   working).
4. **Modernized: mouse cursor not visible in the main menu** (and it seems
   to be needed there).
5. **Modernized deathmatch: not working** — only the console is visible and
   the game never starts.
6. ~~Modernized Doom: no sound.~~ RESOLVED — was the local Chrome mute;
   sound works on re-test.

### wolf3d-wasm (Wolf3D 8011, Spear 8012) — images stale (08-15)

**Wolf3D:**
1. **Mouse cursor not visible** (may be expected) **and the menu system is
   not effectively usable.**
2. **A/D are bound to both turn and strafe at the same time** instead of
   strafe only.
3. ~~No sound.~~ RESOLVED — was the local Chrome mute; sound works.
4. Confirmed on the 2026-08-29 re-test: **Spear of Destiny has the same
   issues as Wolf3D** (same engine).

### idtech4-wasm (Doom3 8086/18086, RoE 18087, Q4 8084/18084, Prey 8087) — images current (08-21)

**Doom 3 SP / MP:** services intentionally stopped at handoff; started
2026-08-29 for re-test. **SP: pass — works good.**

**Doom 3 MP:**
1. **Doesn't connect to a dedicated server.** It shows the in-game server
   browser, which is not the desired behavior.
2. **Expected behavior:** a managed dedicated deathmatch server with bots,
   like the WolfET entry. (Same pattern as the RTCW MP issue — server
   browser instead of the managed dedicated server.)

**Doom 3: Resurrection of Evil:** pass. Working good.

**Quake 4 SP + MP (identical log):**
1. **Game never starts — renderer aborts.** Build is
   `openQ4 0.1.010-dev+g268758e1.dirty` (emscripten-wasm32, 2026-08-21).
   Key log lines:
   - `SDL3: trying OpenGL context 4.6 compatibility` → browser reports
     `version=3.0 profile=es` (WebGL2 only).
   - `Missing required OpenGL features: GL_ARB_multitexture entry points,
     GL_ARB_texture_env_combine, GL_ARB_texture_env_dot3,
     GL_ARB_vertex_program entry points, GL_ARB_fragment_program entry points`
   - `ERROR: The current video card / driver combination does not support
     the necessary features.`
   - C++ exception thrown with exception catching disabled →
     `Aborted(Assertion failed: Exception thrown, but exception catching is
     not enabled...)`.
2. **OpenAL fails to init:** `alcOpenDevice() failed; continuing without
   sound (s_noSound 1); retrying periodically.`

The openQ4 build needs a WebGL2-compatible renderer path (the d3wasm
approach that Doom 3 uses) or ES-equivalent feature mapping; the desktop-GL
fixed-pipeline feature gate is fatal in the browser.

**Prey (2006):**
1. **Freezes when clicking New Game from the main menu.** Cannot tell
   whether it is loading very slowly or actually stuck. Consistent with the
   recorded checkpoint (sustained gameplay remains black).

### dosbox-wasm (Jill 8016, Jazz 8020, Duke 1 8021, Duke 2 8022, GTA 8023, NFS 8024, SimCity 8025) — images current (08-21)

**Jill 1 + 2 + 3:**
1. **Left arrow does not move the player character — it opens an in-game
   modal instead.** Binding issue; unplayable because of it. Confirmed on
   all three Jill games.
2. Sound works.

**Jazz Jackrabbit:**
1. **Menu system unusable** — cannot change menu settings or interact with
   it at all; unclear whether it should be mouse or keyboard-arrow
   selection. If arrows are being delivered as Escape (see Duke 1 note),
   arrow navigation would be impossible.
2. **Cannot play the game** — it asks to save, but no text input works
   (can't type a name or anything).
3. The game itself is running; input is the blocker.

**Duke Nukem + Duke Nukem II:**
1. **Cannot move left or right** — only jump and fire work. After the game
   starts, the only thing that works is opening the menu. Confirmed on both
   Duke 1 and Duke 2.
2. **Owner hypothesis: arrow keys may be mapped to Escape across all
   DOSBox games** — consistent with Jill (left arrow opens the pause modal)
   and Duke 1/2 (arrows open the menu). If true, a single keymap bug in the
   DOSBox adapter would explain Jill 1-3, Jazz, and Duke 1-2 at once.

**Grand Theft Auto (DOS Demo):**
1. **Startup takes forever** — very slow to get to the menu.
2. **Game loads very slowly** after clicking Start Game; hard to tell if it
   is working.
3. **Game eventually starts at about 1 fps.**
4. **Cannot move the character.**
5. **No sound.** Confirmed on the 2026-08-29 unmuted re-test — still the
   same, so this is a real GTA issue, not the Chrome mute.

**The Need for Speed:**
1. **Retest 2026-08-29: starts up now and plays with sound** (the original
   "takes forever to start" did not reproduce).
2. **Mouse cursor is offset** — same cursor-offset issue as SimCity 2000.
3. **Only the menu system works — the game doesn't actually run.** Starting
   a game from the menu doesn't work.

**SimCity 2000:**
1. **Takes forever to load.**
2. **Mouse cursor is offset** — the cursor renders at the wrong position;
   needs fixing.
3. Works okay otherwise, just kinda slow.

### openrct2-wasm (8026) — image stale (08-15)

- Pass. Works good.
- **Request:** owner wants an RCT2 entry ("Open RCT 2 for Roller Coaster
  Tycoon 2") — verify RCT2 data is in the combined RCT1/RCT2 library or add
  a separate shortcut.

### goldsource-wasm (HL 8017, Blue Shift, Opposing Force, Counter-Strike) — image stale (08-20)

**Half-Life:**
1. Starts right up and works great **except no mouse look** — clicking does
   not capture the mouse; nothing seems to capture it.

**Blue Shift:**
1. **Used to work; now takes forever to start up.** The game does start.
2. **Log errors cannot be selected** — text selection in the on-screen log
   is broken.
3. **Same mouse issue as Half-Life** (no mouse look, no capture).

**Opposing Force:**
1. Same issues as Blue Shift — slow startup, unselectable log errors, same
   mouse issue as Half-Life.

**Counter-Strike 1.6:**
1. **"Timed out connecting to the GoldSource WebRTC bridge at
   ws://127.0.0.1:4190/websocket."** Root cause found in
   `wasm-counter-strike-yapb` logs: the GoldSource server crashed on
   2026-08-27 with `Host_Error: MAX_MODELS limit exceeded (4096)` →
   `Server was killed due to an error`. The container is still up and the
   bridge answers HTTP 200, but the game server is dead.

### source-wasm (HL2 8019) — image stale (08-15)

1. **Doesn't start; shows a stub menu instead of the game engine.** Known
   status: diagnostic milestone only — the published SDK has no Source
   engine runtime. The stub menu may be expected at this milestone, but the
   image is stale; rebuild before concluding.

### cod2-wasm (CoD2 MP 8014) — image stale (08-15)

1. **Same as HL2 — stub menu instead of the game engine.** Known status:
   diagnostic client only; native link/runtime blocker remains. Rebuild
   before concluding.

### Emulation shortcuts (NES/SNES/PS1/PS2)

- Not running / not implemented — **expected by design.** Catalog-only
  development shortcuts with `launchable: false`; no runtime images exist
  yet and no Compose service is declared for them.

## Fix plan (suggested order)

### P0 — hard blockers (game completely unplayable)

1. **idtech2-wasm: q2ded root check.** Run the managed server as a
   non-root user (or patch the check in the pinned source). One fix
   restores Quake II DM, The Reckoning (SP+MP), Ground Zero (SP+MP).
   Evidence: `docker logs wasm-quake2` / `wasm-quake2-xatrix` /
   `wasm-quake2-rogue`.
2. **idtech1-wasm: profile failures across the whole suite.**
   - Chocolate + Crispy freeze on startup.
   - Deathmatch (all profiles): lobby/console shows, game never starts, no
     bots.
   - Modernized: no mouse cursor in main menu; DM shows console only.
3. **idtech3-wasm: rebuild stale images** (rtcw-sp, rtcw-mp, quake3) from
   the current pinned source, then retest:
   - RTCW MP: should auto-connect to the managed dedicated server (worked
     before the stale image).
   - RTCW SP: black menu areas, dark/foggy cinematic, stall after briefing;
     hide the "Multiplayer" menu button on the SP entry.
   - Quake3: first-Join "arena sleeping" race.
4. **idtech4-wasm: Quake 4 renderer.** Port the d3wasm-style WebGL path
   (proven for Doom 3/RoE) to openQ4, or map the required desktop-GL
   features to ES equivalents. Also fix OpenAL device init.
5. **dosbox-wasm: input keymap.** Verify the arrow→Escape hypothesis; fix
   restores Jill 1-3, Duke 1 movement, Jazz menu + text input.
6. **dosbox-wasm: GTA + NFS performance.** ~1fps, extreme startup/load
   times, no character movement — likely DOSBox core/cycle configuration
   for these two titles.
7. **build-wasm: mouse click = fire** (Blood + Duke3D). The adapter
   suppresses SDL mouse events on the canvas and `pointerButton` returns
   early during gameplay, so mouse buttons never reach the engine;
   `controllerFrame` maps `held('attack')` to mouse bit 1 but no keyboard
   action feeds it.

### P1 — input/UX (playable but broken interactions)

8. **Pointer-lock lifecycle across idtech2, idtech3, goldsource, wolf3d:**
   capture on gameplay start (and when Escape closes the menu), release on
   Escape to main menu. Affects Quake SP/MP, Quake2 SP, Quake3, Half-Life,
   Blue Shift, Opposing Force, Wolf3D.
9. **wolf3d-wasm:** A/D bound to turn AND strafe (should be strafe only);
   menu system unusable (no mouse cursor). Rebuild stale wolf3d/spear
   images first.
10. **goldsource-wasm:** no mouse look (HL/BS/OF); Blue Shift + Opposing
    Force slow startup (regression — "used to work"); on-screen log text
    selection broken. Image is stale (08-20) — rebuild first.
11. **Counter-Strike 1.6:** fix the `MAX_MODELS limit exceeded (4096)`
    crash in the CS host (wasm-games/counter-strike-yapb:4.4.957) so the
    game server stays up and the WebRTC bridge accepts websocket clients.
12. **dosbox-wasm: SimCity 2000 mouse cursor offset.**
13. **Blood: crash after firing the weapon** (reproduce with the new
    mouse-fire binding; may be the same fault).

### P2 — feature requests

14. **build-wasm: Modernized profile** for Blood + Duke3D — widescreen
    rendering, OpenGL renderer, full mouse look (up/down pitch).
15. **OpenRCT2: RCT2 entry** — verify RCT2 data in the combined
    RCT1/RCT2 library, or add a separate "RCT2" shortcut.
16. **RTCW SP: hide the "Multiplayer" main-menu button** on the SP entry.

### P3 — verify after fixes

17. Retest everything whose image was rebuilt: wolf3d, spear, cod2, HL2,
    openrct2, goldsource, idtech3 (quake3/rtcw-sp/rtcw-mp).
18. Start the stopped Doom 3 SP/MP services and test (8086 / 18086).
19. Test the remaining untested entries: Doom 3 SP/MP (services started
   2026-08-29 for re-test).
20. Prey (2006): determine whether New Game is loading slowly or truly
    stuck (checkpoint says sustained gameplay renders black).

## Notes for the fixer

- Do not run a swap (stop/start of the Compose project) while a browser
  test session is active; follow `wasm-game-lab/RUNBOOK.md`.
- `pull_policy: never` is set on all game services — only locally audited
  images are used; rebuild under the canonical tags
  (`validate.sh --images` in the lab repo must stay clean).
- The lab's `games.json` (portal) and `image-contracts.json` are the
  source of truth for ports, paths, and locked image identities.
- Sound was verified working on Modernized Doom, Wolf3D, and WolfET after
  unmuting Chrome — do not file sound regressions for those without a
  fresh, unmuted reproduction.
