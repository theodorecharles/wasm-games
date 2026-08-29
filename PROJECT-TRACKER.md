# WASM Games project tracker

Last updated: 2026-08-29

This is the project tracker for the `wasm-games` monorepo. Runtime status is
based on Ted's latest browser tests unless a row says otherwise. Structural
status is based on the local filesystem and GitHub audit performed on
2026-08-29.

## Target state

- Repository: `/home/ted/Development/wasm-games`
- Game data: `/home/ted/wasm-game-data` (never committed)
- Shared framework: `/home/ted/Development/wasm-game-framework`
- Game portal: `/home/ted/Development/wasm-game-lab`
- Monorepo contents: our adapters, build orchestration, manifests, Dockerfiles,
  assets, and patches only
- Source inputs: pinned repositories under `github.com/theodorecharles`, fetched
  during the build
- Required layout:

  ```text
  <engine>-wasm/
    engine.json
    patches/                 # patches shared by the engine family
    games/
      <game>/
        game.json
        sources.json
        Dockerfile
        unraid.xml
        patches/             # patches specific to this game
        web/                  # our browser adapter/assets only
  ```

- Prohibited repository content:
  - copyrighted game data
  - compiled artifacts and build directories
  - vendored upstream source trees
  - embedded copies/submodules of `wasm-game-framework` or `wasm-game-lab`
  - `CODE_OF_CONDUCT*` and `CONTRIBUTING*`; project Markdown is limited to the root roster/tracker and proof notes

## Recovery status

| Workstream | Status | Evidence / next action |
| --- | --- | --- |
| Relocate monorepo | Done locally | The monorepo is at `/home/ted/Development/wasm-games`; no legacy workspace remains. |
| Separate framework | Done locally | Removed the framework submodule; separate repo remains at `/home/ted/Development/wasm-game-framework`. |
| Separate game lab | Done locally | Removed the copied lab; its dirty worktree is intact at `/home/ted/Development/wasm-game-lab`. |
| Remove standalone Jill port | Done locally | Removed `jill-wasm`; Jill I–III remain DOSBox variants. |
| Remove imported upstream docs | Done locally | Upstream documentation was removed; the root README/tracker and concise proof notes remain. No `CODE_OF_CONDUCT*` or `CONTRIBUTING*` file remains. |
| Clear stale Docker containers | Done locally | Removed 73 WASM/game development containers. Zero containers are running; one unrelated stopped Coqui TTS container was left alone. |
| Recover Docker-volume data | Done locally | Verified OpenRCT2/OpenUT exports remain under `/home/ted/wasm-game-data/{openrct2,openut}/volumes`. Their three named Docker volumes were removed after verification. The temporary anonymous-volume export was deleted. |
| Dispose legacy workspace | Done locally | Unique NOLF, NOLF2, and OpenUT edits were converted to clean-base patch queues; framework/lab were moved intact; then `/home/ted/Development/wasm` was physically deleted with no archive or compatibility symlink. |
| Rebuild directory structure | Done locally | Machine-readable manifests now cover 15 engines and 51 games under `<engine>-wasm/games/<game>`, with engine-level and game-level patch directories represented explicitly. |
| Restore browser adapters | Done locally | Removed the bad global ignore for `web/game-adapter.js` and restored all 16 adapters from intact repos whose adjacent manifests matched byte-for-byte. Layout validation now rejects a manifest whose adapter is missing. |
| Fork all upstream source | Blocked on missing forks | Existing forks cover part of GoldSource, Quake 1/2/3, RTCW, Doom 3, and Quake 4. Most other upstreams are not yet forks under Ted's account. |
| Externalize all game data | Done for authoritative data found in this audit | Active game data now lives only under `/home/ted/wasm-game-data` (34 GB). Compatibility symlinks, duplicate Source snapshots, anonymous-volume exports, and the unreferenced RCT2 build bundle were deleted. |

## Runtime tracker

### Build engine

