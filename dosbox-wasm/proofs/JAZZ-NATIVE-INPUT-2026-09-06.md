# Jazz native input/save follow-up — 2026-09-06

Later: the [WASD policy checkpoint](WASD-POLICY-2026-09-06.md) adds and tests an
explicit movement/typing switch. That follow-up does not change this checkpoint's
native-only gameplay/save acceptance or deploy a platformer engine.

## Result and scope

The current staged DOSBox engine runs Jazz's normal New Game path and accepts
native keyboard menu navigation, save-name text, Right/Left movement, save/load
and Quit Game. This is **native Wasm diagnostic evidence, not Chrome acceptance
or a deployment**. The previous blanket uncertainty about native Jazz menu/text
input is narrowed; the browser-control and WASD-policy work remains open.

The Chrome-control skill was used against unchanged live **8020**. Normal Play
reaches the title, root menu and attract demos, but short Enter/Down/Escape taps
and a direct row click still do not establish reliable menu selection. Demo
scenes are not counted as gameplay. The earlier independent
[trusted-event timing control](chrome-key-timing-2026-09-05.json) measured 1–2 ms
taps. This is a testing limitation, not proof that duration explains every missed
input. No minimum key duration or hidden browser input was introduced. All four
owned Chrome tabs were left `about:blank`.

## Actual native observations

[Evidence index](jazz-native-input-2026-09-06.json) records 15 inspected frames,
sample records, exact artifact hashes and the protected live-service state.
Both current-engine diagnostic runs use a fresh in-memory DOS drive populated
from the 66 owner files, normal native input exports and a simulated 4 ms host
timer minimum. No owner installation or browser storage is edited.

The first run navigates the required first-run Gameplay Options with Down,
selects Done, then reaches New Game, Medium difficulty and Turtle Terror.
The second run repeats startup and continues through the complete sequence:

| Stage | Inspected evidence |
| --- | --- |
| Native settings Down changes selection | [Sound FX highlighted](jazz-native-settings-down-2026-09-06.png) |
| New Game selections | [Medium difficulty](jazz-native-difficulty-2026-09-06.png), [Turtle Terror](jazz-native-episode-2026-09-06.png) |
| Level 1:1, normal Escape menu | [Pause, full health bar](jazz-native-pause-2026-09-06.png) |
| Native Save Game, first empty slot | [Empty slots](jazz-native-empty-slots-2026-09-06.png), [name prompt](jazz-native-name-prompt-2026-09-06.png) |
| Letters and digits accepted | [`WASD906`](jazz-native-typed-name-2026-09-06.png) |
| Backspace, retype `6`, Enter saves | [Returned to gameplay](jazz-native-saved-world-2026-09-06.png) |
| Right hold moves into the turtle, damaging Jazz | [Moved player and reduced green health bar](jazz-native-right-damage-2026-09-06.png) |
| Left hold moves back | [Returned left with damage retained](jazz-native-left-return-2026-09-06.png) |
| Native Load Game lists the saved name | [`WASD906` selected](jazz-native-load-slot-2026-09-06.png) |
| Load restores the original visible position and full health bar | [Restored world](jazz-native-restored-world-2026-09-06.png) |
| Native Quit Game | [Intact main menu](jazz-native-quit-menu-2026-09-06.png) |

The movement holds are approximately one second; operator-driven menu/text
holds are roughly 350 ms, while scheduled startup taps are 100 ms. These are
diagnostic input durations, not altered production timing. The saved name is
displayed in uppercase by Jazz after lowercase letter codes are supplied.
The original WASD letters remain text, not arrows, in the native queue.

HUD/scene/name interpretation is visual; no OCR or exact coordinate oracle is
claimed. The save/load occurs in one native process, not after a browser reload.
The successful 240-second save run ends normally with JAZZ still running,
5,667 framebuffer updates and 9,403 nonzero audio callbacks. Nonzero PCM is not
an audible-listening test. The full samples are retained for the
[menu run](jazz-native-menus-samples-2026-09-06.json) and
[save run](jazz-native-save-samples-2026-09-06.json).

