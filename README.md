# wasm-games

Source-only WebAssembly ports of classic games. This monorepo contains the
browser adapters, deterministic source locks and patches, build scripts,
manifests, server supervisors, and container packaging. Original game data and
generated `.wasm`/`.data` artifacts are not committed; owner-supplied data is
mounted from `/home/ted/wasm-game-data` during local development.

The shared runtime lives in the separate
[`wasm-game-framework`](https://github.com/theodorecharles/wasm-game-framework)
repository. The workstation launcher lives in the separate
[`wasm-game-lab`](https://github.com/theodorecharles/wasm-game-lab) repository.

## Browser-proven roster

These results were recorded in Google Chrome on 2026-08-21. “Browser-proven”
means the built game reached the stated native runtime condition; it is
stronger than a successful compile or static-site smoke test. The 2026-08-29
lab retest found regressions in several of these families (idtech1, dosbox,
goldsource, idtech2 expansions); see
[`GAME-LAB-TEST-ISSUES.md`](GAME-LAB-TEST-ISSUES.md).

| Engine | Game | Proven result | Evidence |
| --- | --- | --- | --- |
| Build | Blood | Playable E1M1; keyboard plus horizontal and vertical mouse look | [`mouselook.json`](build-wasm/proofs/mouselook.json) |
| Build | Duke Nukem 3D | Playable L.A. Meltdown; keyboard plus native yaw and horizon mouse look | [`mouselook.json`](build-wasm/proofs/mouselook.json) |
| GoldSource | Half-Life | Intro advanced from `c0a0` through `c0a0e` into gameplay | [`campaign-intros.json`](goldsource-wasm/proofs/campaign-intros.json) |
| GoldSource | Half-Life: Blue Shift | Intro advanced from `ba_tram1` through `ba_tram3` into gameplay | [`campaign-intros.json`](goldsource-wasm/proofs/campaign-intros.json) |
| GoldSource | Half-Life: Opposing Force | Helicopter intro advanced from `of0a0` to playable `of1a1` | [`campaign-intros.json`](goldsource-wasm/proofs/campaign-intros.json) |
| GoldSource | Counter-Strike 1.6 | Playable `de_dust2` with four YaPB bots | [`counter-strike-bots.json`](goldsource-wasm/proofs/counter-strike-bots.json) |
| id Tech 1 | Doom, Doom II, TNT, Plutonia, Heretic, Hexen, Chex Quest | 21/21 two-browser multiplayer combinations passed across Original, Smooth, and Modernized profiles; Modernized adds two bots | [`multiplayer-21.json`](idtech1-wasm/proofs/multiplayer-21.json) |
| id Tech 2 | Quake | Two Chrome clients plus two FrikBot bots, independent mouse look, server auto-wake/sleep | [`quake-multiplayer.json`](idtech2-wasm/proofs/quake-multiplayer.json) |
| id Tech 2 | Quake II | Two Chrome clients plus two 3ZB2 bots, independent mouse look, server auto-wake/sleep | [`quake2-multiplayer.json`](idtech2-wasm/proofs/quake2-multiplayer.json) |
| id Tech 2 | Quake II: The Reckoning | Owner PAK validated and playable `xswamp` reached with the native Xatrix module | [`quake2-expansions.json`](idtech2-wasm/proofs/quake2-expansions.json) |
| id Tech 2 | Quake II: Ground Zero | Owner PAK validated and playable `rbase1` reached with the native Rogue module | [`quake2-expansions.json`](idtech2-wasm/proofs/quake2-expansions.json) |
| DOSBox | Jill I–III; Jazz Jackrabbit; Duke Nukem I–II; GTA; The Need for Speed; SimCity 2000 | 9/9 reached real rendered game content; native keyboard input, changing framebuffers, audio scheduling, and persistent config passed | [`runtime-9.json`](dosbox-wasm/proofs/runtime-9.json) |
| id Tech 4 | Doom 3 / RoE d3wasm checkpoint | Pinned d3wasm WebGL 1 builds reproduce for Doom 3 and RoE; Chrome formally proved Mars City gameplay, real keyboard movement, audio, console resume, and same-session save/load. Final cross-reload persistence and formal pointer-lock mouse evidence remain. | [`d3wasm-checkpoint.json`](idtech4-wasm/proofs/d3wasm-checkpoint.json) · [`resume runbook`](idtech4-wasm/RESUME-RUNBOOK.md) |
| id Tech 4 | Prey (2006) checkpoint | d3wasm renderer and real menu clicks work; `game/roadhouse` mounted all four deferred packs, spawned its player, loaded 1,208 images, and returned to the browser pump; sustained gameplay remains black | [`prey-checkpoint.json`](idtech4-wasm/proofs/prey-checkpoint.json) |

The id Tech 1 multiplayer menu maps **New Game** to single-player and **Join
Deathmatch** to the managed multiplayer path. Original and Smooth use the
Chocolate-compatible server; Modernized uses Zandronum with bots. Quake and
Quake II use managed native servers with bots and the framework’s automatic
wake/idle-sleep lifecycle.

## Full project roster

| Engine family | Games | Current status |
| --- | --- | --- |
| `build-wasm` | Blood; Duke Nukem 3D | 🟡 Playable in the 2026-08-29 lab test; mouse click not bound to fire (RCtrl fires); one Blood crash after firing; Modernized profile (widescreen, OpenGL, full mouse look) requested |
| `goldsource-wasm` | Half-Life; Blue Shift; Opposing Force; Counter-Strike 1.6 | 🟡 HL playable but no mouse look; Blue Shift/OF slow to start with unselectable log; CS bridge down (host server crashed: MAX_MODELS limit) |
| `idtech1-wasm` | Doom / Ultimate Doom; Doom II; Final Doom TNT; Final Doom Plutonia; Heretic; Hexen; Chex Quest | 🔴 Regressed in the 2026-08-29 lab test: Chocolate/Crispy freeze on startup; deathmatch never starts (no bots); Modernized has no menu cursor and DM is console-only |
| `idtech2-wasm` | Quake; Quake II; The Reckoning; Ground Zero | 🟡 Quake playable (pointer-lock lifecycle needs work); Quake II DM + both expansions broken — q2ded refuses to run as root (server wake 500) |
| `idtech3-wasm` | Quake III Arena; RTCW single-player; RTCW multiplayer; Wolfenstein: Enemy Territory | 🟡 WolfET is production ready; Quake3 has a first-join race + pointer lock; RTCW SP/MP broken (stale 08-15 images, rebuild needed) |
| `idtech4-wasm` | Doom 3; Doom 3 Multiplayer; Resurrection of Evil; Quake 4; Quake 4 Multiplayer; Prey (2006) | 🟠 Doom 3 SP + RoE pass in the lab; Doom 3 MP shows the server browser (needs a managed dedicated server); Quake 4 SP/MP renderer aborts under WebGL2; Prey freezes on New Game |
| `wolf3d-wasm` | Wolfenstein 3D; Spear of Destiny | 🟡 Playable but input broken: A/D turn and strafe at once, menu unusable, no cursor; images stale |
| `dosbox-wasm` | Jill I–III; Jazz Jackrabbit; Duke Nukem I–II; GTA DOS demo; The Need for Speed; SimCity 2000 | 🔴 Regressed: arrows may be mapped to Escape (Jill 1–3, Duke 1–2, Jazz); GTA ~1fps + no sound; NFS menu-only; SimCity cursor offset |
| `source-wasm` | Half-Life 2; Portal | 🔴 Still in development; the published SDK has no Source engine runtime (stub menu) |
| `openrct2-wasm` | OpenRCT2 | ✅ Works good in the 2026-08-29 lab test; RCT2 entry requested |
| `openut-wasm` | Unreal Tournament | 🟡 Source/runtime work remains |
| `lithtech-wasm` | No One Lives Forever; No One Lives Forever 2 | 🟡 Source/runtime work remains |
| `midtown-wasm` | Midtown Madness; Midtown Madness 2 | 🟡 Source/runtime work remains |
| `cod2-wasm` | Call of Duty 2 Multiplayer | 🔴 Diagnostic client only; native link/runtime blocker remains (stub menu) |
| `emulation-wasm` | NES; SNES; PlayStation; PlayStation 2 | ⚪ Runtime images are not yet available |

Statuses reflect the full-portfolio lab test session of 2026-08-29. Per-game
results, root causes, and the fix plan are in
[`GAME-LAB-TEST-ISSUES.md`](GAME-LAB-TEST-ISSUES.md); the working fix list is
[`GAME-LAB-FIX-TODO.md`](GAME-LAB-FIX-TODO.md).

Machine-readable status and data paths live in [`games.catalog.json`](games.catalog.json).
The detailed recovery and verification record is in
[`PROJECT-TRACKER.md`](PROJECT-TRACKER.md). The running workstation portal and
its 27 live shortcuts are recorded in
[`game-lab-runtime.json`](proofs/game-lab-runtime.json).

## Layout and verification

Each engine family has an `engine.json`, and each catalog game has a
`games/<game>/game.json`, `sources.json`, and ordered patch series. Validate the
source-only layout with:

```bash
node scripts/validate-layout.mjs
```

Engine-specific test and image scripts live under each family’s `scripts/`
directory. Builds use the sibling framework checkout by default or
`WASM_FRAMEWORK_DIR` when explicitly supplied.
