# Modernized menu/input repair — 2026-09-04

The later [audio checkpoint](MODERNIZED-AUDIO-2026-09-04.md) supersedes this
image/source identity and the silent-client limitation. The menu repair and
its historical evidence below remain preserved in that installed image.

Installed at `http://127.0.0.1:8010/`. All seven Modernized titles pass native
multiplayer menu, console, movement, firing, and match-lifecycle checks using
the executable files served by the final image. These are real Wasm/relay
tests with fake DOM/2D output, **not Chrome pointer/rendering/audio acceptance**.
Chrome remains closed; the Chrome-control skill requires approval before
reopening it, and the earlier approval question remains unanswered.

RTCW was not changed. The user's confirmation that its renderer looks good
remains recorded in the main fix list.

## Changes and evidence

- DSDA single-player already implements menu mouse hitboxes, but the family
  shell's fixed `menuCursor: none` hid the browser cursor. The adapter now
  selects `browser` for Modernized single-player, `native` for Modernized
  deathmatch (Zandronum draws its own menu cursor), and `none` for
  Original/Smooth. The adapter regression covers every title/profile/mode.
- Zandronum's runtime-state export previously returned gameplay whenever
  `gamestate == GS_LEVEL`, including open menus and console. It now prioritizes
  menu/console state and reports pause/intermission separately. The
  [old-client negative control](modernized-menus-legacy-2026-09-04.json)
  reproduces gameplay reporting after Escape and the missing capture-loss hook
  in all seven titles.
- The new capture-loss hook opens the actual main menu, not just its active
  flag. Repeated calls leave it open. Direct browser key/button callbacks
  refresh native GUI routing before processing input, as the normal SDL tic
  does; an immediate keypress after the hook otherwise used stale gameplay
  routing. The native regression caught both mistakes during development.
- The sibling framework adds local-development `shell.setMenuCursor(mode)`.
  It updates released cursor policy without acquiring capture or changing
  engine state; captured gameplay stays hidden. The frozen `shell.config`
  exposes the current policy through a getter. Full framework tests pass,
  including policy changes, invalid-mode rejection, pointer delivery, and
  capture/release behavior. This is a local development delta on the existing
  0.9.6 pin, **not a claim about the published 0.9.6 release**. The canonical
  image build now rejects framework images missing this required method.

[Final-image native report](modernized-menus-2026-09-04.json) verifies Doom,
Doom II, TNT, Plutonia, Heretic, Hexen, and Chex. Each fetches the JS/Wasm/PK3
from its disposable image's HTTP server and proves:

- native join/snapshot, one human and two bots, advancing frames, movement,
  attack press and release;
- Escape menu open/close, capture-loss main-menu open/close, repeated hook
  idempotence, and console open/close;
- the existing selection/admission checks, stale-match rejection, and idle
  shutdown remain intact.

The diagnostic calls native input seams, not physical Chrome events. Browser
cursor alignment, hover/click behavior, fullscreen, capture timing, and audio
still require the approved Chrome-control workflow.

## Reproducible build and source

The canonical Zandronum patch remains based on
`bdd0f7beb43d9786cc13502395f60aa84d34e28d`.
[Exact reconstruction](zandronum-source-2026-09-04.json) compares all 2,785
tracked/patched files against the prepared build checkout:

- patch SHA-256:
  `041b208034fc603a51b3df3db670981c3ac7a0235336e402eea7a93ae91a3721`;
- reconstructed tree: `2a40619fd2c6c73a6d0f71f793766ae1e1dcb1b7`.

The new `docker/Dockerfile.toolchain` adds native code-generator/server build
dependencies to the pinned Emscripten 6.0.6 image
`sha256:be96eff5810e42c632f3f8b795388a6b596e4fb21ec28b9e1fb1bc49bb3b1eef`.
No host packages were installed. Starting without native/Wasm build caches
exposed that the script built only `zdoom`, omitting its independent PK3
targets. `build-zandronum.sh` now explicitly builds `pk3`, `brightmaps_pk3`, and
`skulltag_actors_pk3`. The completed rebuild produces all three support packs
byte-identical to the previously installed ones.

From the family repository:

```sh
docker build -f docker/Dockerfile.toolchain -t local/idtech1-toolchain:6.0.6 docker
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD:/workspace/idtech1-wasm" -w /workspace/idtech1-wasm \
  -e IDTECH1_BUILD_JOBS=8 local/idtech1-toolchain:6.0.6 \
  bash scripts/build-zandronum.sh
node scripts/test-zandronum-source.mjs
bash scripts/test-static.sh
IDTECH1_TEST_IMAGE=local/idtech1-wasm:menu-input-candidate \
  IDTECH1_TEST_FROM_IMAGE=1 node scripts/test-managed-matches.mjs
IDTECH1_TEST_IMAGE=local/idtech1-wasm:match-selection-candidate \
  IDTECH1_TEST_FROM_IMAGE=1 node scripts/test-managed-matches.mjs --expect-menu-bug
```

The last command expects the old menu defects while still requiring successful
native joins and selection checks. Test containers use isolated loopback ports,
read-only owner-data binds, and automatic removal; they do not wake the lab.
The full static suite now includes exact Zandronum reconstruction as well as
the prior Crispy source, adapter, package, validator, and HTTP checks.

## Deployment and preservation

[Live verification](modernized-menus-live-2026-09-04.json):

- image: `sha256:408d66793b0f11c9a3a327ef41c0841800a27e468b3417e46e62384055cd110d`,
  tags `idtech1-wasm:dev` and `local/idtech1-wasm:menu-input-candidate`;
- container: `94f73621cfe0eeb01ec50100c27a9f3829d5eb0cf9d75bbd3a6b6683f198a967`;
- rollback retained as `local/idtech1-wasm:match-selection-candidate`, image
  `sha256:c43203b29bce3a03b40b650064b5306bc6e80f5e04f4e4572989eb6614f801d9`.

A targeted layer changes only the adapter, Zandronum JS/Wasm, and both image
copies of the shared framework runtime JS. A 53-file comparison confirms the
remaining audited engines, support packs, server/relay code, and framework
files are unchanged. In particular, this does not roll out the separate
GoldSource-only framework bootstrap/logger repair.

Pre/post lab image audits pass. All 31 other lab containers retain their IDs.
The live adapter/framework/client bytes match the tested files, all seven
owner-data gates are ready, and private `/data/DOOM.WAD` returns 404. Data binds,
ports, and restart policy are unchanged. No game data or saves were deleted or
embedded in images. Temporary build/diagnostic containers were removed.

Detailed build/test logs, the targeted Dockerfile, inventories, and file hashes
are retained in `/tmp/idtech1-menu-repair.zGxrKY`. Changes remain local and
uncommitted in the family and sibling framework worktrees.

## Remaining work

- Chrome acceptance for these menu fixes and the prior startup/selection
  repairs; the old console-only symptom is not considered fully retested.
- Original/Smooth deathmatch still requires two humans and has no bots.
- At this checkpoint Zandronum's `NO_SOUND=ON` selected a null renderer. The
  later audio checkpoint supplies `BROWSER_SOUND` output while retaining that
  switch to exclude desktop dependencies; audible Chrome acceptance remains.
- The wider portfolio checklist remains incomplete.
