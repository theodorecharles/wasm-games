# Build-engine browser proofs

[Blood and Duke live release](BUILD-RELEASE-2026-09-06.md) is the latest
deployment: both regular endpoints have selectable Classic/Modernized profiles,
the renderer repairs and Duke save-name fix. The candidate passes 16 integrated
Chrome pairs; three canonical images, effective served bytes, 142 preserved
other containers and 98 unchanged owner files pass the release audit. Twenty-one
live Chrome pairs verify all four first levels, movement, profile selection and
Duke firing. Original Classic selections are restored; no saves changed.
Broader acceptance and the deferred Blood crash remain open.

[Blood Modernized and the full family build](BLOOD-MODERNIZED-2026-09-06.md)
is the preceding checkpoint: selectable 1280×720 GPU rendering, native pitch/yaw,
movement, named save/reload/load and cross-profile loading pass in Chrome.
Thirty pairs/63 hashes retain the initial package. The full four-module build
and exact served-shell audit pass; the current integrated candidate is on 32989.
That candidate checkpoint was not deployed; the later release above supersedes
its deployment status, not its full-game acceptance boundary.

[Duke save-name input](DUKE-TEXT-INPUT-2026-09-06.md) is the preceding checkpoint:
typing, Backspace and confirmation work in isolated 32986. Both rebuilt profiles
create named saves and restore their exact native positions/views after full
page reload; Classic also loads the Modernized-created save. Twenty-six Chrome
pairs/55 hashes and 12,296 native/Wasm checks per target pass. Two test saves
retained; not deployed or complete Modernized acceptance.

[Duke alpha testing](DUKE-ALPHA-2026-09-06.md) is the preceding checkpoint:
custom-shader color/depth rejection is restored in isolated 32985, with 7,680
cases per GPU driver and 343 native/SDK state checks. Chrome verifies firing,
pitch/yaw, a forward-key tap and menu round trips; save-name typing was then
reproduced as a separate failure (fixed above). Twelve new pairs/29 hashes. Not deployed
or complete Modernized acceptance.

[Duke texture dimensions and precision](DUKE-NPOT-2026-09-06.md) is the preceding
checkpoint: false NPOT detection and low-precision palette samples are fixed.
Chrome shows the full logo/pistol/hand and readable save labels, firing and
pause/preview/cancel/resume. Eleven new pairs/27 hashes and 39,960 production
GLES pixels per driver pass. Isolated 32984 only; alpha/depth and broader
Modernized acceptance remain open in that historical baseline.

[Duke selectable profiles](DUKE-PROFILES-2026-09-06.md) records the preceding checkpoint:
actual Classic/Modernized selection, 1280×720 GPU rendering, native mouse pitch
and yaw, firing, and same-origin switching back to unchanged Classic are
Chrome-checked. Seventeen additional pairs retain progress and the remaining
then-observed save-menu/sprite defects. Isolated only, not full Modernized acceptance.

[Duke visible-renderer progress](DUKE-VISIBLE-2026-09-06.md) records the recovered
GPU menu/world/weapon/skyline, matrix and texture-upload repairs, and the
infinite-far projection fix for the previously black sky.
[Earlier Polymost bring-up](DUKE-POLYMOST-2026-09-06.md) retains the startup,
shader and attachment failure chain. This is not Modernized acceptance and no
live service was replaced.

[Blood firing investigation](BLOOD-FIRING-2026-09-04.md) records native
pitchfork and broader weapon checks, source-checkout recovery, and the user's
request to defer further crash reproduction. The crash remains open; those
native results are not Chrome acceptance.

`mouselook.json` records clean Google Chrome launches of Blood E1M1 and Duke
Nukem 3D's L.A. Meltdown episode. Real browser mouse movement is recorded at
the shared native Build input accumulator, then proven at the game layer:
Blood reports nonzero turn and vertical-look commands plus a changed player
angle, while Duke reports changed player yaw and horizon.

The run also covers the embedded-browser fallback used when Chrome declines
pointer lock: framework-normalized relative motion still reaches the native
mouse path, while ordinary browsers continue to use pointer lock.

The proprietary game data is owner-supplied at runtime and is not stored in
this repository.
