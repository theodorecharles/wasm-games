# RTCW MP managed join and lightmap repair — 2026-09-06

Fixed the triangular dark/color artifacts in the MP garage spawn. Actual
Chrome reproduces them in live 18085 and renders continuous crates, walls and
floor with patch 0021 in two separate MP candidate builds. **This is not full
multiplayer, capture, performance or audio acceptance. The verified final image
is now installed on 18085; see the release follow-up below.**
The user-confirmed SP renderer, its source files and its live 8085 service were
not changed or rebuilt.

## Original report and current baseline

The August report that MP opened the server browser is superseded for the
installed September 4 image. Normal Play → native Join Game wakes the managed
`mp_depot` Objective server and connects. Native Allies → Soldier → Thompson
selection, first-person spawn, Escape menus and a short firing click work.
The baseline ammo changes 30/60 → 29/60. There is one human and seven Omni-bots.
No server command, engine console injection or direct native join invocation
was used for the browser checks.

- [Live join](rtcw-mp-installed-join-2026-09-06.json)
- [Live first-person world](rtcw-mp-installed-spawn-world-2026-09-06.jpg)
- [Live firing](rtcw-mp-installed-shot-2026-09-06.jpg)
- [Live capture observation](rtcw-mp-installed-capture-2026-09-06.json)

The live scene has conspicuous triangular color/lighting breaks across the
front crates and walls, even after closing the native menu. This is a separate
MP defect, not a regression of the accepted GL4ES SP path.

## Cause and fix

`MP/code/renderer/tr_es2.c` uploads an explicit 32-byte vertex layout and binds
its own lightmap shader. However, the surrounding legacy stages leave their
fixed-function client arrays enabled. Emscripten's shipped `glDrawArrays`
wrapper therefore routes through `GLImmediate`, whose renderer rewrites the
custom shader's `a_color` attribute with the legacy array layout/stride. The
custom position/UV names differ from the wrapper's expected names as well.

[Patch 0021](../patches/rtcw/0021-Isolate-explicit-lightmap-client-array-state.patch)
saves the four client-array enable bits, disables them for the explicit draw,
and restores exactly the previous mask afterwards. MP already forces one
legacy client texture unit; this fix preserves that existing constraint.
Vertex packing, textures, shader math, gamma, adapters and SP are unchanged.

Two source reconstructions agree on commit
`18c6ad4064e2fe83394ecfc488b75369e52953ed`, tree
`6bad905a59f18b0d911ebdd9db3bdaed0cc27330`. All 21 patches retain the original
upstream pin `438e7d413b5f7277187c35b032eb0ef9093ae778`. Relative to the prior
`a22b0594`, only `MP/code/renderer/tr_es2.c` changes (20 added lines plus the
previously missing final newline). Patch SHA-256:
`3b608b48b95c9bbfa3cf674379b1036a59cfffb2a70edbbf542e65bb6b358dbe`.

## Verification

- [Native regression report](rtcw-mp-array-native-2026-09-06.json): 96 complete
  native-function cases under ASan/UBSan. All 16 enable masks, early no-draw
  paths, packed positions/UVs/colors, identity transforms and the 1,536-vertex
  batch boundary are checked. The old source preserves its data but reaches
  draws with legacy arrays enabled; the same isolation assertion rejects it.
  Sixteen cases execute the exact emitted JS draw wrapper and verify routing.
- [Unit test](../tests/rtcw-lightmap-state.test.js) reconstructs the complete
  file from patches without requiring an engine checkout. Optional source/JS
  arguments verify those files match the tested code and wrapper exactly.
- Full MP Wasm/QVM build succeeds with Emscripten 4.0.23. Existing unrelated
  compiler warnings remain. No SP build was invoked.
- Full family `npm test` passes, including the new regression. The default
  sibling framework checkout contains earlier authorized local fixes and
  fails the strict release-dist gate. Tests instead use a separate pristine
  checkout of the same declared `ebb1ebe3` framework pin; no gate was weakened
  and no sibling changes were reverted.
- [Package report](rtcw-mp-array-package-2026-09-06.json): 199 immutable image
  files compared across site, framework, shell, server, native server and bots.
  Exactly one changes: `iowolfmp.wasm`. Twelve served HTTP files match the
  candidate image, including MP QVMs and SP assets. Comparisons use immutable
  images because running Omni-bot legitimately updates its own config.
