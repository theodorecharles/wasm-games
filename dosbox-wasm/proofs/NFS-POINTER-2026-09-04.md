# NFS relative pointer repair — 2026-09-04

## Finding and implementation

NFS polls INT 33h function `0Bh` for relative motion and function `03h` for
buttons, sets sensitivity to 32/32, and renders its own cursor. The temporary
driver trace showed the DOS driver's range still at 639x199 while NFS displayed
640x480. Mapping the host pointer onto that driver range does not position
NFS's independently integrated cursor. The earlier generic absolute-pointer
test did not cover this behavior.

NFS now enables browser pointer capture. **Click inside NFS to control its
native cursor; Escape releases capture and returns to its pause/menu UI.**
This applies to the running emulated application, including NFS's own menus.
Keyboard navigation remains available. SimCity keeps its absolute pointer path;
other variants do not enable capture.

The adapter forwards captured framework motion through the existing native
relative event queue, retains fractional motion, and suppresses SDL's parallel
mouse DOM path. Captured button press/release is delivered once. The first
click only acquires capture and cannot select an old native menu position.
Released motion/buttons are ignored. Capture loss, blur, and hidden-page events
release held inputs. Capture loss sends one native Escape unless a recent
Escape was already delivered; repeated loss notifications do not double it.

The native engine and canonical patches are unchanged. Temporary C++ tracing
was removed and the rebuilt Wasm has the same SHA-256 as the prior runtime:
`968e799bacb2a42c3e5260457e220c9a7421b55d095832db1bfe1b731aaf386f`.
The trace log is `/tmp/wasm-games-nfs-mouse-trace.log`.

## Tests and evidence boundary

Adapter regressions cover acquisition-click suppression, single delivery,
fractional movement, held-input release, Escape de-duplication, and isolation
from the other eight variants. The ordinary package, timing, native keyboard,
absolute pointer, data, HTTP and layout checks pass.

The native harness now matches EventTarget's duplicate-listener behavior.
Previously SDL video-mode changes registered the same callback repeatedly in
the test double, producing three copies of one motion event. This was a harness
bug, not a browser event-listener fix. Optional relative mouse actions now use
the exact exported queue consumed by the new adapter.

`npm run test:nfs:pointer` selects Drive with relative mouse motion/click, then
enters and drives the race. It is included alongside the keyboard version in
the optional installed-title suite. The test does not synthesize browser capture.

- `/tmp/nfs-relative-race.s26YCn`: frame 4 highlights Drive beneath the native
  cursor; the mouse click starts loading the race. Frame 11 shows the native
  Pause screen after Escape; frame 13 shows the resumed road scene after Enter.
- `/tmp/nfs-relative-regression.8WIAlZ`: a repeat pointer-driven race shows
  82 mph in third gear at frame 9. The run delivers 2,589 audio buffers, with
  2,037 non-silent buffers at both the native and page handoff, and passes the
  late-video/audio checks.

Logs: `/tmp/wasm-games-nfs-relative-race.log`,
`/tmp/wasm-games-nfs-relative-regression.log`, and
`/tmp/wasm-games-nfs-relative-final-suite.log`.
Owner-game screenshots remain outside the repository.

**This is not Chrome acceptance.** Chrome remains closed, with permission to
reopen it pending. Still verify actual capture/release, first-click behavior,
Escape while already in the main menu, focus re-entry, fullscreen, audible audio
and sustained driving. DOS does not yet expose NFS's internal menu states to
the framework; this change retains the existing running-emulator state model.
Do not mark the broad mouse/lifecycle checkboxes complete from these tests.
The missing optional Ferrari showcase assets documented in the
[race checkpoint](NFS-2026-09-04.md) also remain unresolved.

## Targeted deployment

Running image:
`sha256:b7a5abce9c2f07beb6770d51eaec9feb244d8720de1ce6351649cb1b18e5ab9a`,
tagged `local/dosbox-wasm:nfs-relative-candidate` and `nfs1-wasm:dev`.
Live adapter SHA-256:
`75e6083e0c1263999069a5882005e51a11bc4d4043b71f3308bb42aa1f0aab47`.

Candidate HTTP checks verified exact adapter/config/runtime bytes, the NFS-only
capture setting, framework 0.9.6, private data boundaries, and provisioning.
Only the NFS Compose service on port 8024 was recreated. Its owner data bind
is unchanged, all 360 files are ready, and every other running container ID is
unchanged. Pre-/post-swap lab image audits pass. RTCW is untouched.

The prior timing-only image remains available for rollback:
`sha256:884fa528d886f1b87aa775d6aebfbbe9bbf7ff49287b5b4c1608d6d9deaa6a9d`.
No game data or browser saves were deleted. The temporary HTTP probe container
and its empty anonymous volume were removed.
