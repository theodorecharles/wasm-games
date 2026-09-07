# Counter-Strike menu global isolation — 2026-09-06

The native Resume-button failure, missing Console/Disconnect controls and lost
menu background share one cause: the CS menu and weapon client exported the
same `gpGlobals` symbol for incompatible structures. The menu-only fix is now
installed and verified through actual Chrome on 8017.

## Cause and narrow repair

In the pinned `mainui_cpp` source, `Utils.h` declares `ui_globalvars_t *gpGlobals`;
`GetMenuAPI` sets it to the engine's menu globals. Screen width/height, developer
visibility and multiplayer checks use this pointer. The unchanged CS client
instead exports `globalvars_t *gpGlobals`. `HUD_InitClientWeapons` assigns it
to the client's dummy `Globals` object. Both old side modules import the same
symbol through Emscripten's shared `GOT.mem`, so the client assignment replaces
the menu pointer. Its screen dimensions and other fields then read unrelated
dummy-client fields, commonly zero. Mouse-coordinate bounds and background
scaling break; Console and Disconnect visibility also become wrong.

[menu-globals.patch](../games/counter-strike/patches/cs16/menu-globals.patch)
gives only the menu's declaration hidden visibility under `__EMSCRIPTEN__`.
Its definition and all references become private to the menu side module.
The CS client, renderer, engine, native server and non-Wasm declarations are
unchanged. Resume's callback was already `UI_CloseMenu`, the same function used
by Escape; neither callback needed changing.

The [actual-Wasm regression](../scripts/test-cs-menu-globals.mjs) instantiates
the exact menu and CS client with shared memory/table/GOT. It executes the real
`GetMenuAPI`, then the real weapon initializer through its first global write.
It deliberately stops at the first unprovided engine callback (`GetClientTime`);
this is a narrow ABI test, not simulated full-engine/gameplay acceptance.
The [paired result](cs-menu-globals-2026-09-06.json) shows the old menu/client
sharing pointer cell 1148792 and fields `[1424,1057,32,1]` becoming `[0,0,0,0]`.
The repaired menu retains those fields; the client uses its own cell 4336720.

The package export comparison requires every other export to remain identical:
only the menu's `gpGlobals` export/GOT import disappears. Source pins remain
cs16-client `d6ff2a863cf38d17f3610114d32bc3bd77ff3afa` and mainui_cpp
`024efda8f2078ba27767ce1140d4c6394beeb0f5`. The updated build script applies both
checked patches and builds only the menu with emsdk 4.0.17. A clean fork/pin
rebuild and the incremental retained-source build produce the identical SHA-256
`aa34b47854c6321cc3a3bd7241edc1c09eb3ecd63753f827f7a6e62f94713867`.
Clean-build log: `/tmp/goldsource-cs-menu-clean-build-20260906.log`.

## Candidate Chrome

Isolated candidate 32946 uses a read-only bind of the active owner installation.
Native Play → Join Game reaches textured `de_dust2` and native team/appearance
selection. The server naturally rotated from the earlier release's `de_dust`;
no map command or server restart was used.

After team/appearance auto-select, Escape opens the
[intact pause menu](cs-menu-globals-candidate-paused-2026-09-06.jpg).
Clicking Resume at the exact old failing coordinates `(280,380)` now returns
to [first-person gameplay](cs-menu-globals-candidate-resumed-2026-09-06.jpg),
100 health, pistol and HUD. The earlier `...-candidate-team` capture is a
waiting/spectator view, not first-person spawn evidence.

The restored Console button opens the native console. Lowercase `status`
confirms `de_dust2`, `ChromeCSMenuGlobals` and
[nine explicit Bot rows](cs-menu-globals-candidate-roster-2026-09-06.json).
The restored Disconnect button opens its confirmation dialog; the artifact
named `...-candidate-disconnected` captures that dialog, not the departure.
Clicking OK returns to [Join Game with artwork and Console intact](cs-menu-globals-candidate-departure-2026-09-06.jpg).
Clicking Join again reaches the [textured team-selection world](cs-menu-globals-candidate-rejoined-2026-09-06.jpg),
and a second native Disconnect → OK returns to the
[intact final menu](cs-menu-globals-candidate-final-menu-2026-09-06.jpg).
The owned tab is then cleared. No owner files or saved game were overwritten.

## Scoped installation

