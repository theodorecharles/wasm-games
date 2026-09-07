# Counter-Strike managed-match menu — 2026-09-06

The CS native main menu now matches the checked hosted-match contract:
disconnected is **Join Game only**; connected is **Resume game, Disconnect,
Configuration, Console** (Console retains its developer visibility condition).
The exact Chrome-accepted candidate is installed on 8017. This supersedes the
image in [the preceding global-isolation release](CS-MENU-GLOBALS-2026-09-06.md),
whose repair remains included.

## Scoped source repair

[managed-menu.patch](../games/counter-strike/patches/cs16/managed-menu.patch)
removes registration of campaign/training, save/load, LAN/Internet server hub,
game switching, unfinished Readme and native minimize actions from `CMenuMain`.
It compacts rows and aligns registration/traversal order with visible order.
`Think` now agrees with `VidInit`: developer mode cannot reintroduce Console on
the disconnected Join-only screen. Existing native functions remain compiled;
this does not remove engine commands or change CS client/renderer behavior.

Configuration retains native Controls, Audio, Video and Done. A direct Customize
link preserves access to player setup, which was previously behind the removed
multiplayer hub. Player setup and its existing name validation are unchanged.
The scope is the main/pause menu and this navigation link, not a rewrite of
every native settings submenu.

### Chrome caught a keyboard lifecycle bug

The first cleanup candidate on 32947 looked correct but Enter did not activate
Join. Its retained [failed Join observation](cs-managed-menu-candidate-join-2026-09-06.json)
remains `menu` / `pending` with no connection attempt. That image was rejected,
not deployed. The earlier policy fixture only checked layout and missed this.

The real `CMenuBaseWindow::Show` calls `VidInit`, then resets `m_iCursor` to
zero and probes the current mouse location. This discards the primary selection
made by `VidInit`; with the pointer outside buttons, the inactive banner at
index zero cannot receive Enter. `CMenuMain::Show` now calls its parent first,
then selects Join or Resume. No other window's selection behavior changes.

The [compiled regression](../scripts/test-cs-managed-menu.mjs) executes the
production registration, layout, Think and Show bodies. Button plumbing and
the verified base-Show reset ordering are explicitly modeled; it is not a
full-engine test. It passes 64 connection/developer/map/client-count cases and
128 dynamic developer toggles. The original menu fails registration policy;
the first cleanup source fails with `wrong default keyboard selection`.
The [final policy record](cs-managed-menu-policy-final-2026-09-06.json) preserves
fixture/source identities. Negative-control log:
`/tmp/goldsource-cs-managed-menu-focus-negative-20260906.log`.

## Reproducible build and package checks

The build applies the checked main-menu, menu-globals and managed-menu patches
to unchanged pins: cs16-client `d6ff2a863cf38d17f3610114d32bc3bd77ff3afa`,
mainui_cpp `024efda8f2078ba27767ce1140d4c6394beeb0f5`, emsdk 4.0.17.
Fresh pinned-source and retained-source incremental builds match SHA-256
`bf04a2ca7c26a0a0b092067459d030348a59c14acef54f727535f9c660aa9881`.
The served module is `artifacts/cs-menu-framework-KSOVNLXO.wasm`.
Fresh-build log: `/tmp/goldsource-cs-managed-menu-final-build-20260906.log`.

The [paired package audit](cs-managed-menu-final-package-2026-09-06.json)
checks all 27 public files against both source and the preceding release.
Only the menu module and its URL in the adapter differ. Every prior Wasm export
is retained by name/kind; only `_ZN9CMenuMain4ShowEv` is added. Export declaration
ordering changes, so comparison is set-based, not positional. The private
`gpGlobals` export/import must remain absent; the
[actual-Wasm isolation regression](cs-managed-menu-final-globals-2026-09-06.json)
also passes with this final artifact.

## Candidate Chrome acceptance

Final candidate 32948 uses a read-only bind of the active owner installation.
Actual Chrome confirms the [cold Join-only menu](cs-managed-menu-final-candidate-cold-2026-09-06.jpg)
with selected Join and intact artwork; Escape does not open a quit dialog.
Enter connects to native [textured team selection](cs-managed-menu-final-candidate-world-2026-09-06.jpg)
on the naturally current `de_dust`. The `...-candidate-join` capture is still
loading, not world acceptance. Native team/appearance auto-select succeeds.

Escape opens the [compact pause menu](cs-managed-menu-final-candidate-paused-2026-09-06.jpg).
Enter returns to gameplay; that first `keyboard-resumed` capture is a waiting
spectator view, not first-person spawn evidence. Configuration → Controls,
Audio, Video, Customize → Escape → Done navigates correctly without editing
settings or player identity. In particular, [Customize](cs-managed-menu-final-candidate-customize-2026-09-06.jpg)
shows `ChromeCSMenuFinal` and the original player-setup controls.

