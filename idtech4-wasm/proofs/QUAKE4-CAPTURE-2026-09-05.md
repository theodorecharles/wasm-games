# Quake 4 input/capture checkpoint — 2026-09-05

Status: native state/intent and adapter handoff repairs are rebuilt, packaged
and checked in Chrome, including both console-Escape outcomes. Native, adapter
and staging gates pass. Browser pointer lock still fails, including on an
independent engine-free control. Capture and full gameplay are not accepted.
Blood stays deferred and RTCW is untouched.

## Evidence and repair

The preceding [border candidate](QUAKE4-BORDER-2026-09-05.md) renders the complete
intro and first-person world, but a capture click publishes `captured:false`
and opens pause. On this follow-up, the previous tab is gone; a fresh Chrome tab
on the same isolated origin restores Map Start, reaches first person and saves
Quicksave1 with F5. A further click leaves DOM pointer lock null but this time
does not publish a capture change or pause. That differing result is retained
in [baseline browser evidence](quake4-capture-baseline-chrome-2026-09-05.json);
it does not establish a single root cause for every failed capture attempt.

Source inspection identifies a separate concrete resume defect:

- `Q4WASM_ReportBrowserState` emits only coarse menu/gameplay/paused state, never
  `inputMode` or `resumeAvailable`. The adapter's resume path therefore cannot
  run. The pull-down console is incorrectly classified as gameplay.
- Main-menu Escape resumes only when the actual desktop window variables
  `curr`, `active` and `video_check` are zero and the GUI `ingame` flag is set.
  Save/Load, Settings, popups and menu animations are not equivalent to root
  pause. These values are window variables, not GUI dictionary entries.
- Continue consumes input before the console and accepts only after its
  two-frame stale-input guard. It needs a distinct input mode.

