# wolf3d-wasm implementation runbook

This downstream project starts from the native Wolf4SDL source. Its
Emscripten target, launcher, data
mount, main-loop adaptation, audio path, input policy, persistence, server
lifecycle, and Docker packaging are implemented here; no existing Wolfenstein
3D WASM port is an implementation input.

Never submit work upstream. Never commit, upload, or package game data.

## Current checkpoint

`./build-web.sh` produces separate Wolfenstein 3D and Spear of Destiny
SDL1/Emscripten modules in `build-web/dist/`. Framework 0.9.4 at
`c4ad3b9e075f881d32f044299fbfeee703a9169d` owns the canonical launcher, exact
container provisioning, browser IndexedDB cache, 4:3 canvas, input capture,
fullscreen preference, and PWA installation metadata. The adapter mounts the
selected variant's eight `.WL6` or `.SOD` files under `/game` and starts the
matching native engine only after all are present. The browser target uses an
in-process SDL1 PCM mixer for digitized effects plus the native software OPL
callback for music. Every mapped digitized sample is prepared after the page
manager opens VSWAP; the browser no longer depends on unavailable SDL_mixer
binaries. The
original
blocking loop runs on an Emscripten pthread while SDL presentation is proxied
to the browser thread, keeping the page responsive without Asyncify.

Build and serve:

```bash
./build-web.sh
./serve-web.sh 8011
```

Steam completed the Wolfenstein 3D install during the 2026-08-14 checkpoint.
The portfolio Docker lab stages the required data outside Git. The framework
server exposes only exact validated files through `/game-data/files/<key>`;
`/data` remains private. Each browser caches those files once in IndexedDB.
Chrome confirmed the exact data-ready state for both variants, rendered their
authentic menus, accepted keyboard selection, and launched each first level
into rendered gameplay.
The browser path keeps the native palette-indexed renderer: Emscripten SDL1
palette surfaces are copied and unlocked explicitly so its canvas layer expands
the 8-bit frame into RGBA. No alternate renderer or existing WASM port is used.
The web input policy maps W/S to forward/back, A/D to strafe, and accumulated
relative mouse X to turning while deliberately discarding mouse Y because the
game has no vertical view axis. Save/config persistence is isolated at
`/persistent/wolf4sdl/{variant}` and restored before native main. The
Wolfenstein 3D files are `AUDIOHED.WL6`,
`AUDIOT.WL6`, `GAMEMAPS.WL6`, `MAPHEAD.WL6`, `VGADICT.WL6`, `VGAGRAPH.WL6`,
`VGAHEAD.WL6`, and `VSWAP.WL6`; Spear uses the corresponding eight `.SOD`
files. Do not mount `CONFIG.WL6` or `CONFIG.SOD` as immutable game data: the
engine writes current settings under the persistent root.

Chromium evidence from 2026-08-15:

1. Both isolated Docker images reported all eight selected files ready. The
   first Spear launch used the container and its second launch used the browser
   cache; Wolfenstein also restored from the browser cache.
2. Play kept both pages responsive while each original blocking loop ran on an
   Emscripten worker.
3. Wolfenstein rendered its authentic menu, episode and difficulty screens,
   then launched Episode 1, Floor 1. Spear rendered its authentic menu and
   difficulty screen, then launched its first level.
4. Wolfenstein prepared 46 digitized samples. Real movement into enemy combat
   and weapon input advanced its digitized-start counter from 3 to 21, with an
   active mixer channel observed during fire. Spear prepared 40 samples and
   weapon input advanced its counter from 3 to 8. Both AudioContexts were
   running.
5. Both engines reported the complete five-bit WASD/horizontal-mouse control
   mask. Menu/gameplay/paused states were published and capture was released on
   pause. The automation-controlled Chrome surface did not grant pointer lock,
   so actual pointer-lock acquisition remains a manual-browser check; the
   adapter's capture request/loss behavior is covered by its contract test.
6. Both canvases remained 4:3 at their observed window sizes, and neither
   launch emitted browser warnings or errors. Controller support is currently
   disabled for both variants.

The source audit found the missing combat-audio cause: the old web
guard skipped every call to `SD_PrepareSound`, leaving mapped weapon and enemy
effects with null mixer chunks while music and unmapped AdLib effects worked.
Both modules now prepare PCM chunks and expose prepared/start/active counters
to `data-wolf-audio-*` attributes. The serialized Chromium pass confirmed
sample preparation, mixer starts, active channel delivery, and real gameplay;
automation cannot make a human audibility judgment, so a final listening check
remains appropriate before either title is promoted.
