# KIMI RUNBOOK — Source Wasm G-Man renderer resume

**For:** Kimi (Cursor CLI), called on this folder. **Written:** 2026-08-19.
**Read order:** `AGENTS.md` → `RUNBOOK.md` → `RUNBOOK-FREEZE.md` → this file.
This file only records what changed since `RUNBOOK-FREEZE.md` (2026-08-17) and
the exact steps to re-establish the paused state. The freeze doc remains the
authoritative mission/technical plan; follow its ordered execution plan §1–§8.

Do not commit this file (or anything) unless the user explicitly asks.

## Mission (unchanged)

One headed Chromium run on `d1_trainstation_01` with: native
`readEngineState()` = `gameplay`, a **recognizable** G-Man 3D intro scene on
the Source canvas, no fatal JS `RuntimeError`/WebGL abort, screenshot saved to
`/home/ted/Desktop/hl2-gman-intro-proof.jpg` (private; never committed/imaged).
Product status stays **Still in development** regardless.

## What changed since the freeze (verified 2026-08-19)

1. **Proof tree moved.** The user consolidated agent-created Desktop folders
   into `~/Desktop/old source reviews/`. The live proof tree is now:
   `/home/ted/Desktop/old source reviews/source-engine-patch-review-v12`
   Verified intact: full engine tree + `.wasm-build/` with the v311 build
   outputs (source-engine.wasm dated 2026-08-17 08:06). Source state = v311:
   the temporary `m_Config.bSoftwareSkin=true` force is **absent** from
   `studiorender/studiorender.cpp` (grep confirms). Incremental rebuilds are
   fast; do not reclone or reset this tree.
2. **`/tmp` game-site is gone** (tmpfs). `/tmp/source-wasm-game-site-v25.CSOjTe/game-site`
   no longer exists. Use a persistent replacement:
   `/home/ted/.local/share/source-wasm/game-site/` (create it). A game-site dir
   = only the game payload (`source-engine.js/.wasm[.worker.js]`,
   `game-adapter.js`, `wasm-game.json`, `wasm-game-data.json`,
   `data-validator.mjs`, `icon.svg`); the framework shell is served by
   `start.js` from the image's `/opt/wasm-game-framework/dist`.
   `scripts/build-web.sh` installs all of it (engine outputs + repo `web/`
   assets) into `$SOURCE_WASM_WEB_DIR`. A possibly-v311-era payload snapshot
   also exists at `~/Desktop/old source reviews/source-wasm-web-review-v12/`
   (reference only; prefer a fresh install from the proof tree).
3. **Runtime container is stale — do NOT `docker start` it.**
   `source-wasm-real-v26-run` (Exited) has bind sources that no longer exist
   (old Desktop path, dead /tmp path); starting it would create empty dirs /
   fail on the ISO file bind. `docker rm` it and recreate per below. The image
   `source-wasm-wasm:runbook-review-v26` is present and correct.
4. **Surviving inputs (verified):** Steam tree
   `~/.steam/debian-installation/steamapps/common/Half-Life 2`; ISO
   `~/Desktop/Half-Life 2 Collectors Edition (2153).iso`; combined owner data
   `~/.local/share/source-wasm/docker-v26-data/owner`. No proof screenshot
   exists yet (correct).
5. **Host port 8088 is taken** by the user's `wasm-wolfet` container. Many
   other wasm game containers are running — leave them alone. Our ports stay
   **18106** (HTTP) and **18202** (aux).
6. **No Codex browser-control extension.** Codex drove Chromium through its
   own extension; I don't have it. Use CDP instead (see harness below).
   Host has `node v24.19.0` (global `fetch` + `WebSocket`) and
   `/usr/bin/chromium`.

## Step 0 — re-establish the paused state

```bash
# 0a. Fresh persistent game-site populated with the exact v311 artifacts
#     (proof tree is untouched; waf no-ops and installs the v311 outputs).
mkdir -p /home/ted/.local/share/source-wasm/game-site
docker run --rm --name source-wasm-build-v311-reinstall \
  -v '/home/ted/Desktop/old source reviews/source-engine-patch-review-v12:/inputs/source:rw' \
  -v '/home/ted/.local/share/source-wasm/game-site:/opt/game-site:rw' \
  -e SOURCE_ENGINE_ROOT=/inputs/source \
  -e SOURCE_WASM_WEB_DIR=/opt/game-site \
  -e SOURCE_WASM_LOOP_DEBUG=1 \
  --entrypoint sh source-wasm-wasm:runbook-review-v26 \
  -lc 'unset SOURCE_WASM_TRACE; /opt/source-wasm/scripts/build-web.sh'

# 0b. Recreate the runtime container with corrected mounts.
docker rm source-wasm-real-v26-run
docker run -d --name source-wasm-real-v27-run \
  -p 18106:8088 -p 18202:8201 \
  -v '/home/ted/.local/share/source-wasm/game-site:/opt/game-site:ro' \
  -v '/home/ted/.steam/debian-installation/steamapps/common/Half-Life 2:/inputs/steam:ro' \
  -v '/home/ted/Desktop/Half-Life 2 Collectors Edition (2153).iso:/inputs/iso/hl2.iso:ro' \
  -v '/home/ted/.local/share/source-wasm/docker-v26-data:/data:rw' \
  -v '/home/ted/Desktop/old source reviews/source-engine-patch-review-v12:/inputs/source:rw' \
  -e SOURCE_WASM_SKIP_COMPILE=1 \
  -e SOURCE_ENGINE_ROOT=/inputs/source \
  -e SOURCE_WASM_WEB_DIR=/opt/game-site \
  source-wasm-wasm:runbook-review-v26
docker logs -f source-wasm-real-v27-run   # expect start.js on 8088
```

