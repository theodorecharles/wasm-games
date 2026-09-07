# DOSBox browser proofs

`runtime-9.json` records the native installed-runtime checks and visible Chrome
launch targets for all nine DOSBox variants. The proprietary game files remain
owner-supplied at runtime and are not stored in this repository.

## Movement/typing policy — 2026-09-06

The [fullscreen follow-up](FULLSCREEN-2026-09-06.md) records Chrome rejecting
three trusted requests with active user gestures on an independent engine-free
page: `TypeError: not granted`. No game/framework repair is inferred from this
browser refusal; fullscreen acceptance stays open and browser settings remain
unchanged.

[WASD-POLICY-2026-09-06.md](WASD-POLICY-2026-09-06.md) fixes the six
platformers' WASD/text conflict with an explicit movement switch, off by default,
and physical/controller ownership plus focus/repeat cleanup. Each of the current
and exact-live engines passes 92 actual adapter-to-DOS BIOS cases; five broken
adapter mutations fail. Chrome verifies all six controls, keyboard/pointer
activation, focus return, reload reset and exclusion from the other three
titles. Fullscreen attempts and short-tap gameplay remain unaccepted. Full
package/HTTP and 47 retained evidence hashes pass. The isolated v3 uses the
unchanged live platformer engine; all 105 pre-existing containers and all 696
curated owner files are unchanged. It is not a live deployment.

## Jazz native input/save — 2026-09-06

[JAZZ-NATIVE-INPUT-2026-09-06.md](JAZZ-NATIVE-INPUT-2026-09-06.md) verifies
current-engine native menu navigation, normal level startup, `WASD906` save-name
entry, Right/Left movement with damage, load restoring position/health and
normal Quit Game. This is not Chrome acceptance or a live engine update.
A ten-minute diagnostic falsely rejected an advancing unsigned Wasm counter
after its signed boundary; normalization and regression controls fix the test.
Full package checks pass. Chrome short-tap navigation and browser saves remain
open; the subsequent checkpoint above addresses the WASD movement/text policy.

## SimCity timing and Chrome — 2026-09-06

[SIMCITY-CHROME-2026-09-06.md](SIMCITY-CHROME-2026-09-06.md) records a matched
native timing comparison, an isolated engine-only candidate, and actual Chrome
city creation, typed name/year selection and road placement with the expected
$10 cash change. [SIMCITY-SAVE-2026-09-06.md](SIMCITY-SAVE-2026-09-06.md)
adds native menu/shortcut evidence and shows that `Game Saved As` must be
dismissed before the game writes the final save header. The attempted
write-buffer workaround was disproved and withdrawn. Completed-save Chrome
restoration passes with matching terrain, three roads, cash/date and resumed
simulation. The original timing candidate is now installed on 8025; 94 other
containers and the owner-data mount are unchanged. Wider pointer, listening
and performance acceptance remain open.

## Input follow-up — 2026-09-05

[INPUT-2026-09-05.md](INPUT-2026-09-05.md) records limited Jill/Jazz Chrome
results, an independent 1–2 ms keypress timing control, and 70 actual-DOS BIOS
cases passing on both current staged and exact live native binaries. Browser
held movement and Jazz menu/text acceptance remain open. Source preparation
also now preserves Markdown; the [workspace regression](../../proofs/SOURCE-NOTES-2026-09-05.md)
checks nine scripts and exercises two actual DOSBox preparations.

## Keyboard regression — 2026-09-04

The adapter queues SDL 1.2 key values, while Emscripten's SDL compatibility
headers use masked scancodes for special keys. The old mapper's small SDL 1.2
translation table collapsed bindings; a real DOS test program received F1–F8
when arrows and text were sent. `keyboard-input.patch` keeps browser bindings
symbolic and translates queued special keys to the compiled SDL constants.
The adapter also now forwards Backspace.

`scripts/test-native-runtime.js` uses NASM to assemble the source-only
`scripts/fixtures/keyboard-probe.asm` diagnostic, runs it in the production
Wasm, and checks the BIOS ASCII/scancode pairs it writes. Left/right/up/down,
Escape, A, Backspace, and Enter now produce the expected distinct values.

All nine adapter/data contracts, the native diagnostic, HTTP/private-data
checks, and the nine installed-title launch checks passed. All ten canonical
DOS images were rebuilt, and the seven DOSBox lab services were recreated.
Full browser gameplay, GTA performance/audio, NFS race startup, and pointer
alignment still need verification; the launch tests do not establish those.

## Absolute mouse regression — 2026-09-04

DOSBox's desktop `autolock` path ignores motion until capture, then uses
relative movement. The browser launcher deliberately has pointer lock disabled.
For NFS and SimCity 2000 only, `browser-pointer.conf` now sets `autolock=false`
and `sensitivity=100`. The adapter loads this temporary override after the user's
configuration; it never rewrites the persistent config or game files.

`node scripts/test-native-runtime.js web/dist --pointer` assembles
`scripts/fixtures/mouse-probe.asm` and drives the production Wasm's SDL canvas
event handlers. A DOS INT 33h diagnostic records positions and button state.
Before the override, cursor coordinates stayed at `(0, 0)`. With the override,
an offset, CSS-scaled canvas maps three positions to `(160, 360)`, `(480, 120)`,
and `(320, 240)` in a 640×480 DOS screen; first-click press/release also pass.
The regression starts with a conflicting saved auto-lock/sensitivity config
and verifies that its contents remain unchanged. Both `npm run test:native`
and the full package test include this regression.

The full package/HTTP checks, both 20-second installed-title launch checks,
all ten image smoke tests, and the lab image audit passed. Only NFS and SimCity
lab services were recreated for this change. Running images:

- NFS: `sha256:15462668d586b0a22208afb7ae42ff1a08652f072176a2dff4888ab0f3b9c180`
- SimCity: `sha256:41790b80c75753cbe03ef523cf44490078101e33c8fada0678ea0eac15446a09`

The previous images remain locally available for rollback: NFS `fbca84cc0ead`
and SimCity `760efe4b4231`. No data mounts or persistent files were changed.

This is native-Wasm input evidence, not Chrome gameplay acceptance. NFS race
startup, in-game cursor alignment, and SimCity performance remain open.

## GTA timing and sound repair — 2026-09-04

[GTA-2026-09-04.md](GTA-2026-09-04.md) records the CPU idle/yield-accounting
fix, first-run Sound Blaster 16 settings, native street-scene and non-silent PCM
evidence, tests, exact patch tree and targeted GTA deployment. Browser acceptance
is pending. NFS subsequently received the repaired runtime as recorded below.

## NFS native race and deployment — 2026-09-04

[NFS-2026-09-04.md](NFS-2026-09-04.md) records repeated native City-race
driving, gear/throttle controls, non-silent PCM, a stronger regression with a
menu-only negative control, and the targeted NFS runtime update. Chrome
acceptance and NFS's own mouse alignment remain open. The supplied installation
also lacks the Ferrari showcase data; this is separate from racing.

## NFS relative pointer — 2026-09-04

[NFS-POINTER-2026-09-04.md](NFS-POINTER-2026-09-04.md) records the actual
relative-motion finding, captured native-cursor routing, first-click/loss
regressions, mouse-driven race and pause/resume evidence, and NFS-only update.
Chrome capture/menu/fullscreen acceptance and the missing showcase data remain
open. No title has been promoted to Live.