| Game | Runtime status | Known issue | Structural/source work |
| --- | --- | --- | --- |
| Blood | Working / browser-proven | None in the tested path. | Chrome reached E1M1; native turn and vertical-look commands both changed from real mouse input. Fresh pinned patch application, web/static contracts, and suite/per-game images pass. |
| Duke Nukem 3D | Working / browser-proven | None in the tested path. | Chrome reached L.A. Meltdown; native yaw and horizon both changed from real mouse input. Fresh pinned patch application, web/static contracts, and suite/per-game images pass. |

### Call of Duty 2

| Game | Runtime status | Known issue | Structural/source work |
| --- | --- | --- | --- |
| Call of Duty 2 Multiplayer | Broken | The reconstructed client object graph compiles, but the executable does not link or launch. | Game layout restored. The build fetches pinned Ted-owned reconstruction commit `f70e6974` and applies a verified source patch; bot-foundation and diagnostic-adapter tests pass. The generated data/import symbol model remains the real link blocker. |

### DOSBox

| Game | Runtime status | Known issue | Structural/source work |
| --- | --- | --- | --- |
| Jill of the Jungle | Broken / input regression | Left arrow opens an in-game modal instead of moving; unplayable. | The older launch proof reached rendered content, but the 2026-08-29 manual gameplay test supersedes that promotion. |
| Jill Goes Underground | Broken / input regression | Same left-arrow failure as Jill I. | Shares the DOSBox input path and needs retest after the keymap fix. |
| Jill Saves the Prince | Broken / input regression | Same left-arrow failure as Jill I. | Shares the DOSBox input path and needs retest after the keymap fix. |
| Jazz Jackrabbit | Broken / input regression | Menu navigation and name entry are unusable. | The native program launches and renders, but gameplay input is not proven correct. |
| Duke Nukem | Broken / input regression | Left/right movement does not work. | The native program launches and renders, but gameplay input is not proven correct. |
| Duke Nukem II | Broken / input regression | Same left/right movement failure as Duke I. | Shares the DOSBox input path and needs retest after the keymap fix. |
| Grand Theft Auto DOS demo | Broken / performance and audio | Runs at roughly 1 fps, movement is ineffective, and audio is absent. | Protected-mode startup reaches the menu, but the sustained runtime is not playable. |
| The Need for Speed | Broken / gameplay and pointer mapping | Menus and sound work, but a race does not start and the cursor is offset. | Protected-mode startup reaches the Road & Track title; that launch checkpoint is not a gameplay pass. |
| SimCity 2000 | Working with issues | Slow startup/runtime and an offset mouse cursor. | The registration/title path and city UI run, but pointer mapping still needs correction. |

The DOSBox build now fetches pinned Ted-owned commit `8bde9c0d`, then applies
the verified seven-file engine runtime patch. Adapter/data-manifest tests and
all nine historical launch checks pass, but those checks do not prove correct
gameplay controls or sustained performance. The older Chrome evidence is in
`dosbox-wasm/proofs/runtime-9.json`; the authoritative 2026-08-29 manual result
is in `GAME-LAB-TEST-ISSUES.md`.

### Emulation

| Game/platform | Runtime status | Known issue | Structural/source work |
| --- | --- | --- | --- |
| NES | Untested / redesign | No launchable image currently exists. | Define ROM/data contract and fork the selected core/API. |
| SNES | Untested / redesign | No launchable image currently exists. | Define ROM/firmware contract and fork the selected core/API. |
| PlayStation | Untested / redesign | BIOS/firmware ownership and provisioning are unresolved. | Define required BIOS hashes and data flow before resuming runtime work. |
| PlayStation 2 | Untested / redesign | BIOS/firmware ownership and provisioning are unresolved; feasibility is uncertain. | Re-evaluate scope before creating a game image. |

### GoldSource

| Game | Runtime status | Known issue | Structural/source work |
| --- | --- | --- | --- |
| Half-Life | Working / browser-proven | None in the tested path. | Chrome advanced from `c0a0` through `c0a0e` into gameplay with no fatal engine errors. |
| Blue Shift | Working / browser-proven | None in the tested path. | Chrome advanced from `ba_tram1` through `ba_tram3` into gameplay. |
| Opposing Force | Working / browser-proven | None in the tested path. | Chrome advanced past the helicopter sequence from `of0a0` to playable `of1a1`. |
| Counter-Strike 1.6 | Working / browser-proven with bots | None in the tested path. | Chrome reached `de_dust2`; the pinned YaPB server connected four bots with its graph loaded and no permission errors. |

