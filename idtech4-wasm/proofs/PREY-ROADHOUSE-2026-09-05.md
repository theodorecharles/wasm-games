# Prey Roadhouse and keyboard checkpoint — 2026-09-05

Latest [menu/cache and letter-key checkpoint](PREY-MENU-CACHE-2026-09-05.md)
supersedes the black-world/audio limitations below and adds uppercase-key
identity coverage, with 43 current keyboard/text cases and native Chrome
binding acceptance. The historical 37-case results remain intact.

Follow-up: the [image-accounting checkpoint](D3-IMAGE-ACCOUNTING-2026-09-05.md)
records two later native diagnostic crashes and their repairs. The rendering
and input observations below describe the preceding input candidate.

Status: black gameplay reproduced through native New Game → Normal. Bounded
post-load tracing disproves the earlier second-frame-stall diagnosis for this
run. A separate missing-keycode repair passes 37 real-SDL Wasm cases and Chrome
submenu/pause/resume and native console Enter checks. Visible gameplay remains
open.

## Browser reproduction and corrected diagnosis

The [retained live-image record](prey-roadhouse-legacy-chrome-2026-09-05.json)
and [black canvas](prey-roadhouse-legacy-black-2026-09-05.jpg) reproduce the
problem on the unchanged port-8087 service. The menu and native difficulty
selection work; four deferred archives mount, 1057 entities and the player
spawn, and 1208 images load. The map reports 15590 ms to load and returns to
the worker frame pump. Escape produces `unmapped SDL key 0 (scancode 41)`;
this is evidence of event processing, not proof that the worker is hung.

The older first-four-frame diagnostics count startup frames, so they never
reach a map started later through the menu. Browser-only diagnostics now rearm
four frames after each completed map transition and mark events, networking,
session, scene draw and backend completion. They do not skip rendering or
change a quality setting.

The [isolated trace record](prey-roadhouse-trace-chrome-2026-09-05.json) shows
all four post-map frames complete, including the frontend and backend. Gameplay
is reported at `195367.5` ms; the fourth traced frame completes at `195785.1`
ms. The [canvas remains black](prey-roadhouse-trace-chrome-2026-09-05.jpg).
Backquote subsequently opens the native console's cyan boundary, another
visible response. Console text/background images were reported missing during
initialization. The black scene's rendering/material cause is not yet known.

This supersedes the second-post-transition-frame blocker in the historical
August checkpoint; it does not establish that gameplay is playable. Audio
also remains disabled after the current worker fails to open an OpenAL device.

## Keyboard repair

Prey's direct worker WebGL path initializes SDL timers/events, not SDL video.
The SDL keyboard layout table is therefore empty. Page input supplies a
character for ordinary text keys, but non-text keys such as Escape, Enter,
arrows, modifiers and function keys arrive with only a scancode. The old export
asks the empty SDL table for their keycode and queues zero.

The browser-only export preserves supplied layout characters and any valid
SDL mapping. Otherwise it supplies the unshifted physical keycode: ASCII for
printable/control exceptions, SDL's scancode mask for the remaining keys.
Invalid scancode bounds are rejected. Text remains a separate input message;
the existing game event mapper and desktop input path are unchanged.

- [Legacy real-SDL regression](prey-input-legacy-2026-09-05.json): 34 of 37
  key cases fail; the three supplied-character controls pass.
- [Repaired regression](prey-input-native-2026-09-05.json): all 37 pass,
  checking SDL queued down/up types, keycodes, scancodes, states and repeat.
  This compiles the actual browser export with Emscripten's SDL2 without video;
  it does not run the complete engine or establish sustained browser controls.
- `build-all.sh` now runs the new regression after the Prey build. All four
  exact patch trees and the full existing staging suite pass.

Run in the pinned Emscripten 6.0.6 build environment:

```sh
node idtech4-wasm/scripts/test-prey-input.mjs
```

Canonical Prey patch SHA-256:
`81736e394c52b4b5f5e2c845a3cc93b6703146fad68713c7a2128f755d77aaee`.
The isolated trace image is retained. No live service, Quake 4 binary, RTCW
renderer, owner archive or Blood investigation changes in this Prey work.

## Repaired-input Chrome acceptance

The [packaged build record](prey-input-build-2026-09-05.json) identifies isolated
image `sha256:fbccd1842a3993f112d379df8e72718317a0703ee3a5fffc7d5e81eed1488534`
(`local/idtech4-wasm:prey-input-candidate`, port 32877). Its Wasm is
`7e17973bc32ae9a9682331de7241a0ef353cba1e8c854435d3e29c9111baff48`.
All four packaged Prey artifacts match the staged outputs; the worker and
adapter are unchanged from the trace image.

The [browser record](prey-input-chrome-2026-09-05.json) and screenshots show:

- Native New Game opens the difficulty submenu. Escape at `142346` ms returns
  to the [main menu](prey-input-menu-2026-09-05.jpg), without the old unmapped-key
  warning.
- New Game → Normal loads Roadhouse and reports gameplay at `232794.1` ms.
  The scene remains black. Escape now reports paused at `247126.2` ms and
  renders the [native pause menu](prey-input-pause-2026-09-05.jpg).
- A second Escape resumes at `290349.6` ms. Backquote opens the native console.
  Physical character keys followed by Enter execute `GETVIEWPOS` at
  `346328.2` ms; the game prints `(-301.67 -340.33 58.05) 179.7`.
  The generic browser text-insertion operation did not generate game key
  events, so that preliminary empty Enter is not counted as command acceptance.
- No worker errors or unmapped SDL keys occur. This proves those native key
  transitions and console execution, not all 37 keys in Chrome or sustained
  movement, capture, save/restore, audio or correct gameplay rendering.

Next: diagnose actual scene/material output using the now-working native
console. The old first-four-frame hang assumption should not be used as the
starting point. Console images missing before deferred-archive mounting and
gameplay image/shader state are concrete inspection targets, not established
causes yet.
