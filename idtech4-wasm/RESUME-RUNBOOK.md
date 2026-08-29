# id Tech 4 resume runbook

Last updated: 2026-08-21 21:16 EDT.

This is the exact stopping point after the Doom 3 d3wasm conversion work. Do
not restart the discarded custom dhewm3/WebGL2 renderer lane. The canonical
engine is the pinned d3wasm GLES2/WebGL 1 source plus the verified patch queue.

## Shutdown state

- `wasm-doom3` is stopped.
- `wasm-doom3-mp` is stopped.
- `d3wasm-build-session` is stopped.
- The Chrome proof tab is closed or was already absent.
- Other Game Lab services were left alone.
- Nothing from this checkpoint was committed or pushed; the worktrees contain
  unrelated earlier work and must not be staged wholesale.

## What is actually proven

- The source mirror and all id Tech 4 patches reconstruct exact trees.
- Final Doom 3 and RoE d3wasm targets clean-build, and the staged six-variant
  package passes memory, renderer, adapter, worker, and package contracts.
- Chrome mounted all nine retail Doom 3 PK4s and initialized WebGL 1/GLES2,
  the GLSL renderer, the WebAudio/OpenAL bridge, and the base game.
- `game/mars_city1` reached native `gameplay` state. Real W-key events moved
  the native player from `(1239.05 -1501 68.25)` to
  `(1210.63 -1501 68.25)`, then to `(1177.56 -1501 68.25)`.
- Backquote opened the console and closed it back to native gameplay state.
- `doom3_formal_proof` saved and loaded in the same session; load restored the
  exact saved position `(1210.63 -1501 68.25) 180.0`.
- Audio was `running` with 197 buffers, 256 sources, and 27,786 starts at the
  formal checkpoint.
- Formal mouse input is not proven by automation because automated Chrome
  clicks could not grant pointer lock. Ted's manual mouse/capture behavior is
  user-tested, but keep the product status at **Still in development**.

The authoritative evidence is `proofs/d3wasm-checkpoint.json`.

## Persistence bug and exact stopping point

The first restart exposed that same-session saves were not durable. The old
game-code `FS.syncfs` ran before the outer session closed the save, screenshot,
and description files. A new final session hook now calls the framework-owned
`idtech4PersistenceSave()` only after every save file is closed, and the old
premature sync was removed.

Two older cross-reload saves failed and must not be used as evidence:

- `doom3_formal_proof`: created before the final flush existed.
- `doom3_persistence_fixed`: created while the old early sync still raced the
  new final sync; Chrome reported two `FS.syncfs` operations in flight.

The final build wrote `doom3_final_persist` without that overlap warning. The
page was restarted, but the user stopped the run before its post-restart load
could be checked. Its durability is therefore **unknown**, not passed or
failed. This is the shortest next test; do not repeat the long campaign proof.

## Resume commands

Start from the repository:

```sh
cd /home/ted/Development/wasm-games/idtech4-wasm
./scripts/apply-patches.sh
```

The final compiled and staged artifacts already exist. Rebuild only if source
or patches changed:

```sh
docker start d3wasm-build-session
docker exec -w /src/idtech4-wasm d3wasm-build-session sh -lc \
  'cmake --build .work/d3wasm/build-wasm --parallel 4 && cmake --build .work/d3wasm/build-wasm-roe --parallel 4'
./scripts/stage-site.sh
```

Recreate the final Doom 3 image only when staging changed:

```sh
WASM_GAME_FRAMEWORK_IMAGE=wasm-game-framework:0.9.6 \
  ./.work/wasm-game-framework/scripts/build-static-image.sh \
  ./build/site local/idtech4-wasm:doom3-dev doom3
```

Start only Doom 3:

```sh
cd /home/ted/Development/wasm-game-lab
docker compose up -d --force-recreate doom3
```

Open `http://127.0.0.1:8086/?proof=doom3-final-persist-resume`, click **Play**,
wait for the native menu, open the console with backquote, and run:

```text
loadgame doom3_final_persist
```

- If it reaches `testmaps/test_box` gameplay, record cross-reload persistence
  as passed in `proofs/d3wasm-checkpoint.json`.
- If the save is missing, add start/success/failure messages around
  `idtech4PersistenceSave` in `site/d3-worker.js`, rebuild only the site/image,
  create a new save in `testmaps/test_box`, and repeat one restart. Do not use
  either older failed save.
- For the remaining mouse gate, use one manual Chrome click to obtain pointer
  lock, move the mouse, click/release once, and verify the proof counters plus
  native view-position change. Browser automation alone could not grant the
  lock.

When finished, stop the two disposable services again if desired:

```sh
docker stop wasm-doom3 d3wasm-build-session
```

## Continue the broader id Tech 4 objective

Only after Doom 3 cross-reload persistence and one pointer-lock mouse pass:

1. Run the equivalent menu/gameplay/input/audio/save proof for RoE.
2. Prove Doom 3 multiplayer connection and gameplay; investigate bots only
   after the connection path works.
3. Retest Quake 4 SP/MP and then Prey. Prey remains blocked on black sustained
   gameplay after a complete Roadhouse load.
4. Keep every roster entry at **Still in development** until its own proof is
   complete.

## Validation and publication

After any changes:

```sh
cd /home/ted/Development/wasm-games/idtech4-wasm
./scripts/stage-site.sh
cd /home/ted/Development/wasm-games
node ./scripts/validate-layout.mjs
cd /home/ted/Development/wasm-game-lab
./validate.sh --images
```

Do not run `git add -A`. Both repositories contain broad mixed work. Review
and stage only the intended files. Do not push the parent repositories until
the larger user-requested game-family work is actually complete.