GoldSource fetches pinned source commits, builds with Emscripten 4.0.23, and
passes build, adapter, framework-package, persistence, input, data, PWA, and
browser campaign tests. The formal Chrome evidence is under
`goldsource-wasm/proofs/`.

### id Tech 4

| Game | Runtime status | Known issue | Structural/source work |
| --- | --- | --- | --- |
| Doom 3 | Working / manual browser pass | The formal final-build cross-reload save check remains incomplete. | The pinned d3wasm GLES2/WebGL 1 build passed the 2026-08-29 lab test. Earlier formal evidence covers Mars City gameplay, keyboard movement, WebAudio, console resume, and same-session save/load. |
| Doom 3 Multiplayer | Broken / managed multiplayer missing | Starts at the public server browser instead of connecting to a managed dedicated deathmatch server; bots are unproven. | Shares the exact-reconstructable d3wasm engine patch and owner-data contract. |
| Resurrection of Evil | Working / manual browser pass | No blocker was observed in the 2026-08-29 manual path; its older formal proof remains less complete than Doom 3's. | Uses pinned d3wasm commit `48f8f65d` plus pinned d3xp game-code commit `31e877e7`; both downstream patches reconstruct exactly. |
| Quake 4 | Broken / renderer initialization | The WebGL2 runtime aborts on desktop-GL feature requirements; OpenAL initialization also fails. | Engine and SDK-derived game sources are pinned to Ted-owned repositories; large non-retail runtime packs are checksum-pinned release assets. |
| Quake 4 Multiplayer | Broken / renderer initialization | Same renderer/OpenAL failure as single-player. | Uses the same pinned openQ4 engine/game and release-asset flow. |
| Prey (2006) | Broken / gameplay transition | New Game freezes in the current manual path. An older instrumented run completed Roadhouse loading but then stalled with a black sustained gameplay frame; audio, playable input, cinematics, and saves remain unproven. | Replaced the abandoned custom renderer lane with the d3wasm GLES2/WebGL 1 renderer. The complete 75-file engine delta is preserved in `patches/prey2006-browser.patch`; see `proofs/prey-checkpoint.json`. |

The Doom 3/RoE source mirror is `theodorecharles/d3wasm-browser` at
`48f8f65d1216db3ee0b11872bb3b413febadc669`; RoE additionally pins the d3xp
game-code source at `31e877e7e4e691ed9f98603da9cd95ac59540cf3`. The engine and
RoE compatibility patches apply exactly, clean builds pass, and the checkpoint
is `idtech4-wasm/proofs/d3wasm-checkpoint.json`.

The Prey source is pinned at `5a55c48254e0d847fae533d62a5cf9623999ec04`.
The browser patch SHA-256 is
`19bd42858212e0d9d678b9b15f76f443ab84e41fba78323295b1d08b29a68933`
and applies cleanly to that commit. Normal menu startup is restored; the
temporary `+map game/roadhouse` diagnostic argument is not part of the worker.
The next run should use the first-four-frame markers in `#loading-console` to
locate the second-pass stall in `Session::Frame` versus `UpdateScreen`.

### id Tech 1

| Game | Runtime status | Known issue | Structural/source work |
| --- | --- | --- | --- |
| Doom / Ultimate Doom | Working / multiplayer proven | None in the tested matrix. | Original, Smooth, and Modernized passed two-browser keyboard/mouse/network tests. |
| Doom II | Working / multiplayer proven | None in the tested matrix. | Original, Smooth, and Modernized passed two-browser keyboard/mouse/network tests. |
| Final Doom: TNT | Working / multiplayer proven | None in the tested matrix. | Original, Smooth, and Modernized passed two-browser keyboard/mouse/network tests. |
| Final Doom: Plutonia | Working / multiplayer proven | None in the tested matrix. | Original, Smooth, and Modernized passed two-browser keyboard/mouse/network tests. |
| Heretic | Working / multiplayer proven | None in the tested matrix. | Original, Smooth, and Modernized passed two-browser keyboard/mouse/network tests. |
| Hexen | Working / multiplayer proven | None in the tested matrix. | Original, Smooth, and Modernized passed two-browser keyboard/mouse/network tests. |
| Chex Quest | Working / multiplayer proven | None in the tested matrix. | Original, Smooth, and Modernized passed two-browser keyboard/mouse/network tests. |

