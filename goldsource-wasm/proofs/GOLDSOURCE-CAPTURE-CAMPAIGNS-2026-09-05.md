# GoldSource normal campaigns and capture repair — 2026-09-05

Checkpoint only; this is not full campaign/control acceptance or a live
deployment. Blood's user-reported pitchfork crash remains deferred; RTCW's
user-confirmed renderer is unchanged.

## Reproduction and scoped repairs

Actual Chrome, through the Chrome-control skill, launched Half-Life using Play,
New Game and Medium. No direct map commands, accelerated frame time, time-scale
changes or injected input were used.

The first normal endpoint candidate rendered the intro but remained uncaptured
at the observed gameplay clicks. The opt-in diagnostic run then recorded
overlapping pointer-lock requests: five requests before actual acquisition,
several resolved promises while `pointerLockElement` was still null, and
multiple change events. Capture did succeed for about 16 seconds in that run;
the subsequent release had no recorded focus/visibility loss. This is not
evidence that capture can never succeed, nor proof of sustained mouse look.

Added opt-in `?proof=input-capture` diagnostics to the GoldSource adapter.
The bounded, 64-record DOM dataset reports actual event trust, activation,
focus, visibility, canvas connection/runtime visibility, lock results, and
scripted exit stacks. It does not collect keyboard/text/player-name input.
Normal launches install neither wrappers nor listeners. Tests preserve native
receiver, arguments, return/Promise/error identity and bounded history.

Two shared-framework defects were reproduced with negative regression tests:

1. Down/up, native-state publication and the rAF fallback issued four requests
   before one asynchronous browser request completed. They now share one pending
   request. Rejection/fulfillment, legacy event-only APIs, synchronous throws,
   missing APIs, real release, and late settlement versus a newer request are
   covered by the actual `configure()` runtime test.
2. `showLoading()` hid the runtime even when loading intent required retained
   capture. The first Chrome candidate recorded `runtimeHidden: true` at its
   New Game capture request/rejection. The loading panel now overlays a visible
   runtime when native capture intent is active; ordinary boot/cancelled
   loading still hides it. The regression failed before this change.

The pending-only Chrome candidate confirms one request during New Game, but
that hidden-canvas request was rejected. Later requests with a visible canvas
were also rejected, so retaining the canvas is not assumed to explain every
browser failure. Both framework and GoldSource full `npm test` suites pass.

