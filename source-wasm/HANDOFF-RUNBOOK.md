# HANDOFF RUNBOOK — source-wasm Portal/HL2 browser proof

**Written:** 2026-08-19 (Kimi / Cursor CLI). **For:** whoever picks this up next.
**Read order:** `AGENTS.md` (hard rules) → this file → `RUNBOOK-FREEZE.md` (original HL2 mission) → `KIMI-RUNBOOK.md` (HL2 resume plan).
Do **not** commit this file (or anything) unless the user explicitly asks.

---

## 1. TL;DR — where it is right now

- **Goal pivoted:** get **Portal** rendering in the browser first (a known-working
  reference port exists), then apply the proven concepts back to the HL2 G-Man intro.
- **Status:** The Portal engine **boots to native `gameplay`** on `testchmb_a_00`
  with **no fatal `RuntimeError`** and the player spawns at the correct
  `info_player_start`. The camera is at the player eye with the right FOV.
- **The wall:** the 3D scene renders **black**. Root cause is now **confirmed by
  ground truth** (see §4): the precompiled `steam_legacy` pixel-shader `.vcs`
  files are **incompatible with the proof-tree engine's shader runtime** — the
  engine requests static combo IDs that simply **do not exist** in the `.vcs`.
- This is **not** a crash, **not** a spawn bug, **not** a camera bug. Those are
  all fixed. It is a **shader-compilation-version mismatch**.

---

## 2. The pivot (why Portal)

User direction: *"add portal to the source-wasm roster… focus on getting portal
working first, then we can apply the concepts to half life 2."*

Rationale: weliveinhell's `source-engine` is a **working Portal webport**
(Emscripten + ToGLES → WebGL2). Portal is the easier, already-proven target.
The repo now has a `portal` variant alongside `hl2` (manifest, data policy,
combine/generate scripts, adapter, tests, docs all updated).

---

## 3. Environment / key paths (all verified 2026-08-19)

| Thing | Path / value |
|---|---|
| Repo (this) | `/home/ted/Development/wasm/source-wasm` |
| **Proof tree** (2017 ToGL/TOGLES leak, patched) | `/home/ted/Desktop/old source reviews/source-engine-patch-review-v12` |
| HL2 game-site (payload) | `/home/ted/.local/share/source-wasm/game-site/` |
| **Portal game-site** (payload) | `/home/ted/.local/share/source-wasm/game-site-portal/` |
| Portal Steam install | `~/.steam/debian-installation/steamapps/common/Portal` |
| HL2 Steam install (steam_legacy) | `~/.steam/debian-installation/steamapps/common/Half-Life 2` |
| HL2 ISO (2014 GOTY/Collectors) | `~/Desktop/Half-Life 2 Collectors Edition (2153).iso` |
| Combined owner data | `~/.local/share/source-wasm/docker-v26-data/owner` |
| Docker image | `source-wasm-wasm:runbook-review-v26` |
| **Portal container (running)** | `source-wasm-portal-v1-run` → host **http://127.0.0.1:18107** |
| HL2 container (running) | `source-wasm-real-v27-run` → host **http://127.0.0.1:18106** |
| CDP harness (keep OUT of repo) | `/home/ted/.local/share/source-wasm/cdp-harness.mjs` |
| Portal proof runner | `/home/ted/.local/share/source-wasm/run-portal-proof.sh` |
| **VCS dumper (new)** | `/home/ted/.local/share/source-wasm/dump_vcs.py` |
| Host tooling | `node v24.19.0`, `/usr/bin/chromium`, display `:0` |

A **game-site dir** = only the payload (`source-engine.js/.wasm[.worker.js]`,
`game-adapter.js`, `wasm-game.json`, `wasm-game-data.json`, `data-validator.mjs`,
`icon.svg`). The framework shell is served by `start.js` from the image's
`/opt/wasm-game-framework/dist` (pinned to wasm-game-framework **0.9.6**).

---

## 4. THE CURRENT BLOCKER — shader combo mismatch (CONFIRMED)

### Symptom
Engine reaches `gameplay`, correct spawn, correct camera, but the world is black.
Console shows repeated:

