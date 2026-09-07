# Classic startup repair — 2026-09-04

The later [classic Chrome checkpoint](CLASSIC-CHROME-2026-09-04.md) supersedes
the live adapter/image/container IDs below. These classic engine artifacts and
their startup repair remain unchanged in that deployment.

Original and Smooth now pass native-Wasm startup and controls checks for Doom,
Doom II, TNT, Plutonia, Heretic, Hexen, and Chex Quest. The repaired classic
engines and adapter are installed at `http://127.0.0.1:8010/`.

This checkpoint itself is **not Chrome acceptance**. Chrome was closed when
these native tests ran; reopening was subsequently approved and all fourteen
Original/Smooth combinations received the bounded browser checks linked above.
The diagnostic below executes real shipped
Wasm with fake DOM, SDL software/2D presentation, and an in-memory WebAudio
destination. It does not verify GPU rendering, pointer capture, audible output,
fullscreen, persistence across browser reload, or multiplayer.

## Root cause and repair

`OPL_Detect` calls `OPL_Delay`, which queues a callback driven by SDL's mixer.
The old implementation calls `SDL_CondWait` before its historical Emscripten
sleep. That blocks the same thread needed to deliver the browser audio callback:
native startup never reaches OPL detection success or the main loop. All three
old engines reproduce the deadlock with audio enabled; disabling sound bypasses
it. This is unrelated to the previously resolved Modernized muted-tab report.

`patches/crispy-opl-browser-wait.patch` removes the thread condition/mutex wait
only for `CRISPY_WASM`. Asyncify yields until the actual queued OPL callback
fires. A simple elapsed-time substitution would be wrong because the OPL timer
must advance through the mixer. Native desktop behavior remains unchanged.

The adapter also wrote ASCII/SDL symbols into Crispy configuration fields that
expect DOS scan codes. Defaults now correctly encode W/S, A/D, Q/E, and Space.
Crispy's alternate WASD bindings masked some bad primary bindings; W was not
actually unbound. The native negative control specifically proves old Q does
not turn while the corrected Q does. The old Space configuration selected D.

Returning configurations are migrated only when all seven bindings match the
old adapter fingerprint. The original is retained as
`default.cfg.pre-scancode-fix`; unrelated settings and formatting are preserved.
Customized layouts and existing backups are not overwritten.

Source preparation had a separate pre-existing ordering defect: the lobby
patch depended on the multiplayer telemetry patch but ran first. The order is
fixed, `sources.json` lists the complete ordered patch set, and preparation no
longer deletes upstream Markdown. Existing ignored-source Markdown deletions
were not expanded or restored. Fresh reconstruction preserves those files.

## Evidence

- [32-case matrix](crispy-startup-2026-09-04.json): seven titles × Original/
  Smooth × title-menu/direct-level startup, plus three initially suspended audio
  cases and one sound-disabled control. All pass. Checks include advancing
  frames, native menu New Game, W movement, Q turning, fire press/release,
  Escape menu/resume, and nonzero PCM when sound is enabled. Doom's native melt
  transition completes before input assertions; Hexen's weapon animation is
  allowed to finish before checking attack release.
- [Old-engine negative controls](crispy-startup-legacy-2026-09-04.json): all three
  engines exceed the bounded startup deadline with zero mixer callbacks and
  zero main-loop frames. Passing this negative test means the old bug reproduced.
- [Old-key negative control](crispy-legacy-keys-2026-09-04.json): corrected engine,
  old Q config, advancing gameplay but unchanged heading.
- [Source reconstruction](crispy-source-2026-09-04.json): exact comparison of
  629 C/header files, complete patch-order agreement, Markdown preservation, and
  rejection of a cached checkout missing the startup repair.
- `scripts/test-static.sh` passes: adapter contracts including fresh/legacy/
  customized configs and backup preservation, source reconstruction, installed
  WAD validation, framework package contract, and static HTTP/private-data checks.
- Candidate/live HTTP checks verify all six rebuilt artifacts and the adapter
  byte-for-byte, seven ready owner-data gates, and private `/data/DOOM.WAD` = 404.
- Pre/post lab image audits pass. Only the `idtech1` lab service changed; all 31
  other running lab containers retain their IDs. The completed SDK build and
  isolated read-only-data HTTP probe were disposable and are no longer running.

Re-run from this directory (owner WADs remain outside Git and images):

```sh
./scripts/test-static.sh
node scripts/test-crispy-matrix.mjs
node scripts/test-crispy-runtime.mjs doom --expect-unbound-turn
```

For the old-engine control, set `IDTECH1_RUNTIME_DIR` to the original artifacts
and run `node scripts/test-crispy-matrix.mjs --expect-deadlock`.

## Build and installed provenance

- Source: owner mirror `theodorecharles/idtech1-wasm`, commit
  `7775ef82d1e9dfd50eb9d2824acefaeff7247458`.
- Reconstructed source tree: `dee5ace6d511b3ae8b874da36853d704300050d5`.
- OPL patch SHA-256:
  `04d0186348298f3a88a0bcd5895c0dbd9456c43dd9fbbaaeaa24c1cd45a136f0`.
- SDK: Emscripten 6.0.6 image
  `emscripten/emsdk@sha256:be96eff5810e42c632f3f8b795388a6b596e4fb21ec28b9e1fb1bc49bb3b1eef`.
- Build: independent `wasm/CMakeLists.txt`, Release, all three Crispy targets,
  existing Asyncify/SDL configuration. No engine behavior was replaced by a
  test implementation. The full canonical `scripts/build-web.sh` remains valid;
  this repair rebuilt/staged only Crispy to preserve unrelated engines.
- Live image: `sha256:a9a8e915e3b764066fddcfbc0b25cb7dad9b3f0f1461739b38298ebf3be1a9f1`,
  tagged `idtech1-wasm:dev` and `local/idtech1-wasm:opl-startup-candidate`.
- Live container: `1cecb2aee47686b1d49a63b5c6c625d0eb72023c5df31db0b362709f5a3ead80`.
- Retained rollback image:
  `sha256:e9fe3b8ad374d1caaf37df174a6d4278f273424f3bb6e46f6ad7318c481865c0`,
  tagged `local/idtech1-wasm:before-opl-20260904`.
- Adapter SHA-256:
  `fd7046736c9a437202e407c2f4db5cca3f3e7ffdf2dd45503d80ef9e8c76ef81`.

Per-engine JS/Wasm hashes are embedded in each matrix case. The image is a
targeted layer on the exact retained pre-repair image: only six Crispy files and
`game-adapter.js` change. The compared DSDA/Zandronum artifacts, support assets,
shared framework, supervisor/proxies, and native servers are byte-identical
(51 files audited, seven changed). Framework remains 0.9.6 at its existing pin.
The owner bind remains `/home/ted/wasm-game-data/crispy:/data`; no WADs or saves
were deleted, copied into the image, or rewritten on the host.

Build logs, original artifacts, the targeted image Dockerfile, inventories, and
hash comparisons are retained in `/tmp/idtech1-opl-repair.hpl0WU`. Source changes
are local and uncommitted. No push or framework repin occurred.

## Still open

The later Chrome checkpoints add actual startup/rendering, cursor, physical
firing and managed Modernized-match evidence. Classic bots, sustained browser
keyboard movement, audible listening and the later checkpoints' explicit
limits remain open. This native repair alone does not clear those issue rows.