- [Prototype world](rtcw-mp-array-world-2026-09-06.jpg) and
  [prototype firing](rtcw-mp-array-shot-2026-09-06.jpg): the same garage spawn
  renders without the baseline triangular artifacts; ammo changes 30/60 →
  28/60 after the short click. The prototype disconnects through native menus.
- [Final-build join](rtcw-mp-array-final-join-2026-09-06.json),
  [native server roster](rtcw-mp-array-final-roster-2026-09-06.json), and
  [final-build world](rtcw-mp-array-final-world-2026-09-06.jpg): the locked
  `18c6ad4` build repeats normal joining, loadout selection and the correctly
  rendered first-person garage, with 110 health and 30/60 Thompson ammo.
  A later [final-build firing attempt](rtcw-mp-array-final-shot-2026-09-06.jpg)
  leaves ammo at 30/60; it is not counted as a successful input check. The
  baseline and prototype ammo changes above are the accepted short-click
  observations, not proof of reliable held firing.
  Screenshots were visually inspected; unit tests are not a pixel oracle.

## Retained candidate and preservation

Final candidate: <http://127.0.0.1:32942/>, container
`rtcw-mp-array-final-proof-20260906`, image
`371a3f085e2406580cbabe9d4d11148432004ee2010f66962caee7dd304e2948`.
The original owner RTCW directory is mounted read-only; it was not repackaged.
Prototype 32941 is separate. The final image was subsequently installed on
live 18085; the isolated candidates remain available for comparison.

New Wasm: 1,886,444 bytes, SHA-256
`78b669d405f4c79332ed13a0cc11fe85789a15ff6cb14e3784e0908faef247d0`.
JS is unchanged at SHA-256
`f3972e914d66ffaf3506ddb0d15d21e61cf59a26a6bbb8f8cb85a1d1d5832a78`.
At the original checkpoint, both live service IDs, image IDs, start times and
zero restart counts remained unchanged; the original package report preserves
those values. The live test's
temporary player name was restored to `Player` through the launcher UI. Its
native client disconnected and the managed server subsequently slept.
The final candidate also [returns to its native menu](rtcw-mp-array-final-disconnected-2026-09-06.json);
its [post-disconnect server status](rtcw-mp-array-final-disconnect-status-2026-09-06.json)
reports zero humans and eight bots. The browser test tab is left blank.

Reproduction commands, from `idtech3-wasm`:

```sh
node tests/rtcw-lightmap-state.test.js
node tests/rtcw-lightmap-state.test.js .sources/iortcw dist/rtcw/iowolfmp.js
node tests/rtcw-lightmap-package.test.js
WASM_GAME_FRAMEWORK_DIR=/tmp/rtcw-mp-checkpoint.0sgo75/wasm-game-framework npm test
```

The isolated build context, baseline Wasm and build/test logs are retained at
`/tmp/rtcw-mp-array-state.9uTHe9`; the second source reconstruction is at
`/tmp/rtcw-mp-array-source-proof.gHZ2VH/source`. These temporary paths are this
machine's proof artifacts, not portable build dependencies. The normal source
preparer and MP-only native build script consume the checked-in patch/lock.

## Still open

Pointer lock remains absent in these automated Chrome observations. Short
clicks work, but sustained mouse look, held movement, combat, performance and
audible playback are not accepted. The adapter reports 1 FPS during these
tests; this was not diagnosed as an engine-performance defect. Do not infer
foreground performance from these screenshots.

Native normal stdout is emitted on stderr and the existing adapter prefixes
all such output with `ERROR:`. Logs also retain actual legacy GL, shader-file,
main-loop timing and socket-option warnings; this is not an error-free GL
claim. Broader surfaces/effects and round transitions remain open. Reconnect
and live promotion are covered in the follow-up below. The unrelated menu
packer's wall-clock ZIP timestamp
issue was subsequently [fixed and tested separately](RTCW-MENU-PACKAGING-2026-09-06.md);
that packaging change is not included in this renderer candidate.
Blood's crash remains user-deferred.

## Release follow-up: final-image controls

The retained final image was checked again in actual Chrome at 08:00 UTC.
Native Play → Join Game wakes a sleeping match and reaches the native limbo
UI. Allies → Soldier → Thompson → Close, then Escape to close the in-game
menu, produces the same correctly rendered garage with 110 health and 30/60
ammo. A normal canvas click consumes one round: **29/60**. This is now a
successful short-click check on the final image itself, supplementing the
earlier prototype result. A subsequent R keypress leaves ammo unchanged and
is not counted as reload acceptance. No input timing workaround was added.