```
Shader 'lightmappedgeneric_ps20b' - Couldn't load combo 149376 of shader (dyn=288)
```

(also `skin_ps20b.vcs`, `vertexlit_and_unlit_generic_ps20b.vcs`). `lightmappedgeneric`
is the pixel shader for **all lightmapped world geometry** → no valid shader → black.

### Ground truth (from `dump_vcs.py`, run 2026-08-19)
Dumped `shaders/fxc/lightmappedgeneric_ps20b.vcs` out of
`hl2/hl2_misc_dir.vpk` (steam_legacy):

```
header: ver=6 dynCombos=96 numStatic=2188 crc=0xf1bb317d
static combo records: count=2188  first10=[0, 2, 3, 4, 6, 7, 8, 10, 11, 12]
lastID=0xffffffff (sentinel)   real IDs: min=0 max=8946484 count=2187
-> want staticID 518    : MISSING
-> want staticID 149376 : MISSING
```

### Interpretation (the smoking gun)
- The engine computes `lookup.m_nStaticIndex` (e.g. **149376**) as a **weighted sum**
  of static `#define`s via `GetIndex()` in the proof tree's
  `materialsystem/stdshaders/fxctmp9/lightmappedgeneric_ps20b.inc`
  (weights `96*MASKEDBLENDING + 192*BASETEXTURE2 + 384*DETAILTEXTURE + …`).
- It then looks up static combo `149376 / dynCombos`. The engine read `dynCombos=288`
  → `149376/288 = 518`. **Neither 518 nor 149376 exists in the file.**
- The `.vcs` keys its static combos as **small sequential IDs `0,2,3,4,6,…`** —
  a **completely different numbering scheme** than the engine's weighted-sum output.
- **Conclusion:** the proof-tree engine's shader `.inc` enumeration does **not**
  match the source Valve used to compile the `steam_legacy` `.vcs`. Precompiled
  retail shaders are **not drop-in compatible** with this leak engine's runtime.

### Secondary discrepancy worth chasing
The **engine** logged the header as `dyn=288, numStatic=2535`, but the **on-disk
steam_legacy file** is `dyn=96, numStatic=2188`. So either:
- the engine is reading a **different** `lightmappedgeneric_ps20b.vcs` from the
  overlay order (AGENTS.md: shaders come from `steam_legacy`, overlaid on the 2014
  ISO extract — there may be two copies), **or**
- the range-lazy VPK read is still returning shifted bytes for this file.

**First diagnostic to run:** byte-compare the `.vcs` the adapter serves vs. a direct
VPK extraction (hash both). If they differ → range-lazy bug. If they match → the
engine is genuinely opening a different overlaid file; find which.

---

## 5. Fix catalog — everything already applied to the proof tree

