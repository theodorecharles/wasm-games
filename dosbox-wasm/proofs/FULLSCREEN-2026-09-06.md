# Fullscreen rejection diagnostic — 2026-09-06

Chrome rejects fullscreen **without any game or framework loaded**. This narrows
the unconfirmed transitions in the [WASD checkpoint](WASD-POLICY-2026-09-06.md):
do not patch a game renderer or fake fullscreen to mask this browser refusal.
Actual fullscreen-enter/exit acceptance remains open for the games.

The installed candidate's bootstrap invokes `requestFullscreen()` synchronously
from its launch form's submit handler after reading the checked preference.
The server response contains no restrictive fullscreen Permissions-Policy.
No framework, adapter, engine, image, owner file or live service was changed
while investigating this failure.

The independent [diagnostic page](../tests/fullscreen-browser.html), served only
on localhost by [the probe server](../scripts/serve-fullscreen-probe.js), renders
its actual DOM event history and the fullscreen Promise result. It does not
load a game/framework, access storage, synthesize input, alter browser settings,
or retry through hidden browser APIs. COOP/COEP match the local game server.

The Chrome-control skill produced three requests:

1. Direct pointer click on Enter fullscreen.
2. Locator click on the same button.
3. Enter on the focused button.

Every click is trusted, `navigator.userActivation.isActive` is true immediately
before the request, `document.fullscreenEnabled` is true, and the page is visible
and focused. Every request rejects with **`TypeError: not granted`**, followed
by `fullscreenerror`. There is no successful request, `fullscreenchange`, or
non-null `fullscreenElement`. Thus this is not simply an enter-then-immediate-exit
transition, a missing activation, or a game-specific dependency in this control.

The exact reason the browser refuses permission is **not established**. These
observations do not prove a particular Chrome policy, extension setting, browser
launch flag or automation restriction. Browser permission/security settings were
not changed. Fullscreen remains an unmet acceptance gate, not a repaired feature.

- [Observed event/result records](fullscreen-browser-rejection-2026-09-06.json)
- [Rendered diagnostic](fullscreen-browser-rejection-2026-09-06.jpg)
- `node scripts/test-fullscreen-observation.js` validates the three refusals
  and their trusted/activated preconditions; it is not a fullscreen success test.

The probe server was stopped after the test, and the owned Chrome tab is blank.
Continue with other game-side work while this independent browser gate remains.
