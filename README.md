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
stronger than a successful compile or static-site smoke test.

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

The id Tech 1 multiplayer menu maps **New Game** to single-player and **Join
Deathmatch** to the managed multiplayer path. Original and Smooth use the
Chocolate-compatible server; Modernized uses Zandronum with bots. Quake and
Quake II use managed native servers with bots and the framework’s automatic
wake/idle-sleep lifecycle.

## Full project roster

| Engine family | Games | Current status |
| --- | --- | --- |
| `build-wasm` | Blood; Duke Nukem 3D | ✅ Browser-proven, including mouse look |
| `goldsource-wasm` | Half-Life; Blue Shift; Opposing Force; Counter-Strike 1.6 | ✅ Browser-proven; all campaigns passed their intro sequences; CS bots proven |
| `idtech1-wasm` | Doom / Ultimate Doom; Doom II; Final Doom TNT; Final Doom Plutonia; Heretic; Hexen; Chex Quest | ✅ Browser-proven multiplayer, 21/21 profile matrix |
| `idtech2-wasm` | Quake; Quake II; The Reckoning; Ground Zero | ✅ Browser-proven; multiplayer/bots on base games and both expansions playable |
| `idtech3-wasm` | Quake III Arena; RTCW single-player; RTCW multiplayer; Wolfenstein: Enemy Territory | 🟡 Retest; WolfET remains the lab’s established live release |
| `idtech4-wasm` | Doom 3; Doom 3 Multiplayer; Resurrection of Evil; Quake 4; Quake 4 Multiplayer; Prey (2006) | 🟡 Retest |
| `wolf3d-wasm` | Wolfenstein 3D; Spear of Destiny | 🟡 Retest |
| `dosbox-wasm` | Jill I–III; Jazz Jackrabbit; Duke Nukem I–II; GTA DOS demo; The Need for Speed; SimCity 2000 | 🟡 Retest; Need for Speed is the known broken variant |
| `source-wasm` | Half-Life 2; Portal | 🔴 Still in development; the published SDK has no Source engine runtime |
| `openrct2-wasm` | OpenRCT2 | 🟡 Retest |
| `openut-wasm` | Unreal Tournament | 🟡 Retest |
| `lithtech-wasm` | No One Lives Forever; No One Lives Forever 2 | 🟡 Source/runtime work remains |
| `midtown-wasm` | Midtown Madness; Midtown Madness 2 | 🟡 Source/runtime work remains |
| `cod2-wasm` | Call of Duty 2 Multiplayer | 🔴 Diagnostic client only; native link/runtime blocker remains |
| `emulation-wasm` | NES; SNES; PlayStation; PlayStation 2 | ⚪ Runtime images are not yet available |

Machine-readable status and data paths live in [`games.catalog.json`](games.catalog.json).
The detailed recovery and verification record is in
[`PROJECT-TRACKER.md`](PROJECT-TRACKER.md). The running workstation portal and
its 18 live shortcuts are recorded in
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
