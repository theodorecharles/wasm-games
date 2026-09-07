# DOSBox movement/typing policy — 2026-09-06

Later: the [fullscreen diagnostic](FULLSCREEN-2026-09-06.md) records the same
browser refusing three trusted, activated requests without a game or framework.
This narrows that gate without claiming fullscreen works or changing this image.

## Result and scope

The WASD/text conflict is fixed in the adapter and an **isolated v3 candidate**
for Jill 1–3, Jazz and Duke 1–2. Actual adapter-to-DOS BIOS checks pass on both
the current staged engine and the exact live platformer engine. Chrome verifies
the six visible controls, pointer/keyboard activation, focus restoration and
reset to original typing keys after a full page reload.

This is **not held-gameplay, browser-save, fullscreen or deployment acceptance**.
No live service or owner installation changed. RTCW rendering is untouched;
Blood remains deferred.

## Policy and implementation

The explicit native keyboard queue bypasses the upstream SDL event loop's
blanket WASD remap. Restoring that blanket remap would break letters in setup,
menu shortcuts and save names again. The adapter's `gameplay` state only means
the DOS executable started: it cannot distinguish those screens from actual
play. The new policy therefore does not infer when the user wants to type.

- Every page starts with **WASD movement: Off**. Original letters reach DOS.
- Turn it **On** to map physical W/A/S/D to Up/Left/Down/Right. Arrow keys and
  the remaining game keys retain their original meanings in both modes.
- Turn it **Off** before letter shortcuts, names or native key configuration.
- Click the switch, or use **Shift+Tab** from the game to focus it, then Enter
  or Space to toggle. Escape returns focus without changing the mode. Plain
  Tab remains a game key. The initial Shift is still an original game key;
  the reserved combination does not send Tab to DOS or pause the game.
- The adapter adds its own control inside the framework runtime container.
  It does not replace or restyle the canonical canvas/document, overwrite
  per-game configuration, or persist a surprising movement mode across reload.

Keyboard ownership now tracks physical keys and their keydown translations.
W plus Up, both Shift keys, Enter plus keypad Enter, and keyboard/controller
aliases cannot release each other. Mode changes, canvas/window blur and hidden
documents release keyboard ownership. A still-held controller retains its own
ownership. Repeats, duplicate downs and unmatched releases are consumed instead
of falling through to SDL's second, differently mapped input path.

SDL's fallback keyboard listener is restricted to the canvas, so HTML button
Enter/Space are not captured as game input. GTA, NFS and SimCity receive neither
the switch, the WASD translation nor the Shift+Tab reservation. Existing NFS
capture/mouse and controller contracts still pass.

## Verification

`node scripts/test-adapter.js` exercises all nine variants, original and mapped
keys, save-name characters/digits/Backspace, repeat/duplicate suppression,
physical aliases, controller ownership, mode changes while held, focus and
visibility cleanup, control scope, loading/abort and existing persistence/input
contracts. Five mutations of the actual adapter fail the intended assertions:
missing movement translation, blanket letter remapping, unowned alias release,
holding a key across a toggle, and the old repeat fallthrough.

`test-native-runtime.js --adapter-keyboard` uses the real adapter's listeners
and mode button, forwards their output to production Wasm and runs the NASM DOS
BIOS diagnostic. All **92 cases pass on each engine**: 70 original-key cases,
12 movement-mode cases and 10 restored typing/edit/submit cases. These are BIOS
ASCII/scancode results, not merely assertions about JavaScript key numbers.

- [Current-engine BIOS results](wasd-bios-current-engine-2026-09-06.json)
- [Exact-live-engine BIOS results](wasd-bios-live-engine-2026-09-06.json)

The full `DOSBOX_SKIP_BUILD=1 bash scripts/test-web.sh` run passes, including
both keyboard paths, mouse BIOS, DOS write/seek/header/close/reopen, timing,
counter, data/persistence contracts, package/HTTP and private-data boundaries.
The new adapter/native test is included in both the package test and
`npm run test:native`. No engine rebuild or artificial minimum key duration was
introduced for this change.

## Chrome observations

The Chrome-control skill was used on the isolated candidate at
`http://127.0.0.1:32956/?game=<variant>`. The suite selects games with `game`,
not the data API's `variant` parameter. All four owned tabs are now blank.

| Game | Retained control evidence | Native screen observed |
| --- | --- | --- |
| Jill 1 | [Off](wasd-jill1-default-2026-09-06.jpg), [keyboard focus](wasd-jill1-keyboard-focus-2026-09-06.jpg), [Enter → On](wasd-jill1-keyboard-on-2026-09-06.jpg) | Sound setup; Y/Y/K/V proceed through setup to the normal menu |
| Jill 2 | [Off](wasd-jill2-fullscreen-attempt-off-2026-09-06.jpg), [On](wasd-jill2-fullscreen-attempt-on-2026-09-06.jpg), [Space → Off](wasd-jill2-space-off-2026-09-06.jpg) | Sound setup |
| Jill 3 | [Off](wasd-jill3-default-2026-09-06.jpg), [On](wasd-jill3-on-2026-09-06.jpg), [reload → Off](wasd-jill3-reload-off-2026-09-06.jpg) | Sound setup |
| Jazz | [Off](wasd-jazz-default-2026-09-06.jpg), [On](wasd-jazz-on-2026-09-06.jpg), [keyboard → Off](wasd-jazz-off-2026-09-06.jpg) | First-run Gameplay Options |
| Duke 1 | [Off](wasd-duke1-default-2026-09-06.jpg), [On](wasd-duke1-on-2026-09-06.jpg) | Credits/ordering screens; keyboard focus escape also exercised |
| Duke 2 | [Off](wasd-duke2-default-2026-09-06.jpg), [On](wasd-duke2-on-2026-09-06.jpg) | Apogee startup screen |