- [Cold join](rtcw-mp-release-join-2026-09-06.json)
- [Native server roster: one human, seven bots](rtcw-mp-release-roster-2026-09-06.json)
- [World before firing](rtcw-mp-release-world-2026-09-06.jpg)
- [World after firing](rtcw-mp-release-shot-2026-09-06.jpg)
- [Unaccepted reload attempt](rtcw-mp-release-reload-2026-09-06.jpg)
- [Native main menu after confirmed disconnect](rtcw-mp-release-main-menu-2026-09-06.jpg)

The final source checkout is clean; its Wasm and patch hashes still match
the values above. The full family suite, 96 sanitized source cases, 16 exact
emitted-wrapper cases and package comparison pass again. New optional
`--installed` package verification checks the accepted image at 18085 while
preserving the original baseline record. It correctly rejects the old live
image before deployment. The separate promotion check likewise rejects the
old image; it compares all containers and preserves a write-once baseline.

After native disconnect, `/status` reports zero humans/eight bots. A normal
Join Game in the same engine successfully [reconnects to the limbo UI](rtcw-mp-release-rejoined-2026-09-06.jpg);
the [fresh native roster](rtcw-mp-release-rejoin-roster-2026-09-06.json)
again has one human/seven bots. The browser then leaves the candidate origin.
This establishes reconnect to the match, not another full loadout/combat pass.

## Installed MP-only release

The accepted image `371a3f085e2406580cbabe9d4d11148432004ee2010f66962caee7dd304e2948`
was tagged `idtech3-rtcw-mp-wasm:devel` and installed with Compose
`up -d --no-deps rtcw-mp`. Only MP was recreated, at **08:06:54 UTC**.
New container: `b194297c1ffd5895a40b870366142ab40e66a491e93bf95cdff4c66f4acb714f`.

The [installed package check](rtcw-mp-array-installed-package-2026-09-06.json)
passes all 12 live HTTP comparisons and the 199-file immutable-image inventory:
only `iowolfmp.wasm` changes. The [promotion audit](rtcw-mp-promotion-2026-09-06.json)
verifies the exact owner-data mount and **94 other containers unchanged**,
including SP. The lab image audit passes before and after tagging/deployment.
No SP rebuild, data repackaging or other service restart occurred.

Post-deployment actual Chrome on **18085** reaches the native
[main menu](rtcw-mp-installed-release-menu-2026-09-06.jpg), cold-joins through
Join Game, and reaches [limbo](rtcw-mp-installed-release-join-2026-09-06.jpg).
The [native roster](rtcw-mp-installed-release-roster-2026-09-06.json) contains
`Player` plus seven bots; the old test name was replaced through the launcher.
Axis → Soldier → MP40 provides a different
[first-person Coal Depot spawn](rtcw-mp-installed-release-axis-world-2026-09-06.jpg)
with continuous textured wood walls, floor and window, 100 health and 32/64
ammo. The [short MP40 firing attempt](rtcw-mp-installed-release-axis-shot-2026-09-06.jpg)
leaves ammo unchanged and is not counted as firing acceptance. The successful
final-image Thompson check above remains the accepted short-click evidence;
reliable controls and mouse capture remain open. Native menu screenshots
immediately after Close can still show the prior spectator view; the settled
Coal Depot screenshot establishes the actual player spawn.

The live test exits through Escape → Exit → Main Menu → Yes and
[returns to the native main menu](rtcw-mp-installed-release-disconnected-2026-09-06.jpg).
The [final server status](rtcw-mp-release-final-status-2026-09-06.json) records
zero humans and eight bots on both live and candidate services, with their
normal five-minute idle timers active. The candidate's page-navigation
disconnect waited for the native 240-second timeout; no client was kicked or
server stopped to manufacture this result. The Chrome tab is then left blank.
The final family suite passes; its log is retained at
`/tmp/rtcw-mp-release-suite-20260906.log`.

Repeat the non-mutating checks from the family directory:

```sh
node tests/rtcw-lightmap-package.test.js --installed
node tests/rtcw-mp-promotion.test.js --verify
```

The previous image `49c767bb52ad27762d91c500ba1c4cf6f1d294e816964ed3bc28a9d48476ec64`
is retained as `local/idtech3-wasm:rtcw-mp-array-baseline-20260906`. Rollback
would retag that image to `idtech3-rtcw-mp-wasm:devel` and recreate only the
`rtcw-mp` Compose service with `--no-deps`. No data deletion is necessary.