All fixes are in the **proof tree** (NOT yet promoted into
`scripts/apply-source-patches.mjs` / `patches/files/` — that's a pending task).
The recurring disease: the **monolithic Emscripten link** (`-Wl,--allow-multiple-definition`)
merges same-named client/server globals and vtables → `RuntimeError: null function`.
The recurring cure: **rename the server's symbol** (`-D`/​`#define …Server`) or guard
the client path.

| # | Fix | File(s) |
|---|---|---|
| 1 | `CShaderSystem::LoadModShaderDLLs` EMSCRIPTEN early-return (skip statically-linked `game_shader_dx6.so` double-register → `exit(1)`) | `materialsystem/` |
| 2 | Rename server `engine` → `engineServer` | `game/server/enginecallback.h` |
| 3 | `-D` rename shared **non-networked** classes for server build (e.g. `CCollisionProperty`); **excluded networked entities** (renaming them broke `DT class` net protocol) | `game/server/wscript` |
| 4 | **Base64** encode/decode synchronous range reads (Chromium `responseText` UTF-16 was dropping 1 byte → adapter `subarray` stall) | `web/game-adapter.js`, `scripts/start.js` |
| 5 | Poll native `source_wasm_mod_ready()` instead of fixed `setTimeout(250ms)` (engine boot race: `start_map` fired before mod DLLs loaded → `serverGameDLL==NULL`) | `web/game-adapter.js`, `engine/source_wasm_exports.cpp`, `scripts/waifulib/source_wasm.py` |
| 6 | `Network.setCacheDisabled(true)` in CDP harness (stale Chromium profile cached old engine/adapter) | `cdp-harness.mjs` |
| 7 | Rename server anim-state classes `CMultiPlayerAnimState`, `CPortalPlayerAnimState`, `CreatePortalPlayerAnimState` | `game/server/wscript` |
| 8 | `#ifdef EMSCRIPTEN return;` guards on client interpolation (`Interp_RestoreToLastNetworked` etc. — watchers never set up for browser ents) | `game/client/c_baseentity.cpp` |
| 9 | Rename server `enginetrace` → `enginetraceServer` | `game/server/enginecallback.h` |
| 10 | Rename server `g_pGameRules` → `g_pGameRulesServer` | `game/server/enginecallback.h` |
| 11 | Guard model-dependent setup in `CBasePlayer::SharedSpawn` with `if (GetModelPtr())` | `game/shared/baseplayer_shared.cpp` |
| 12 | Rename server `g_StringTableGameRules` → `g_StringTableGameRulesServer`; **direct-instantiate `CPortalGameRules`** in `InstallStringTableCallback_GameRules` (client) to bypass broken string-table replication + merged `s_pHead` | `game/server/enginecallback.h`, `game/shared/gamerules_register.cpp` |
| 13 | Make hardcoded HL2-intro spawn/camera **conditional** on map name / `source_wasm_is_intro_proof_mode()` | `game/server/player.cpp`, `game/client/view.cpp` |
| 14 | Force `FindPlayerStart("info_player_start")` for Emscripten — `gpGlobals` is a merged client+server global; server's `startspot` read lands past the smaller client object → garbage string → spawn at world origin in a wall | `game/server/player.cpp` (`EntSelectSpawnPoint`) |
| 15 | **Build config fix:** image's baked `build-web.sh` hardcoded `--build-games hl2`; mount the repo's corrected script so `waf configure --build-games portal` actually takes | `scripts/build-web.sh` (mounted over image) |
| 16 | Disable the view-entity override for Emscripten (`if (false)`) — merged view entity 76 was stealing the camera and rendering black | `game/client/view.cpp` (`SetUpViews`) |
| 17 | Shader **combo-miss probe** (logs header + static-record range on failure) | `materialsystem/shaderapidx9/vertexshaderdx8.cpp` |

**Net:** 8 distinct monolithic-merge crashes fixed; engine now boots clean to gameplay.

---

## 6. How to reproduce the current state

```bash
# Portal container is already running on :18107 (source-wasm-portal-v1-run).
# Headed Chromium with CDP + cache disabled:
DISPLAY=:0 chromium --remote-debugging-port=9222 \
  --user-data-dir=/home/ted/.local/share/source-wasm/chromium-profile \
  --no-first-run --window-size=1280,800 about:blank &

# Drive it (auto-dismisses dialogs, polls readEngineState, screenshots):
/home/ted/.local/share/source-wasm/run-portal-proof.sh
# or directly:
node /home/ted/.local/share/source-wasm/cdp-harness.mjs \
  'http://127.0.0.1:18107/?game=portal&cb=<unique>&source-wasm-map=testchmb_a_00'
```

Expected now: `readEngineState()` → `gameplay`, no `RuntimeError`, black canvas,
`Couldn't load combo … lightmappedgeneric_ps20b` in console.

Rebuild the Portal engine after editing the proof tree (note the **mounted
build-web.sh**, fix #15):

```bash
docker run --rm --name source-wasm-build-portal \
  -v '/home/ted/Desktop/old source reviews/source-engine-patch-review-v12:/inputs/source:rw' \
  -v '/home/ted/.local/share/source-wasm/game-site-portal:/opt/game-site:rw' \
  -v '/home/ted/Development/wasm/source-wasm/scripts/build-web.sh:/opt/source-wasm/scripts/build-web.sh:ro' \
  -e SOURCE_ENGINE_ROOT=/inputs/source \
  -e SOURCE_WASM_WEB_DIR=/opt/game-site \
  -e SOURCE_WASM_GAMES=portal \
  --entrypoint sh source-wasm-wasm:runbook-review-v26 \
  -lc 'unset SOURCE_WASM_TRACE; /opt/source-wasm/scripts/build-web.sh'
# then bump cb= in the URL
```

---

## 7. Reference-port insights (from slqnt's blog + weliveinhell's repo)

Sources: [slqnt.dev/blog/hl2-in-web](https://www.slqnt.dev/blog/hl2-in-web),
[github.com/weliveinhell/source-engine](https://github.com/weliveinhell/source-engine).

- **Facial animations were DISABLED entirely** — they caused too much instability
  in the browser. G-Man's intro plays with a frozen face. **→ We should disable the
  choreo/flex/scenefile system for stability** (this is the trick the user heard about).
- **ToGLES rendering mode** (from nillerusr's fork): the engine speaks OpenGL ES and
  Emscripten translates GLES → WebGL2. Almost no rendering work needed. We already
  use a ToGL/TOGLES tree.
- **They BUILD the shaders from the same tree.** nillerusr's repo compiles
  `stdshaders`, so the `.inc` `GetIndex()` and the resulting `.vcs` are **generated
  together → consistent**. This is exactly why they don't hit our combo mismatch.
  **Our bug comes from pairing the leak engine with precompiled `steam_legacy` `.vcs`.**
- **Asset loading is totally different:** they add a `printf` to
  `filesystem/basefilesystem.cpp` to log every asset the engine requests, then pack
  those into **per-map `.data` chunks** (`repackage.js`). We instead serve whole VPKs
  **range-lazy over HTTP**. Their approach sidesteps all our sync-XHR/range-lazy pain.
- **`steam_legacy` branch is required** — the current HL2 Steam build is too new for
  this engine. We already do this.
- **Known rendering caveats (weliveinhell README):** *"sometimes render breaks
  (something related to lightmaps?)"* and *"pitch-black water."* Lightmapped/water
  shaders are the fragile area — consistent with our `lightmappedgeneric` wall.

---

## 8. Next steps (prioritized)

1. **Resolve the shader combo mismatch** (the whole ballgame right now):
   - **a.** Byte-compare the `.vcs` the adapter serves vs. direct VPK extraction
     (rule out residual range-lazy corruption; explains the dyn 288-vs-96 header gap).
   - **b.** Identify which overlaid file the engine actually opens (ISO extract vs.
     steam_legacy) and why its header differs.
   - **c.** The real fix, matching the reference ports: **build the proof tree's own
     `stdshaders`** so `.inc` and `.vcs` are consistent — OR find precompiled `.vcs`
     that match this exact 2017 leak tree's shader enumeration. (Shader compile
     tooling is the hard part; investigate how nillerusr/weliveinhell invoke it.)
2. **Disable facial animations / choreo** (reference-port strategy) for stability.
3. **Capture the Portal proof** once a recognizable scene renders:
   `readEngineState()=gameplay` + recognizable scene + screenshot.
4. **Apply proven concepts back to HL2** (G-Man intro gate per KIMI-RUNBOOK).
5. **Promote all §5 fixes** into `scripts/apply-source-patches.mjs` + `patches/files/`,
   verify fresh-tree parity (`--check` → apply → `--check` = zero changes).

---

## 9. Hard rules (AGENTS.md is authoritative)

- Never commit/image: the engine tree, retail data, generated JS/WASM, ISO contents,
  private screenshots. `~/Desktop/old source reviews/` and `~/.local/share/source-wasm/`
  are private evidence, never repo inputs.
- The repo working tree is dirty with user work — never reset/discard it.
- Don't touch the user's other containers (many wasm game containers are running).
- Don't contact upstream. Framework stays pinned to wasm-game-framework **0.9.6**.
- Don't author downstream HTML/CSS/SW/manifests. Status labels are exactly
  `Live` / `Still in development`.
- A menu/loading/canvas screenshot is **not** done. Report only native
  `readEngineState()` truth. Never describe a failed start as playable.