Exact accepted image: `sha256:3ac53414f7fbfb8ec82ec79ecd9efb8759bae71934bfd21585267dab411821b4`.
Live container: `1dab006e032e4a230bb93cf6467edf3eed712e4c23d8e43b01a6213e6cf73446`,
started `2026-09-06T09:40:44.648731158Z`, restart count zero.
The lab contract pins this image as `goldsource-wasm:dev`.

Only `docker compose -f /home/ted/Development/wasm-game-lab/compose.yaml up -d --no-deps goldsource`
was used. The [before](cs-menu-globals-before-2026-09-06.json) and
[installed](cs-menu-globals-installed-2026-09-06.json) audits verify 36 of 38
immutable image files unchanged: the only replacements are the CS menu at
`artifacts/cs-menu-framework-YQVL64O7.wasm` and its URL in `game-adapter.js`.
All 27 public HTTP files match accepted hashes, all four variants' owner-data
readiness checks pass, and private routes/obsolete menu URL return 404.
The [paired HTTP/export audit](cs-menu-globals-package-2026-09-06.json) also
checks that no other adapter code or public exports change.

All 95 other containers retain exact IDs, images, start times, restart counts,
state and mounts. The native CS host, both RTCW services and all other games
are untouched. All 16 original and all 16 active installation files retain
their exact hashes; the live RW data root remains
`/home/ted/wasm-game-data/goldsource-stored-wad-20260906/data`.

Full GoldSource tests—including the new native-Wasm regression—pass, as do
lab image validation, shell/JS syntax and scoped whitespace checks.
Test log: `/tmp/goldsource-cs-menu-suite-20260906.log`.

## Installed Chrome

The live launch preserves `ChromeCSReconnect`, native-viewport WebGL 2 and
120 FPS settings. Play → Join Game connects to the same unchanged server and
reaches [textured native team selection](cs-menu-globals-installed-team-select-2026-09-06.jpg).
The earlier `...-installed-world` observation is still the loading screen;
it is not world acceptance. Auto-select team/appearance succeeds; the
`...-installed-team` capture is a waiting/spectator view.

Escape opens the [intact pause menu](cs-menu-globals-installed-paused-2026-09-06.jpg).
The formerly failing click `(280,380)` returns to
[first-person pistol/HUD gameplay](cs-menu-globals-installed-resumed-2026-09-06.jpg)
with 100 health, $800 and 12/24 ammunition. The native Console button works;
lowercase `status` confirms the preserved player on `de_dust2` and
[nine Bot rows](cs-menu-globals-installed-roster-2026-09-06.json).
The native Disconnect button opens its
[confirmation dialog](cs-menu-globals-installed-confirmation-2026-09-06.jpg).
OK returns to [Join Game with artwork and Console intact](cs-menu-globals-installed-departure-2026-09-06.jpg),
and server identity clears to pending. The owned tab is then blanked.
The bot match continues normally while menus are open; a bot kills the idle
test player before departure, which is not a menu failure or client crash.

The [evidence audit](cs-menu-globals-chrome-2026-09-06.json) checks 19 ordered
old/candidate/installed observations and 38 retained JSON/JPEG hashes, the
deployment boundary and both nine-bot rosters. Visual results were manually
reviewed through Chrome control; the script does not claim OCR acceptance.
Unresolved capture, held input, listening and unrelated controls remain false.

## Remaining scope and rerun

Irrelevant Hazard course/Load game/Custom game controls remain a separate menu
cleanup. This fix does not accept sustained pointer capture, held controls,
audio listening, full campaigns or the initiating cause of the historical
CS model overflow. RTCW SP stays user-confirmed good; Blood's pitchfork crash
remains user-deferred.

```sh
cd /home/ted/Development/wasm-games/goldsource-wasm
npm test
node scripts/test-cs-menu-release.mjs --installed
node scripts/test-cs-menu-evidence.mjs
CS_MENU_BASELINE_ORIGIN=http://127.0.0.1:32932 \
  CS_MENU_CANDIDATE=http://127.0.0.1:8017 node scripts/test-cs-menu-package.mjs
```

The `--record-before` audit is write-once and requires the former live image;
do not rerun it after deployment. Older release audits describe their original
checkpoint; do not weaken those assertions to accommodate this authorized
later release. The old menu remains in the retained previous image.

Rollback, if needed, is frontend-only: use retained
`local/goldsource-wasm:cs-menu-baseline-20260906` (image `967561eca15081284748f7a46178a1f5d8f8024a3aa182e4a95e2a406ca9c2ce`),
restore its lab image contract and recreate only `goldsource` with `--no-deps`.
Keep the current stored-WAD data root. No old-data migration or native-host
restart is part of rolling back this menu-only release.