The strict Chrome matrix passed 21/21 combinations: two independent browsers,
distinct network players, keyboard world movement, mouse press/release and
heading change, server human/peer counts, and automatic sleep. Original and
Smooth use the Chocolate-compatible server. Modernized uses Zandronum and two
bots. Evidence is `idtech1-wasm/proofs/multiplayer-21.json`.

### Other engine families requiring reassessment

These projects were not re-tested by Ted after the reorganization. Their first
task is structural recovery followed by one clean build and browser smoke test.

| Engine directory | Intended games | Current source/fork assessment |
| --- | --- | --- |
| `idtech2-wasm` | Quake, Quake II, The Reckoning, Ground Zero | Quake and Quake II are browser-proven with two clients, two bots, independent mouse look, and managed auto-wake/sleep servers. Both Quake II mission packs reach playable maps with pinned native game modules. Managed images pass HTTP smoke tests. |
| `idtech3-wasm` | Quake III Arena, RTCW SP, RTCW MP, Wolfenstein: Enemy Territory | QuakeJS, ioq3, and ioRTCW locks now fetch exact commits proven present in Ted-owned repositories. ETLegacy commit `a44ab4f` is not present in `wolfet-wasm`, so that source fork remains blocked. |
| `idtech4-wasm` | Doom 3 SP/MP, Resurrection of Evil, Quake 4 SP/MP, Prey (2006) | d3wasm, its pinned RoE game-code source, openQ4, openQ4-game, and Prey all fetch exact commits from Ted-owned repositories and reconstruct from verified patches. Doom 3 and RoE passed the 2026-08-29 manual lab test. Doom 3 MP still needs managed multiplayer, Quake 4 SP/MP abort in renderer initialization, and Prey freezes on New Game. |
| `lithtech-wasm` | No One Lives Forever, No One Lives Forever 2 | Unique downstream edits are preserved as verified NOLF and NOLF2 patch queues; canonical source forks are missing. |
| `midtown-wasm` | Midtown Madness, Midtown Madness 2 | Both Ted-owned project repositories are now pinned in game manifests. MM1's probe code is preserved under its game directory; clean-base patch extraction and MM2 data/runtime work remain. |
| `openrct2-wasm` | OpenRCT2 | Source was removed from the monorepo. A fresh Ted-owned checkout at OpenRCT2 v0.5.4 applies the verified 16-file browser patch; build/browser retest remains. |
| `openut-wasm` | Unreal Tournament | The 26-file SurrealEngine browser change set is preserved as a verified game patch; the canonical source fork is missing. |
| `source-wasm` | Half-Life 2, Portal | Chrome reached the diagnostic module, which confirms that the published Source SDK contains no Source engine runtime. Both games remain in development pending a lawful, buildable engine source. |
| `wolf3d-wasm` | Wolfenstein 3D, Spear of Destiny | Source was removed from the monorepo. Both games use the pinned Ted-owned Wolf4SDL checkout plus a verified 12-file engine patch; both adapter contract suites pass. |

## Data migration tracker

Canonical destination: `/home/ted/wasm-game-data`. There is no compatibility
path under `Development`.