Each screenshot has a same-stem JSON observation containing the selected
variant, visible button text/pressed state/bounds, active element and existing
loading log. The six controls stay inside the observed 1424×1058 viewport.
Jill and Jazz retain their current native prompt when Enter toggles the focused
HTML control. This does not establish an in-game menu or save operation.

[GTA](wasd-gta-no-control-2026-09-06.jpg),
[NFS](wasd-nfs-no-control-2026-09-06.jpg) and
[SimCity](wasd-simcity2000-no-control-2026-09-06.jpg) have no control in the
initialized DOM. These three observations are launcher/init scope, not new
runtime or gameplay acceptance.

Two important attempted checks remain unaccepted:

- Jill's [S-as-Down attempt](wasd-jill1-s-down-attempt-2026-09-06.jpg) and
  subsequent W/Enter taps did not visibly move/select the normal menu; the
  [final Play attempt](wasd-jill1-play-attempt-2026-09-06.jpg) still shows Play
  selected. The earlier [independent timing control](INPUT-2026-09-05.md)
  established 1–2 ms Chrome taps, not held input. This run does not prove that
  duration alone explains the missed inputs. No new gameplay is claimed.
- Jill 2 and Jill 3 were launched with fullscreen selected, using a locator
  click and a direct pointer click respectively. Both observations still have
  `fullscreen: null` and the same viewport. The controls' runtime-container
  placement is correct structurally, but actual fullscreen usability is not
  verified and the declined/missing transition needs a separate diagnosis.

The previous [native Jazz save/movement proof](JAZZ-NATIVE-INPUT-2026-09-06.md)
remains useful native evidence; it does not turn these browser checks into
Chrome gameplay or save acceptance.

## Exact package and preservation

Candidate: `dosbox-wasd-v3-chrome-proof-20260906`,
image `sha256:f27cffdaa831c1e8d2d45cf3a3cfe0d417f56dc4fa031170d17129c010c658c0`.
It has a read-only root, a bounded 512 MB `/tmp` and a read-only owner-data bind.

The original suite image metadata was unavailable to Docker's image builder,
although its container remains running. The isolated image was assembled from
the available `af08e809ff9f5d67e0440dfc90624aeb6761fa952d46b04ce71bdf90f3ae2836`
base, with the **exact running suite's Wasm copied read-only** and the current
adapter, manifest and supporting configuration files. The retained
[Dockerfile](wasd-candidate-2026-09-06.Dockerfile) uses the local
`dosbox-wasd-base:20260906` tag for that base.

The initial candidate omitted the already-existing GTA sound template; its
successor also retained older comments in the pointer configuration. V3 copies
both current source files explicitly. The two superseded owned candidates are
stopped, not removed. None was installed on a live port.

[The package audit](wasd-package-2026-09-06.json) compares the running suite and
candidate across `/opt/game-site`, `/opt/shared-shell` and the framework runtime:
25 of 27 baseline files are identical; only adapter/manifest change. The existing
pointer and GTA sound templates are added for the current adapter's other game
paths. All 14 served-file hashes, nine owner-data readiness checks and both
hidden raw-data roots pass.

The platformer engine remains unchanged:

- JavaScript: `f90ece402ce7e23e323281b55774d10f4dc8d6d2caa9b7fdf7f58935bdb3b104`
- Wasm: `70486266d6a794767154f2175f64f58b1f4dc8065d5f3a1fc21f269f38650dd3`
- New adapter: `325130ee7a69b10d89a89dd24ce0dcd96cd1a3e5aa5dcb3d835dc36ff5c09d61`

[The pre-test snapshot](wasd-before-2026-09-06.json) and final audit show all
105 pre-existing containers retain their IDs, images, start times, restart
counts and mounts, and all 696 curated owner files retain their sizes/hashes.
The later timing engine used by the other native proof is not promoted to the
platformer services here. Do not replace the already-repaired live GTA, NFS or
SimCity engine with this platformer-engine candidate.

[The evidence index](wasd-evidence-2026-09-06.json) pins 47 artifact hashes,
including 21 Chrome image/DOM pairs and both 92-case native results.
Recheck without replacing the retained observations:

```sh
node scripts/test-wasd-package.js
node scripts/test-wasd-evidence.js
```

Next gates are real held movement, native menu/save-name interaction and
browser save/load in the platformers, plus the separate fullscreen transition.
Only then consider a targeted live update using each title's accepted engine.