The native report now distinguishes those modes, publishes accurate resume
availability and detects changes in that availability even when coarse state
stays paused. Unsupported/custom menu schemas fail closed. The adapter retains
the corresponding key/click gesture and requests capture only after the native
gameplay acknowledgement; it does not interrupt the menu exit animation with
an optimistic gameplay state. Chrome owns capture permission. A follow-up removes
the adapter's overly strict inactive-activation guard: the
[Pointer Lock specification](https://w3c.github.io/pointerlock/)
allows some re-locks after an API release without new transient activation.
The adapter requests once, then lets the browser accept or deny; it does not
retry when activation changes. Blur, a later unrelated key/pointer action,
main-menu return and errors cancel pending capture. Backquote and Escape can
both be console-to-gameplay gestures, but Quake 4 capture waits for actual native
gameplay: Escape can instead open a menu, or the game can consume it while
skipping a cinematic. Other engines' existing handoff behavior is preserved.

Proof-mode-only pointer-lock change/error records include the DOM lock state,
focus and activation. They do not replace pointer-lock methods or modify browser
security. They are intended to separate native handoff failures from browser
denial in the next Chrome check.

## Verification

- [Old native report](quake4-capture-state-legacy-2026-09-05.json): 24/24 state/
  intent expectations fail. [Repaired native report](quake4-capture-state-native-2026-09-05.json):
  all 24 pass, including guarded Continue and cache-only intent transitions.
  The fixture compiles exact production functions to Wasm with recording
  surrounding session/window state; it does not execute a complete native GUI.
  The test also checks the shipped GUI's root Escape branch and records its hash.
- [Adapter negative/positive record](quake4-capture-adapter-2026-09-05.json): the
  previous adapter fails the expanded suite; the candidate passes all six
  variants, including delayed native acknowledgement, submenu back, console
  modes, Continue keys/buttons, blur and duplicate reports. The initial adapter
  record predates the follow-up inactive re-lock correction.
- Four exact patch trees and complete staging pass: 33 shipped shader pairs,
  24 generated pairs, 128 lighting comparisons, 20 depth cases, 26 border-runtime
  cases, the isotropic sampling oracle and worker/device/package contracts.

Run the native state fixture inside the pinned Emscripten toolchain:

```sh
node idtech4-wasm/scripts/test-q4-state.mjs
node idtech4-wasm/scripts/test-adapter.mjs
```

The normal `build-all.sh` now runs the native state gate. The
[identity record](quake4-capture-build-2026-09-05.json) identifies
`local/idtech4-wasm:quake4-capture-candidate`, image
`sha256:17dfe3132f8fc2caed7b15c9bdaa4c9a4772cb22281889425655ed8e0237c18e`.
Only the owned isolated service on `127.0.0.1:32875` is replaced; the preceding
border-dialects container is retained stopped, and its image is unchanged.
The older sky candidate on port 32873 and live services remain untouched.

The follow-ups below complete the actual root/submenu/console and Continue
state checks. Capture, sustained movement/firing, rendering quality/performance,
audible listening and broader campaign acceptance remain separately open.

## Follow-up: browser permission control

The [initial candidate browser record](quake4-capture-initial-chrome-2026-09-05.json)
confirms actual native root pause (`resumeAvailable:true`), Save submenu
(`false`), Escape back to root (`true`), and root Escape to gameplay after its
exit animation. Return to Game also reaches gameplay. However, that click
produces `pointerlockerror` with DOM focus and transient activation both true.
A later direct gameplay click errors, reports null pointer lock and opens pause.
The first inactive Escape `resume-request` diagnostic is not evidence of an API
call: that initial adapter logs before its now-removed activation guard.

The [re-lock adapter regression](quake4-capture-relock-adapter-2026-09-05.json)
fails against the initial capture image and passes against the corrected source.
Full staging passes again. Its [separate image record](quake4-capture-relock-build-2026-09-05.json)
identifies image `sha256:580da0e1e630a63fbb025a81a802e180157e0d5f65b412a5520ed091a40a85ff`
and adapter `2468e117eff3d03d79d73faa0c75bdfae726248314158f3a8aecbcd652ec7659`.
All native engine/module/worker hashes are unchanged. The initial capture image
and stopped container are retained; only the isolated port-32875 service changes.

An [independent browser control](quake4-capture-control-chrome-2026-09-05.json)
uses [a minimal page](../tests/q4-capture-browser.html) with no engine or framework.
Both synchronous and 400-ms-delayed trusted button clicks reject with
`WrongDocumentError: The root document of this element is not valid for pointer lock.`
DOM focus and activation are true in both cases. Thus a failed capture in this
browser context cannot by itself be attributed to Quake 4's native handoff.
This does not establish the underlying browser-context cause or prove the game
has no remaining capture bug. No browser security setting or API is overridden.
The fixture is not included in the normal staged game package.
Its temporary server was stopped after the check. To repeat it independently,
serve `idtech4-wasm/tests` on localhost and open `q4-capture-browser.html`; use
the visible immediate/delayed buttons, without browser security overrides.

Save restoration also exposes a striped/white save-preview thumbnail, recorded
as a separate open rendering/readback issue. It is not a failed save restore.

The [re-lock candidate Chrome record](quake4-capture-relock-chrome-2026-09-05.json)
verifies no-map console mode, Continue's false-to-true guard, Enter-to-gameplay,
and Backquote in-game console-to-gameplay. Continue and Backquote each request
capture only after the native report, then receive a browser error.
It also exposes a second overly narrow adapter assumption: Escape during the
cinematic closes the console and reaches gameplay without a capture request.
`idSessionLocal::ProcessEvent` closes the console before `game->HandleESC`, whose
`ESC_IGNORE` result can consume the key without opening the menu. The adapter
now retains Escape as a possible gesture too, but still captures only after
actual gameplay acknowledgement. Regression cases cover both outcomes and
exactly-once consumption; the initial image evidence remains unchanged.

In the same re-lock session, ordinary first-person console Escape opens the
root pause menu instead (`568083.7` ms), confirming both native outcomes.
Root Escape then requests capture with inactive activation (`644116.8` ms),
receives a browser error, and stays in gameplay without an automatic retry.
The [console regression](quake4-capture-console-adapter-2026-09-05.json) fails
against the re-lock image and passes against the corrected adapter.
Full staging passes again. The [console-candidate identity](quake4-capture-console-build-2026-09-05.json)
records image `sha256:fe1ce9f372401adfec272da63fe9eabbbd463c4bdca4972261adec090a695ec9`,
adapter `d62d59bf8efea30fa73065964ab7c3dc5768eec51332d08ed0c70b12dfd47ef3`,
and unchanged native artifacts. This candidate replaces only the isolated
port-32875 service; both earlier capture images/containers are retained.

## Final native-handoff Chrome check

The [final browser record](quake4-capture-console-chrome-2026-09-05.json) and
[first-person screenshot](quake4-capture-console-chrome-2026-09-05.jpg) show:

- Continue reports guarded input at `211637` ms and ready input at `211713.3` ms.
  Enter reaches gameplay at `275221.8` ms and requests capture at `275222.1` ms.
- Backquote opens the cinematic console at `304628.5` ms. Escape then reaches
  native gameplay at `320958.2` ms and requests capture exactly once at
  `320958.3` ms, with inactive transient activation. This request was missing
  in the preceding image.
- The subsequent first-person console opens at `354303.2` ms. Escape opens the
  root pause menu instead, with no additional capture request. Both branches
  now follow the native result.
- Textured terrain/walls/rock, bright sky, smoke/aircraft, pistol and health-72
  HUD render without worker exceptions. This pass uses cinematic skip; the
  prior border-dialects checkpoint supplies untouched-intro evidence.
- Both capture requests still receive browser errors and DOM lock stays null.
  The independent control above reproduces a failure without this engine.

The test tab is left paused on the final isolated image. No native binaries,
live services or owner PK4s changed in these adapter-only follow-ups. The
temporary independent-control HTTP server is stopped. Next concrete renderer
work is the corrupted save-preview readback, keeping browser capture acceptance
open rather than retrying the same denied request indefinitely.

Subsequent [readback repair](QUAKE4-READBACK-2026-09-05.md) resolves fresh-save
thumbnail corruption on a rebuilt isolated image. Chrome verifies the corrected
preview both before and after page reload and restores Quicksave3 to the world.
This supersedes the readback next step above, not the separate capture limitation.