## Reproduction

Use `scripts/test-installed-runtime.js` with `web/dist`, variant `jazz`, the
owner data root and a fresh report directory. Set `DOSBOX_NATIVE_INTERACTIVE=1`,
`DOSBOX_NATIVE_MIN_TIMER_MS=4` and `DOSBOX_NATIVE_SAMPLE_MS=1000`.

The save run's scheduled startup sends six Down taps at 11–13.5 seconds
(500 ms apart), Enter at 14.5 seconds to accept Done, Enter at 36/38/40/42
seconds through the title/New Game/difficulty/episode sequence, and Escape
at 52 seconds. Every scheduled tap holds 100 ms. Inspect the actual screen
before continuing; startup timing is not an acceptance oracle.

From the observed Continue Game menu, Down → Enter selects Save Game, and
Enter selects the first empty slot. Type `wasd906`, Backspace, `6`, Enter.
Then hold Right and Left for approximately one second each. Escape → Down
twice → Enter opens Load Game; Enter restores the named slot. After inspecting
restoration, Escape → Down seven times → Enter selects Quit Game. Each
operator-driven input uses the documented native JSON `key` operation; it
does not control Chrome. The report directory contains `frame-N.png` and
`samples.json`; screenshots must be inspected, not inferred from exit code 0.

Current staged engine hashes:

- JS: `16fd8f9724796f15e3eac63a1126b2f4b441f3a059f517235d14698f4f4d25f8`.
- Wasm: `968e799bacb2a42c3e5260457e220c9a7421b55d095832db1bfe1b731aaf386f`.

These include the previously implemented timing repair and differ from the
older live Jazz engine. No engine, adapter, image or source patch changed here.
All 66 original owner-file SHA-256 values still match the manifest. Live Jazz,
Jill, Duke 1/2 and protected RTCW SP retain their prior images/start times and
zero restarts. Blood remains deferred.

## Diagnostic counter repair

An earlier ten-minute run of the exact live-engine extraction ended with a
false `native machine loop did not advance` assertion. Its retained
[original samples](jazz-native-old-counter-samples-2026-09-06.json) show the
machine counter crossing the signed i32 boundary while frames/audio advance.
The last raw JavaScript value is `-2088228463`, representing the C++ unsigned
counter **2,206,738,833**. Testing the raw value against `> 10` was incorrect.

`native-counter.js` now normalizes exported counter values as unsigned, and
both native runtime diagnostics use it for their machine-loop gate. Installed
runtime sample/output counters are also normalized; its late-audio comparison
uses an unsigned difference across the wrap. Signed CPU-cycle settings remain
unchanged. Nine values, eight invalid inputs, five delta cases and the actual
captured old-gate failure are regression-tested. This fixes the diagnostic,
not game input or an engine crash.

```sh
node dosbox-wasm/scripts/test-native-counter.js
node dosbox-wasm/scripts/test-native-runtime.js /tmp/dosbox-live-site.BXQu4f --keyboard-only
DOSBOX_SKIP_BUILD=1 bash dosbox-wasm/scripts/test-web.sh
```

The 70 actual-DOS BIOS cases pass on the exact live extraction. The complete
no-build package suite passes on the current staged engine, including nine
adapters, native keyboard/mouse/filesystem, timing, persistence, HTTP and private
data boundaries. The ten-minute run was not repeated after normalization;
its exact captured signed value is the negative control, and the subsequent
four-minute save run passes the repaired diagnostic.

## Remaining work

- Reliable Jazz menu/text/gameplay in Chrome and browser save persistence.
- A working WASD movement/text policy: queue input currently preserves letters,
  while the launcher still promises WASD movement. Native menu/text success does
  not resolve that separate mismatch.
- Jill 2/3, Duke 1/2 browser retests, sustained controls, listening and wider
  gameplay acceptance; no title receives a full-playability mark here.