## Browser harness (CDP, replaces Codex's extension)

Launch headed Chromium on the user's display with CDP:

```bash
DISPLAY=:0 chromium --remote-debugging-port=9222 \
  --user-data-dir=/home/ted/.local/share/source-wasm/chromium-profile \
  --no-first-run --window-size=1280,800 about:blank &
```

Write a small Node harness (keep it OUT of the repo, e.g.
`/home/ted/.local/share/source-wasm/cdp-harness.mjs`) that:

1. Lists targets via `http://127.0.0.1:9222/json`, attaches WS to the page.
2. `Page.navigate` to a **fresh cache-busted** URL (change `cb=` every build):
   `http://127.0.0.1:18106/?game=hl2&cb=<unique>&source-wasm-map=d1_trainstation_01`
   (`source-wasm-map` is the adapter's headed-test hook; it calls
   `source_wasm_start_map` ~250 ms after start — game-adapter.js:604-615.)
3. Waits ≥1 s, clicks the framework Play button once
   (`Input.dispatchMouseEvent`, known-good viewport point ~`750,598` at
   1280×720 when semantic selection fails).
4. Polls native state with `Runtime.evaluate`: locate the live adapter on
   `globalThis` (framework game instance; adapter method `readEngineState()`,
   game-adapter.js:625). Valid states: `launcher/loading/menu/gameplay/paused/
   debrief/crashed`. Never infer gameplay from canvas/timeout.
5. Captures `Runtime.consoleAPICalled` + `Log.entryAdded`; watch for
   `RuntimeError`, WebGL errors, and the known-benign
   `Scene 'scenes/npc/Gman/gman_intro.vcd' missing!` (later bug, see FREEZE §"Verified inputs").
6. On a candidate: `Page.captureScreenshot {format:'jpeg'}` → save only when
   the full gate passes → `/home/ted/Desktop/hl2-gman-intro-proof.jpg`, then
   visually inspect the saved file before claiming success.

## Resume plan (from FREEZE; do not skip ahead)

1. **v311 baseline, once only:** expect native `gameplay` on
   `d1_trainstation_01`, G-Man studio draws returning, no `RuntimeError`,
   black canvas/probes. It is a diagnostic result, not a candidate.
2. **v312 = restore the visible CPU-skinned fork:** in the proof tree's
   `studiorender/studiorender.cpp`, save `m_pRC->m_Config.bSoftwareSkin`, set
   true around `CStudioRender::DrawModel`, restore on exit. Keep
   `STUDIORENDER_DRAW_NO_FLEXES`, white ambient cube, depth clear,
   BaseVertex-0/stream-offset draw, opaque Present. Rebuild (Step 0a command,
   new container name `source-wasm-build-v312`), new `cb=`, confirm v310's
   visible exploded skin triangles. If black: check cachebuster/artifact/
   Present-alpha clamp before touching studio math.
3. **Instrument the CPU vertex path, one frame, bounded logs** at the five
   exact boundaries in FREEZE §3 (FastVertex positions/NaN/minmax; struct vs
   format sizes; `CGLMBuffer::Unlock` handle/offset/count/hash/first floats;
   `FlushDrawStates` attribute offsets; drained GL error around the draw).
   Follow FREEZE's interpretation tree. High-risk suspects:
   `FastVertex→FastVertexSSE` routing in `public/materialsystem/imesh.h`
   (A/B against a fieldwise writer) and `g_bDisableStaticBuffer=true`.
4. **If still corrupt:** FREEZE §4 robust fallback — one fresh dynamic
   uncompressed mesh, expanded CPU-skinned vertices + group's
   `pGroup->m_pIndices`, no overrides, BaseVertex 0, no flex/compressed
   attributes/bone uniforms. Marked proof scaffolding only.
5. **Return to authored intro:** camera `-14576 -13880 -1212`, angles
   `-9 93 0`, FOV 40; remove the direct proof model; re-enable the 14-entity
   scene path; verify the t+0.2/t+6.0/t+6.1/t+9.0 timeline and fix the
   missing-VCD resolution bug before claiming the talking scene.
6. **Proof capture** per gate above.
7. **Promote proven fixes** into `scripts/apply-source-patches.mjs` +
   `patches/files/` (incl. replacing the stale base-vertex-dropping
   substitution with the reviewed three-file emulation), fresh-tree parity
   (`--check` → apply → `--check` = zero changes), fresh waf build, repeat
   the Chromium proof.
8. **Then** the durable `MAIN_MODULE`/`SIDE_MODULE` boundary (FREEZE §8).

## Hard rules (summary — AGENTS.md is authoritative)

- Never commit/image: engine tree, retail data, generated JS/WASM, ISO
  contents, private screenshots. `~/Desktop/old source reviews/` and
  `~/.local/share/source-wasm/` are private evidence, never repo inputs.
- The repo working tree is dirty with user work — never reset/discard it.
- Don't delete Desktop folders during the active loop; don't touch the user's
  other containers; don't contact upstream; framework stays pinned to 0.9.6.
- Don't author downstream HTML/CSS/SW/manifests. Status labels are exactly
  `Live` / `Still in development`.
- A menu/loading/canvas screenshot is not done. Report only native truth.

## Archaeology

Prior 22-hour Codex session (context for decisions, not instructions):
`~/.codex/sessions/2026/08/16/rollout-2026-08-16T10-15-05-01a00aed-175e-7d92-9806-91bc1aacc7f0.jsonl`
