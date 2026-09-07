# Modernized Chrome input repair and seven-title sweep — 2026-09-04

The later [classic Chrome checkpoint](CLASSIC-CHROME-2026-09-04.md) supersedes
the live adapter/image IDs below and extends the input fix to all profiles.
Its native engines and this historical seven-title evidence are unchanged.

Installed at `http://127.0.0.1:8010/`. Real Chrome testing found and fixed
duplicate physical input in Modernized deathmatch. All seven titles now reach
their own rendered managed matches with one browser player and two bots.
This is a bounded browser checkpoint, not full gameplay/audio acceptance.

## Browser-only defect and repair

The prior audio image reproduced a single mouse click on Doom II's Options
opening Options and then HUD Options. A single Escape backed out two menu
levels. The adapter reinjected physical keyboard/button/wheel events through
the controller seam while Zandronum's SDL 1.2 DOM handlers also delivered them.

The adapter now leaves those physical events to SDL for Modernized deathmatch.
Captured relative mouse motion still uses the browser seam because the port's
SDL relative-state shim is empty. Gamepad input still uses its existing native
seams. Classic and DSDA input routing is unchanged.

In the installed image, Chrome verified single-click transitions from Doom II
Main to Options to Sound Options, followed by one-level Escape transitions
back to Options and Main. Heretic and Hexen each open Options with one click.
The native cursor is visible in those menus and the host cursor is hidden.

The adapter regression now retains and dispatches every registered listener
instead of silently overwriting earlier listeners of the same event type. It
checks physical input ownership across all seven titles/profiles, preserved
relative motion, gamepad movement/fire, and attack release on disconnect.
Full static/source/package/HTTP checks pass; the final expanded adapter test
also passes. No native executable rebuild was required.

## Real Chrome evidence

[Recorded browser telemetry](modernized-chrome-2026-09-04.json) accompanies
screenshots inspected during the session. Tests used Chrome-control UI actions
and read-only DOM/CDP diagnostics, not injected native gameplay commands.

- Doom, Doom II, TNT, Plutonia, Heretic, Hexen and Chex each render the selected
  game's actual world, report a live netgame and three native players, capture
  on a gameplay click, and release capture into their native menu on Escape.
- Physical mouse holds trigger native attack and return to released state.
  Doom II visibly respawns and consumes pistol ammo. Heretic, TNT, Plutonia,
  Chex and Doom show firing/ammunition changes; Hexen shows the fist attack
  animation and explicit attack-state transition.
- All seven have one native audio device with advancing callbacks. Chrome
  reports realtime WebAudio contexts transitioning from suspended to running
  at 48 kHz for six titles. Doom II's context was queried after startup and
  reports an advancing realtime clock and audio callback timing. This verifies
  actual browser scheduling, not listening quality or the user's output device.
- The sequential selections no longer fall back to the previously running
  game's match. Each previous browser connection was released before selecting
  the next title. No test changed saved audio settings or used cheats.

Limitations remain explicit: no audible listening/recording was performed;
sustained physical keyboard movement, full campaigns, fullscreen and strict
FPS-cap behavior are not accepted by this pass. Very short automated W taps
did not establish movement and must not be counted as a movement proof.
Initial asynchronous joins and Escape-to-gameplay resumes were uncaptured;
a subsequent gameplay click acquired real pointer lock. Automatic capture at
those transitions remains open. Modernized single-player DSDA and the
Original/Smooth startup and solo-with-bots issues need separate acceptance.

## Deployment

- Image: `sha256:18f85a41053cd94c8397747bdfb41e19cff15dedccd309e4d4124aa3c738ae42`.
- Tags: `idtech1-wasm:dev`, `local/idtech1-wasm:physical-input-candidate`.
- Container: `ea1d5bc997135893242fe437e06c13bf6d7846ea2c99379102ebdb2dabd715b5`.
- Served adapter SHA-256:
  `db74da614f9975dc6eefe190ba29546b2628e9a8cd825540c7f72b3c9bf75524`.
- Rollback retained as `local/idtech1-wasm:audio-candidate`, image
  `sha256:5bec163905562b4455349e92c774eab83bb28c219d45a0bf2d4567b15f3cb0be`.

The targeted image layer copies only `game-adapter.js`. The 40 regular served
files audited before/after differ only in that adapter. Native engine files,
audio notices, framework and servers are inherited unchanged. All 31 other
lab container IDs are unchanged, including the user-confirmed RTCW renderer.
Pre/post lab image audits pass; owner data, binds, ports and saves are unchanged.
The test match was disconnected and Chrome was left on the family launcher.

The targeted Dockerfile, exact inventories, hashes and adapter-test log remain
under `/tmp/idtech1-chrome-input.qDpFRI`. Changes are local and uncommitted.