| Current directory | Manifest path | Status |
| --- | --- | --- |
| `/home/ted/wasm-game-data/blood` | `blood` | Canonical and referenced directly. |
| `/home/ted/wasm-game-data/duke3d` | `duke3d` | Canonical and referenced directly. |
| `/home/ted/wasm-game-data/cod2` | `cod2` | Canonical and referenced directly. |
| `/home/ted/wasm-game-data/dosbox/*` | `dosbox/<game>` | At canonical root. |
| `/home/ted/wasm-game-data/crispy` | `crispy` | Canonical shared WAD directory for id Tech 1 manifests. |
| `/home/ted/wasm-game-data/quake1` | `quake1` | Canonical and referenced directly. |
| `/home/ted/wasm-game-data/quake2` | `quake2` | Canonical and referenced directly. |
| `/home/ted/wasm-game-data/quake3` | `quake3` | Canonical and referenced directly. |
| `/home/ted/wasm-game-data/rtcw` | `rtcw` | Canonical and referenced directly. |
| `/home/ted/wasm-game-data/wolfet` | `wolfet` | Canonical; the generated root-owned legacy session cache was removed. |
| `/home/ted/wasm-game-data/doom3` | `doom3` | Canonical and shared by Doom 3/ROE manifests. |
| `/home/ted/wasm-game-data/quake4` | `quake4` | Canonical and shared by Quake 4 variants. |
| `/home/ted/wasm-game-data/prey` | `prey` | Canonical and referenced directly. |
| `/home/ted/wasm-game-data/goldsource` | `goldsource` | At canonical root. |
| `/home/ted/wasm-game-data/nolf` | `nolf` | Canonical and referenced directly. |
| `/home/ted/wasm-game-data/nolf2` | `nolf2` | Canonical and referenced directly. |
| `/home/ted/wasm-game-data/source` | `source` | At canonical root. |
| `/home/ted/wasm-game-data/wolf3d` | `wolf3d` | At canonical root; manifests now point at the real layout. |
| `/home/ted/wasm-game-data/midtown/midtown-madness/1560.ar` | `midtown/midtown-madness` | Moved out of Git. |
| `/home/ted/wasm-game-data/emulation/ps1/SIM2000.BIN` | `emulation/ps1` | PS1 test disc moved from the old Emulation worktree; firmware/BIOS remains unprovisioned. |
| Docker volumes | canonical directories above | Verified named game-volume exports are canonical and the three original named volumes were removed. 459 dangling anonymous volumes remain globally and were not mass-pruned because their ownership is not limited to this project. |

Catalog-to-data-root verification currently resolves 47 of 51 game entries.
The only absent directories are the three still-unprovisioned Emulation
variants (NES, SNES, and PS2) and Midtown Madness 2; all other catalog paths
exist beneath `/home/ted/wasm-game-data`. PlayStation now has test media, but
still lacks its required BIOS/firmware contract.

## Local verification snapshot

- Root layout/source/data validation passes for 15 engines and 51 games.
- Contract suites pass for BUILD, CoD2 diagnostics, DOSBox, Emulation,
  GoldSource, id Tech 1/2/3, LithTech NOLF/NOLF2, Source, and Wolf3D.
- Fresh Ted-owned source checkouts and patch application were verified for
  BUILD, CoD2, DOSBox, id Tech 1 Crispy, id Tech 2 Quake/Quake II, id Tech 3
  RTCW, OpenRCT2, and Wolf3D.
- Historical GoldSource, id Tech 1, id Tech 2, Build-engine, and DOSBox browser
  proofs are retained, but the 2026-08-29 manual lab pass exposed regressions
  in several of those families. Doom 3 and RoE passed that manual session;
  Doom 3 MP, Quake 4 SP/MP, and Prey retain the blockers above. Current status
  is authoritative over an older launch proof.

## Definition of done for each game

- Has a dedicated `games/<game>` directory.
- Has a machine-readable source lock pointing only to Ted-owned GitHub forks.
- Has explicit engine-level and game-level patch series with deterministic order.
- Docker build fetches the pinned fork commit and applies those patches.
- Docker context contains no upstream source tree or game data.
- Data manifest points to `/home/ted/wasm-game-data` for local development and
  `/data` inside the container.
- Static/package contract tests pass.
- Browser smoke test reaches gameplay with keyboard, mouse, audio, save, and
  reload behavior checked.
- Runtime result and remaining defects are recorded in this tracker.
