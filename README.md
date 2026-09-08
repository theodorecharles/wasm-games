# WASM Games

Classic game engines, brought to the browser with WebAssembly.

WASM Games is a source-only collection of browser ports, DOS runtimes, and
experimental engine integrations. It brings projects such as Doom, Quake,
Half-Life, Duke Nukem 3D, Wolfenstein, and OpenRCT2 into a shared browser-game
environment while keeping each engine's build and game-data requirements explicit.

**Active development:** several games have browser-tested gameplay paths; others
are experimental or not yet runnable. This repository does not include retail
game data or ready-to-run compiled game bundles.

## What is here

- **Engine integrations:** browser input, rendering, audio, menus, and persistence.
- **Reproducible source inputs:** pinned repositories, source locks, and ordered
  patch sets instead of checked-in upstream source trees.
- **Build and deployment tooling:** Emscripten builds, per-game manifests,
  container definitions, and package validation.
- **Managed multiplayer:** dedicated-server lifecycle, browser networking, and
  bots for supported engines.
- **Verification records:** native regressions, package checks, and dated browser
  observations that distinguish a successful build from working gameplay.

The project is split across three repositories:

| Repository | Role |
| --- | --- |
| **wasm-games** — this repository | Engine patches, adapters, game manifests, builds, and tests |
| [wasm-game-framework](https://github.com/BuiltByTed/wasm-game-framework) | Shared browser shell, launcher, data loading, persistence, and container runtime |
| [wasm-game-lab](https://github.com/BuiltByTed/wasm-game-lab) | Self-hosted game portal and multi-service deployment |

## Games and current progress

Snapshot: **September 6, 2026**. Browser-tested means the specific path described
in the linked record was observed in Chrome—not that every map, control, browser,
or multiplayer mode is fully supported. Experimental results may exist only in
development builds and may not be present in an installed image.

| Family | Games | Current milestone |
| --- | --- | --- |
| [Build](build-wasm/) | Blood; Duke Nukem 3D | Classic and Modernized profiles, including widescreen GPU rendering and pitch/yaw mouse look. First-level rendering and movement tested in both profiles; Duke mouse firing and isolated save/reload checks pass. Blood's reported firing crash remains unresolved. [Details](build-wasm/proofs/BUILD-RELEASE-2026-09-06.md) |
| [id Tech 1](idtech1-wasm/) | Doom; Doom II; TNT; Plutonia; Heretic; Hexen; Chex Quest | Original, Smooth, and Modernized first-map deathmatches tested across all seven titles, with managed bots. Startup, menu, input, and audio repairs are integrated. [Details](idtech1-wasm/proofs/README.md) |
| [id Tech 2](idtech2-wasm/) | Quake; Quake II; The Reckoning; Ground Zero | Native managed servers and bot integrations. The Quake II server-start regression is repaired; fresh expansion gameplay and capture checks remain. [Details](idtech2-wasm/proofs/README.md) |
| [id Tech 3](idtech3-wasm/) | Quake III Arena; Return to Castle Wolfenstein SP/MP; Wolfenstein: Enemy Territory | RTCW SP rendering and save/reload tested; RTCW MP and Quake III managed joins, bot matches, and menu transitions tested. Enemy Territory has an established runtime. [Details](idtech3-wasm/proofs/README.md) |
| [Wolf4SDL](wolf3d-wasm/) | Wolfenstein 3D; Spear of Destiny | Native menus, dialogs, key labels, first-level movement, firing, and pause/resume tested. Config persistence and browser capture remain in progress. [Details](wolf3d-wasm/proofs/README.md) |
| [GoldSource](goldsource-wasm/) | Half-Life; Blue Shift; Opposing Force; Counter-Strike 1.6 | Campaign intros, Blue Shift save/reload, and CS bot joins tested. Expansion loading and CS menus repaired. Mouse capture and the original CS model-overflow cause remain open. [Details](goldsource-wasm/proofs/README.md) |
| [OpenRCT2](openrct2-wasm/) | RollerCoaster Tycoon 1 and 2 content through OpenRCT2 | Both libraries supported by the same entry. Browser checks cover park loading, ride construction, passenger trips, and save restoration across reload. [Details](openrct2-wasm/proofs/README.md) |
| [DOSBox](dosbox-wasm/) | Jill I–III; Jazz Jackrabbit; Duke Nukem I–II; GTA DOS demo; The Need for Speed; SimCity 2000 | Keyboard, timing, and mouse repairs are integrated. SimCity has browser save/reload evidence; other titles still need broader browser input/performance checks. GTA/NFS native-runtime results are not full browser acceptance. [Details](dosbox-wasm/proofs/README.md) |
| [id Tech 4](idtech4-wasm/) | Doom 3; Resurrection of Evil; Doom 3 MP; Quake 4 SP/MP; Prey (2006) | Experimental builds verify Doom 3/RoE saves, managed Doom 3 bot matches, and Quake 4/Prey intro-to-world rendering. Recent repairs are not yet promoted to the regular lab images; Quake 4 MP acceptance remains open. [Details](idtech4-wasm/proofs/README.md) |

Additional targets are tracked separately from browser-tested runtimes:

| Family | Targets | Status |
| --- | --- | --- |
| [Source](source-wasm/) | Half-Life 2; queued Lost Coast, Episodes One/Two, Portal | HL2 playable preview deployed to the owner's Windows 96 Steam setup. Work stopped at the user's request; remaining quality checks are recorded in the [deployment checkpoint](source-wasm/STOPPING-POINT-20260907.md). |
| [Call of Duty 2](cod2-wasm/) | Call of Duty 2 multiplayer | Diagnostic client; native link/runtime blockers remain |
| [OpenUT](openut-wasm/) | Unreal Tournament | Source/runtime integration in development |
| [LithTech](lithtech-wasm/) | No One Lives Forever 1 and 2 | Source/runtime integration in development |
| [Midtown](midtown-wasm/) | Midtown Madness 1 and 2 | Source/runtime integration in development |
| [Emulation](emulation-wasm/) | NES; SNES; PlayStation; PlayStation 2 | Catalog targets only; no launchable runtime images |

The [game catalog](games.catalog.json) lists game IDs, source references, and data
paths, including planned targets. For tested behavior and current limitations,
use the dated evidence linked above rather than assuming catalog membership
means a game is playable.

## Getting started

This is a development workspace, not a single-click game download. To build a
port, start with the source repository and shared framework as sibling checkouts:

```sh
git clone https://github.com/theodorecharles/wasm-games.git
git clone https://github.com/BuiltByTed/wasm-game-framework.git
cd wasm-games

# Check the catalog, manifests, patch references, and repository layout.
node scripts/validate-layout.mjs

# Point build scripts at your framework checkout.
export WASM_FRAMEWORK_DIR="$(cd ../wasm-game-framework && pwd)"
```

Layout validation needs Node.js; it does not compile or launch games. Individual
ports have different Emscripten versions, native dependencies, framework pins,
and data requirements. Check the selected family's scripts and manifests before
building—there is no universal build command or SDK version for the collection.

Useful build entry points include:

- [Build-family build](build-wasm/build-web.sh)
- [id Tech 1 build scripts](idtech1-wasm/scripts/)
- [id Tech 3 package commands](idtech3-wasm/package.json)
- [GoldSource package commands](goldsource-wasm/package.json)
- [Wolf4SDL build](wolf3d-wasm/build-web.sh)
- [DOSBox build](dosbox-wasm/scripts/build-web.sh)
- [id Tech 4 build scripts](idtech4-wasm/scripts/)

For the self-hosted portal and deployment setup, see
[wasm-game-lab](https://github.com/BuiltByTed/wasm-game-lab). Build artifacts,
installed images, and experimental candidates can represent different revisions;
check the corresponding verification record before deploying an update.

## Bring your own game data

Supply game files from your own installation in the format expected by the
selected port. Retail archives, textures, music, ROMs, and firmware are not
included here. Keep game data outside the source checkout and provide it through
the selected runtime's data-import or mount configuration.

Each game's `game.json` and `sources.json`, together with its browser data
manifest where present, describe the integration. Supported file layouts and
versions vary; a directory of game files is not interchangeable across ports.

## How the repository is organized

The common layout is shown below; shared family-level build and web assets vary
by engine.

```text
<family>-wasm/
  engine.json              Family and game identifiers
  patches/                 Shared engine changes
  games/<game>/
    game.json              Game and data configuration
    sources.json           Source inputs and provenance
    patches/series         Ordered game-specific patches
  scripts/                 Build, packaging, and verification tools
  proofs/                  Runtime evidence and development checkpoints
games.catalog.json         Portfolio catalog
```

Upstream source checkouts and generated outputs belong in build work directories,
not the source history. The shared framework and game portal remain separate
projects rather than embedded copies.

## Testing and known limitations

Verification happens at several levels: source reconstruction, native regression
tests, generated-package checks, and real browser interaction. A passing compile
or HTTP health check does not establish working rendering, controls, or saves.

Current cross-project work includes pointer-lock/fullscreen behavior, sustained
keyboard controls, persistence edge cases, longer campaign/multiplayer sessions,
and audio listening. Browser audio scheduling is recorded separately from audible
playback checks. Support outside the tested Chrome environment is not implied.

When reporting an issue, include the game and profile, build/revision, browser
and OS, reproduction steps, and relevant logs or screenshots. Do not attach
retail game archives, ROMs, firmware, or other private game data.

## Development notes

- [Current progress and remaining fixes](GAME-LAB-FIX-TODO.md)
- [Maintainer recovery runbook](RESUME-RUNBOOK.md) — exact development handoff;
  contains workstation-specific details, not general installation instructions
- [Original regression report](GAME-LAB-TEST-ISSUES.md) — historical baseline

## Credits and licensing

These integrations build on the work of the upstream engine and port communities.
Source manifests record repository provenance and pinned revisions. Licensing
varies by component; consult the relevant source repositories and included
license/third-party notices rather than assuming one license covers every engine.
Game data is separate from the engine source and is not distributed by this project.
