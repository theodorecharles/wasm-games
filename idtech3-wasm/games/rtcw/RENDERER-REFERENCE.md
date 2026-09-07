# RTCW SP renderer reference — 2026-09-04

Reference: [GMH-Code/Wwasm](https://github.com/GMH-Code/Wwasm), inspected at
commit `40a03162842fefcc30d0dae7d1d50f0bc7d8190e`.
Its [hosted demo](https://wwasm.m-h.org.uk/) advertises RTCW SP playback;
the demo itself has not yet been exercised in this investigation.

## Relevant implementation differences

| Area | Wwasm | Local SP port before patch 0020 |
| --- | --- | --- |
| GL translation | Links GL4ES `libGL.a`, enables `FULL_ES2` | `LEGACY_GL_EMULATION`, forced WebGL 2 |
| Function lookup | `gl4es_GetProcAddress`, checks missing functions | SDL lookup plus linked shims; browser branch skips missing-function errors |
| Features | Disables bloom; intercepts video/audio restart | Legacy renderer compatibility patches |
| Game code | QVM by default | QVM already used |

Primary code: Wwasm [Makefile](https://github.com/GMH-Code/Wwasm/blob/40a03162842fefcc30d0dae7d1d50f0bc7d8190e/Makefile),
[sdl_glimp.c](https://github.com/GMH-Code/Wwasm/blob/40a03162842fefcc30d0dae7d1d50f0bc7d8190e/code/sdl/sdl_glimp.c),
and [cl_main.c](https://github.com/GMH-Code/Wwasm/blob/40a03162842fefcc30d0dae7d1d50f0bc7d8190e/code/client/cl_main.c).

The old SP source additionally forced an emulated GLES 1.1 version and installed
no-op `MultiTexCoord4f`/`ArrayElement` functions. The later lightmap repair
patches `0010`–`0018` mostly target **MP**, not SP. MP renderer progress is
therefore not proof that SP rendering was repaired.

## Implemented GL4ES integration

Patch `0020` replaces the SP GL binding path with GL4ES + `FULL_ES2`, disables
bloom, locks triangle-array primitives, and prevents unsafe in-place video/audio
restart. Extension detection now queries the translator, not raw WebGL.
The adapter enables SP multitexturing; MP retains its existing backend.
Framework lifecycle, owner-data mounts, and QVMs are preserved. Wwasm's software
gamma/intensity defaults are used for SP; existing saved gamma settings remain.
The image includes the unmodified GL4ES MIT licence and source attribution.

The pinned library is `535c4b21a18a38fe96b7dbe97add39ae04cdb0ac`. Later
GL4ES [commit aa3e9dd](https://github.com/ptitSeb/gl4es/commit/aa3e9dd4971c775d22eae96b56c3dd9c2c5b5912)
forwards negative-origin viewport/scissor calls but does not update its cache.
RTCW's off-screen menu models trigger this: restoring the full viewport can be
incorrectly skipped and subsequent 2D elements appear displaced or clipped.
Both our prototype and a separately built Wwasm reproduced this corruption.
Forcing viewport/scissor restoration fixed it; pinning the parent commit fixes
it without modifying either GL4ES or RTCW's drawing code. Disabling compiled
arrays/VBOs or using Wwasm's own QVMs did not fix the regression.

There was also an independent pointer mapping error: the UI stretches over the
dynamic canvas, while `pointerFit: contain` treated it as letterboxed 4:3.
On a 1925x1179 canvas, clicking the visible briefing arrow mapped to x=640
instead of about x=620. `pointerFit: fill` matches the UI; automated geometry
coverage includes 4:3, landscape, and portrait surfaces.

Browser acceptance is recorded below; the existence of an active snapshot alone
does not prove gameplay (`cg_norender=1` is normal while awaiting the briefing).

## Browser finding after the first rebuild

Chrome reproduced a startup trap before the main menu. A symbol-map relink
resolved the stack to `MSG_WriteData` → `SV_WriteDownloadToClient` →
`SV_SendDownloadMessages` → `SV_SendQueuedPackets` → `Com_Frame`.
The browser-only queue drain had omitted the native `com_sv_running` guard,
accessing client state before allocation. Patch `0019` restores that guard in
both SP and MP. This is independent of the renderer translation choice.

## Verification — 2026-09-04

- All 20 ioRTCW patches reproduced the locked commit `a22b0594` and tree
  `1c7e5009` in a second checkout. The canonical source checkout is clean.
- SP/MP WASM and QVM artifact checks, the id Tech 3 test suite, repository
  layout check, and the lab's `validate.sh --images` passed.
- Installed SP image `e6cc9c2be15c` on port 8085 and MP image `49c767bb52ad`
  on port 18085. MP wake returned running and later reported eight Omni-bots;
  this is not a multiplayer renderer/join test.
- Chrome verified the SP menu, normal difficulty selection, aligned clicks on
  both briefing arrows, pointer capture, textured/lit intro room, cinematic
  playback, and transition through the torch-lit `escape1` opening scene into
  first-person rendering with the world, knife, crosshair, and health HUD.
- Created a new manual save `RENDER0904` without replacing any existing save.
  It survived a full page reload and restored the rendered `escape1` level
  with health 100. This isolated test save remains in browser persistence.
- Short W/S input sequences visibly changed world position, and a left click
  produced the knife attack animation. These are limited input smoke checks,
  not sustained movement or firearm/combat acceptance.
- The user independently confirmed that the renderer now looks good.
- The original first-world diagnostic still reported `glError=0x500` once in
  the prototype. Its origin has not been isolated; correct visible rendering
  does not establish an error-free GL implementation.
- Fixed a separate capture timing bug in the adapter: SDL can process menu
  input after the DOM keyup/pointerup handler has returned. Resume now arms
  capture and follows the native transition for at most two seconds; expired
  gestures and ordinary menu clicks cannot trap the pointer. SP and MP
  regression tests cover delayed Escape/pointer resume and timeout behavior.
- Foreground Chrome verified Escape releasing capture, Escape resuming with
  capture, and a manual save-load restoring gameplay with real pointer lock
  (`document.pointerLockElement.id === 'canvas'`). Background automated tabs
  had produced `WrongDocumentError` even for trusted gameplay clicks; explicitly
  foregrounding the test tab resolved that testing-environment failure.
  Temporary browser diagnostics were not persisted; Chrome exited after the
  test, so they do not survive reopening the game.
- Extended campaign play, sustained controls, and firearm/combat checks remain
  open. No claim of a complete campaign playthrough.

Reload an already-open page after replacing the image so its manifest, adapter,
and WASM all come from the new build. The two isolated comparison containers
on ports 19085/19086 were stopped after testing; owner game data was read-only.