Clicking Resume after returning from settings reaches
[first-person pistol/HUD](cs-managed-menu-final-candidate-pointer-resumed-2026-09-06.jpg)
with 100 health. Console → lowercase `status` confirms the native map, test
player and [nine explicit Bot rows](cs-managed-menu-final-candidate-roster-2026-09-06.json).
Disconnect → OK returns to [Join only with artwork](cs-managed-menu-final-candidate-departure-2026-09-06.jpg).
Enter rejoins textured native team selection, then a second Disconnect → OK
leaves an intact final menu at `10:13:13.965Z`. The owned tab is cleared before
deployment. The [candidate evidence audit](cs-managed-menu-final-candidate-evidence-2026-09-06.json)
checks 20 retained observations / 40 file hashes, including the rejected build.

## Scoped installation and rollback

Accepted/live image: `sha256:7f11b1237e3b7f18db616fbf757d609dc89877fd2d5ca695f968deb0f65aa142`.
Live container: `6499ac4f605dafc1dd122442d34b3ebd6813a8d1c86717a39bd471ac01189774`,
started `2026-09-06T10:13:43.459426663Z`, restart count zero.
The lab image contract pins this ID as `goldsource-wasm:dev`.

Only `docker compose -f /home/ted/Development/wasm-game-lab/compose.yaml up -d --no-deps goldsource`
was used. The [before](cs-managed-menu-final-before-2026-09-06.json) and
[installed](cs-managed-menu-final-installed-2026-09-06.json) audits verify that
36 of 38 immutable image files are unchanged, all 27 HTTP hashes match, all
four variants' data checks pass, and private/obsolete routes remain 404.
All 16 original and all 16 active installation files retain their exact hashes.
The live RW data root remains
`/home/ted/wasm-game-data/goldsource-stored-wad-20260906/data`.
All 97 other containers retain exact IDs, images, start times, restart counts,
states and mounts. The native CS host, RTCW SP/MP and every other game are
untouched. The rejected 32947 image remains only a diagnostic checkpoint.

For a menu-only rollback, retain the same data root and use the preceding
`local/goldsource-wasm:cs-menu-globals-20260906` image
(`sha256:3ac53414f7fbfb8ec82ec79ecd9efb8759bae71934bfd21585267dab411821b4`).
Update only the GoldSource image contract/tag and recreate only `goldsource`
with `--no-deps`; do not restart the native host or overwrite owner data.

Full GoldSource tests and lab image validation pass. Logs:
`/tmp/goldsource-cs-managed-menu-installed-suite-20260906.log` and
`/tmp/goldsource-cs-managed-menu-lab-validate-20260906.log`.

## Installed Chrome acceptance

Live launch preserves the existing `ChromeCSReconnect`, native-viewport WebGL 2
and 120 FPS preferences. Enter from the selected
[cold Join screen](cs-managed-menu-final-installed-cold-2026-09-06.jpg) reaches
native team selection on `de_dust`. Team/appearance auto-select, Escape and
Enter-to-Resume work. The first keyboard-resumed observation is a waiting
spectator view. A separate pointer Resume returns to
[first-person gameplay](cs-managed-menu-final-installed-pointer-resumed-2026-09-06.jpg)
at `10:16:56.559Z`, with pistol, HUD and 100 health.

The native Console button works; `status` confirms `ChromeCSReconnect` and
[nine Bot rows](cs-managed-menu-final-installed-roster-2026-09-06.json).
The idle test player is subsequently killed by `red devil` at `06:17:31` local
time; that is a normal server kill, not a crash. Disconnect still opens its
confirmation; OK returns to an
[intact Join-only menu](cs-managed-menu-final-installed-departure-2026-09-06.jpg)
at `10:18:08.861Z`. The owned test tab is then cleared.

The [combined Chrome evidence audit](cs-managed-menu-final-chrome-2026-09-06.json)
verifies 29 observations / 58 retained file hashes and candidate-before/live-after
deployment ordering. Canvas acceptance is manual visual review during actual
Chrome control, not OCR or manufactured engine state. Settings navigation was
tested on the identical candidate; live verification focuses on the main menu,
keyboard/pointer Resume, Console and departure.

## Remaining acceptance

Capture, held movement, listening and broader campaigns remain open. Native
startup warnings and intermittent `Decal has invalid texture!` messages remain
visible; this menu-only change does not claim to fix them. RTCW SP remains
user-confirmed good and untouched. Blood's pitchfork crash remains deferred
at the user's request.