Chromium maps several browser-view conditions to `WrongDocumentError`; the
message alone does not establish a detached DOM element or a permissions
problem. See Chromium's [pointer-lock controller](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/page/pointer_lock_controller.cc)
and [browser widget implementation](https://raw.githubusercontent.com/chromium/chromium/main/content/browser/renderer_host/render_widget_host_impl.cc).

### Independent capture control follow-up

A later actual-Chrome run of the existing engine/framework-free
[`q4-capture-browser.html`](../../idtech4-wasm/tests/q4-capture-browser.html)
reproduced `WrongDocumentError` on both trusted buttons: immediate capture and
capture delayed by 400 ms. The [raw control records](goldsource-independent-capture-2026-09-05.json)
report DOM focus and user activation as true. Neither acquired pointer lock.
The temporary loopback server was stopped and its tab returned to `about:blank`.
No browser policies, security settings or API outcomes were overridden.

This reproduces the failure without GoldSource or the shared framework; it
does not establish the exact browser cause or prove every engine input path
correct. Chromium's widget implementation also rejects unavailable,
uncapturable or unfocused browser views with the same result. DOM focus alone
does not establish that browser-widget condition. Sustained mouse look remains
unaccepted; do not apply a speculative renderer/input workaround for this result.

## Normal Half-Life progress

The diagnostic-v1 run advanced `c0a0 → c0a0a → c0a0b → c0a0c`, with native
server-change/reconnect messages and renderer setup after each transition.
Native console queries confirmed `host_framerate=0`, `sys_timescale=1.0`, and
launcher-selected `fps_max=120`. The native `status` row identifies
`ChromeHLCapture` on loopback. Opening the console paused further progress;
the engine was disconnected normally afterward. Recoverable missing adjacent
map-save files and the existing GL/config/media warnings remain in the log;
this is not a clean-log or full intro/save acceptance claim.

Evidence:

- [First normal capture observation](half-life-normal-capture-failure-2026-09-05.json)
- [Initial opt-in capture trace](half-life-input-diagnostic-v1-2026-09-05.json)
- [Normal map transitions and native timing queries](half-life-normal-transitions-diagnostic-v1-2026-09-05.json)
- [Pending-only Chrome trace](half-life-pending-capture-diagnostic-2026-09-05.json)

## Isolated packages

All candidates bind owner data read-only, use read-only roots and isolated
temporary filesystems, and expose only loopback HTTP. No live frontend or
Counter-Strike host was replaced/restarted.

| Candidate | HTTP | Image SHA-256 |
| --- | --- | --- |
| Diagnostic v1, unchanged framework | 32927 | `1ca467d1c0439261e17a9dc78f4dfaa5691b6edc9b57f856307172ce9c774bf2` |
| Pending-request fix and diagnostic v2 | 32928 | `a62c267dd0772c6cc96a7a2f133743151d9bc4f600b510b20d8f2c3c2cefc38a` |
| Pending-request plus loading-canvas fix | 32929 | `68ce8833d3d4d6048f36de1b603017c185e2dcbf8cddb85273f295f2ee4f834d` |

The latest package is `local/goldsource-wasm:pending-capture-loading-candidate`
in `goldsource-capture-loading-chrome-proof-20260905`. Its tested framework
SHA-256 is `22f01caae7014140a282cf915a44b2d6fee5ec63868f6ab9d3a0e7b9e2c5e6e1`;
adapter source is `f56d2068a7c9061e3e67bd13e45cc55ed767f35a441e6dec4da128bddaac9e31`;
adapter bundle is `f0da851c9d204c4ed01e2287ac40cbb2b840d3807b12af202a02fe405078e3f0`.

[Pending-only](goldsource-pending-capture-package-2026-09-05.json) and
[loading-canvas](goldsource-capture-loading-package-2026-09-05.json) HTTP checks
require all 13 native/support artifacts to match staging and live bytes,
unchanged bootstrap/CSS/manifests, the exact tested repaired framework/adapter,
canonical entry point, and 404 responses for direct owner-data paths.

## Blue Shift follow-up

Play reached the native menu with initialization messages spanning
21:25:33–21:25:34 local time. Normal New Game/Medium took approximately
19 seconds between ending the prior state and `Game started`, with resources
complete at 21:26:31. This verifies startup completes, **not** that the reported
loading-performance problem is fixed. The moving outdoor tram, textured
buildings/terrain and 100-health HUD are visible in the
[saved frame](blue-shift-normal-world-2026-09-05.jpg).

The [campaign trace](blue-shift-normal-campaign-2026-09-05.json) records the
single pending capture request across that long synchronous load, then a
`WrongDocumentError` rejection; a fresh gameplay click was rejected too.
A brief hidden/visible event pair followed the load, unlike the earlier
Half-Life trace. [Native status and departure](blue-shift-normal-status-2026-09-05.json)
confirm `ba_tram1`, `host_framerate=0`, `sys_timescale=1.0`, and normal disconnect.
The player row carries the persisted Half-Life name, not a newly entered
Blue Shift name (that variant has no identity field).

A concrete performance lead remains for follow-up: the owner packager deflates
every file, including WAD archives. Read-only archive metadata confirms Blue
Shift's `halflife.wad` is 37,914,096 bytes uncompressed and DEFLATE-compressed.
The pinned native source's `filesystem/wad.c::W_ReadLump()` seeks to each lump
and back, while `filesystem/filesystem.c::FS_Seek()` resets and re-inflates
compressed streams for backward seeks. This can amplify nested WAD reads;
it is a source-supported hypothesis, **not yet a profiled cause or repair**.
No owner archive was rewritten and no native filesystem patch was applied.

The subsequent [stored-WAD checkpoint](GOLDSOURCE-STORED-WAD-2026-09-05.md)
tests this lead with separate, payload-identical private copies and verifies
the large map-start improvement. The original archives remain unchanged.

## Opposing Force follow-up

Normal Play reached the native menu with initialization messages at 21:29:31.
New Game/Medium entered its initial map after approximately 15 seconds
(21:30:23–21:30:38). The title faded to the helicopter interior, animated
soldiers and moving textured terrain, captured in the
[saved scene](opposing-force-normal-world-2026-09-05.jpg).
The [campaign trace](opposing-force-normal-campaign-2026-09-05.json) reports
authoritative gameplay/server identity, but both the initial single capture
request and the fresh gameplay attempt were rejected with `WrongDocumentError`.
The initial request had a visible, connected canvas; no scripted exit was
recorded. As in Blue Shift, a brief hidden/visible pair followed the long load.
This is startup/rendering evidence, not a capture or audio pass.

[Native status and departure](opposing-force-normal-status-2026-09-05.json)
confirm `of0a0`, `ChromeOFProof` on loopback, `host_framerate=0`,
`sys_timescale=1.0`, and normal disconnect back to the menu. All campaign test
tabs were navigated to `about:blank` after their engines disconnected.

## Remaining acceptance

The combined candidate's [Chrome trace](half-life-capture-loading-diagnostic-2026-09-05.json)
confirms a single New Game request with `connected: true` and
`runtimeHidden: false`. The [saved tram view](half-life-capture-loading-world-2026-09-05.jpg)
is textured and lit. Chrome still rejected capture with `WrongDocumentError`,
including a later visible-canvas click (sequential settled retries, not
overlapping pending calls). No scripted exit was recorded. Thus the two shell
regressions are fixed, but this run **does not pass mouse-look acceptance**.

First-map startup/rendering is now observed for all three campaigns.
Complete unaccelerated intro sequences, sustained capture/mouse look, held
movement/fire, audible playback, log selection, save/reload and live promotion
are still open. Do not turn isolated capture success or native audio-driver
initialization into a control/audio pass.
