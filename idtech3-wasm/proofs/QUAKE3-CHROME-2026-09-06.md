# Quake III join and menu-status checkpoint — 2026-09-06

## Live release

The exact Chrome-tested candidate is now **installed on 8083** as
`idtech3-quake3-wasm:devel`, image
`ea73d1bb7a5c7fae6e0a96101232f28dd8b56b7f1e19e7faeb1ab210d7c922cc`.
The new `wasm-quake3` container is
`2cc041e8dac3860e6e0019796d24a4842c498c8479f54fc5f93d30fcc2069388`,
started `2026-09-06T08:36:57.100329253Z`, restart count zero.
Framework 0.9.6/`ebb1ebe35ad8224a9080279a6529414db42d3284` is unchanged.

The full family suite passes again using the pinned framework checkout below
(`/tmp/quake3-release-suite-20260906.log`). The existing package verifier now
also supports `--installed`, preserving the historical pre-release report.
It compares both immutable images and current staging, then checks all 11
served site files on 8083: only the adapter changes among 53 packaged files.
The [installed package report](quake3-status-installed-package-2026-09-06.json)
retains the exact old/new hashes.

Only `docker compose ... up -d --no-deps quake3` was invoked. The
[write-once pre-release inventory](quake3-release-before-2026-09-06.json) and
[post-release audit](quake3-release-installed-2026-09-06.json) verify that all
94 other containers retain exact IDs, images, start times, restart counts,
status and mounts. The existing RW `/home/ted/wasm-game-data/quake3` bind and
all nine owner PAK hashes are unchanged. No client/server/QVM native code,
framework files or private payloads were rebuilt or edited. Both RTCW
services, OpenRCT2 and SimCity are unchanged by this release.

The lab's Quake III image contract now pins this exact image ID. Image audits
pass before and after the swap. The old image remains available as
`local/idtech3-wasm:quake3-status-baseline-20260906`
(`ff911b81783f37cee202166deee52e0ec7d6fa40cf0f171dbbb886b8f736b7cd`).
Rollback means restoring that Quake III contract/tag and recreating only
`quake3` with `--no-deps`; do not restart the stack or delete owner data.

Release checks, from `idtech3-wasm`:

```sh
node tests/quake3-status-package.test.js --installed
node tests/quake3-release.test.js --verify
node tests/quake3-chrome-evidence.test.js --installed
```

`--record-before` is write-once and requires the old sleeping, empty service;
it must not replace the baseline after deployment. The earlier observations
below distinguish the original live build from candidate 32943.

### Live Chrome acceptance

The pre-existing live launcher restores `Q3Proof906`, High detail and 120 FPS;
these preferences are left unchanged. This differs from the earlier note
about restoring `Player`: the current UI, not that earlier attempted reset,
is the evidence for the persisted value.

- Play reaches the [native menu](quake3-release-menu-2026-09-06.jpg).
  The new managed service is sleeping with zero humans before Join.
- One native Join click at 08:38:45 UTC wakes Q3DM11 and reaches
  [gameplay](quake3-release-world-2026-09-06.jpg) as `Q3Proof906`.
  Native cgame initialization reports 23.98 seconds. Initial bot fill is still
  progressing in this first observation; it is not yet a seven-bot count.
- Escape opens [the pause menu](quake3-release-pause-2026-09-06.jpg).
  Leave Arena returns to a [clean main menu](quake3-release-disconnected-2026-09-06.jpg)
  with no `JOINING Q3DM11...` label and zero native/server humans.
- One further Join click at 08:40:15 returns to
  [active Q3DM11 gameplay](quake3-release-rejoined-active-2026-09-06.jpg).
  The native log records the second player entry, and server status confirms
  one human/seven bots. Cgame initialization reports 32.30 seconds. This is a
  rejoin to the still-running server, not a second cold-wake test. The earlier
  `quake3-release-rejoined` capture and `rejoined` server observation are still
  loading; only the `rejoined-active` records prove completion.
- Escape → Leave Arena again reaches the
  [clean disconnected menu](quake3-release-final-disconnected-2026-09-06.jpg).
  The final server observation is zero humans/eight bots under the unchanged
  five-minute idle timer; the browser test tab is then cleared.

The [server sequence](quake3-release-server-2026-09-06.json) is separate from
browser telemetry. Only normal Chrome-control UI inputs were used; no hidden
engine calls or browser-storage edits. Native GL warnings, uncaptured mouse
and `1920x1115` saved-resolution cvars versus a `1424x1057` actual backbuffer
and viewport remain visible. This is status/join/disconnect acceptance, not a
performance, capture, listening or full-renderer pass.
The [installed evidence check](quake3-release-chrome-2026-09-06.json) validates
seven Chrome state/log/image records and the server sequence, keeping visual
menu review separate from automatic checks.

## Earlier diagnosis and candidate acceptance

The installed 8083 build joins a sleeping managed arena on its first native
Join Game click. Chrome reaches Q3DM11 gameplay, opens the native pause menu,
resumes with Escape and the Resume Game button, and disconnects normally.
The native end-of-round scoreboard shows the named test player and seven bots.
The previously reported need for a second Join click was not reproduced.

A separate reproduced defect is repaired: after a successful match, the main
menu retained `JOINING Q3DM11...` even after disconnect. The browser adapter
owns that label but never retired it. It now clears the label on a transition
to real gameplay, after cgame has accepted its first snapshot. Loading text
and failed-wake errors are retained until their actual outcomes are known.
This does not change connection sequencing, capture intent or native code.

## Actual Chrome observations

- Installed first join: [world](quake3-installed-first-join-2026-09-06.jpg),
  [native state/log](quake3-installed-first-join-2026-09-06.json).
  The only Join click was at 05:49:20 UTC; the 05:50:22 observation is active
  gameplay with `Q3Proof906`, not a map preview.
- Installed pause/resume: [pause](quake3-installed-pause-settled-2026-09-06.jpg),
  [Escape resume](quake3-installed-escape-resume-2026-09-06.json),
  [button resume and round scoreboard](quake3-installed-click-resume-2026-09-06.jpg).
- Old defect: the [disconnected menu](quake3-installed-disconnected-2026-09-06.jpg)
  still says `JOINING Q3DM11...`, although cgame is inactive and the server
  has zero humans. The original launcher name `Player` was restored through
  its textbox, preserving the existing High detail/120 FPS selections.
- Candidate 32943: one Join click at 06:05:42 wakes a fresh sleeping arena.
  [Q3DM7 world](quake3-status-candidate-world-2026-09-06.jpg) and
  [native state/log](quake3-status-candidate-world-2026-09-06.json) show active
  gameplay as `Q3Status906`; the managed server fills to seven bots.
- Candidate [pause](quake3-status-candidate-pause-2026-09-06.jpg) and
  [disconnected menu](quake3-status-candidate-disconnected-2026-09-06.jpg)
  work through Escape and Leave Arena. The menu no longer displays the stale
  label; the server returns to zero humans and eight bots.
- Candidate [rejoin](quake3-status-candidate-rejoined-2026-09-06.jpg) and
  [state/log](quake3-status-candidate-rejoined-2026-09-06.json) reach Q3DM7
  again on a single click from that repaired menu, with the same player name
  and seven bots. This second join uses the still-running server; it is not a
  second independent cold-wake test.
- The [final native disconnect](quake3-status-candidate-final-disconnected-2026-09-06.jpg)
  again returns to a clean menu. The [server observations](quake3-status-server-2026-09-06.json)
  finish with zero candidate humans/eight bots under the normal idle timer;
  the untouched installed arena is sleeping with zero humans.

Only normal Chrome-control UI actions were used. Observations read the
existing mirrored DOM datasets/log; no engine console, hidden native globals,
browser storage editing or injected gameplay commands were used.

## Tests and package isolation

`node tests/quake3-adapter.test.js` executes the complete adapter with mocked
engine/wake boundaries. It covers pending-wake duplicate suppression, real
snapshot gating, pause/resume, disconnect, rejoin, wake errors and successful
retry. Removing the new cleanup makes the same successful-join assertion fail.
It also checks that clearing the label does not falsely clear capture intent.

The test is included in the full passing family suite. The strict framework
pin is retained; the clean checkout was selected with:

```sh
WASM_GAME_FRAMEWORK_DIR=/tmp/rtcw-mp-checkpoint.0sgo75/wasm-game-framework npm test
node tests/quake3-status-package.test.js
node tests/quake3-chrome-evidence.test.js
```

The [recorded-evidence check](quake3-chrome-evidence-2026-09-06.json) validates
11 Chrome state/log/screenshot records and eight server observations. Image
hashes establish artifact integrity; visual acceptance came from inspecting
the Chrome screenshots, not from treating these checks as a pixel oracle.

The [package report](quake3-status-package-2026-09-06.json) compares immutable
images across the game site, framework, shell, dedicated engine and server.
Exactly one of 53 files changes: `game-adapter.js`. All 11 served game-site
files match the image and staged distribution. Native client, QVMs, dedicated
server, framework and owner PAKs are not changed. The candidate binds owner
data read-only, and the live container identity/image/start time are unchanged.

Candidate: `http://127.0.0.1:32943/`, container
`quake3-join-status-chrome-proof-20260906`, image
`sha256:ea73d1bb7a5c7fae6e0a96101232f28dd8b56b7f1e19e7faeb1ab210d7c922cc`.
Adapter SHA-256:
`32af57eb6bb7901552d89340d3edf3fb2251295894dc8319da5b92676f443f82`.
Build context and original adapter backup:
`/tmp/quake3-join-status.EnBaYO`.

## Still open

Mouse capture is **not accepted**. The installed build and candidate report
`shellInputCaptured=false`; both Join and the installed Resume button publish
capture intent without an observed lock. Escape resumes native gameplay but
does not produce a lock either. Sustained movement/aiming, firing, fullscreen,
audible playback, performance and wider map/round acceptance remain open.
An initialized/running SDL AudioContext is not listening evidence.

The installed profile's `q3NativeResolution` cvars reported `1920x1115` after
joining despite the actual canvas and GL viewport remaining `1424x1057`.
The fresh candidate keeps all three at `1424x1057`. That saved-profile
discrepancy is recorded, not diagnosed or fixed here. Native GL alias/texture
environment warnings and slow cgame initialization also remain; observed
initialization times were 29.14 seconds installed and 22.54 seconds candidate.
The candidate rejoin took 35.20 seconds. These are not a controlled performance
comparison. Automatic quality adjustment is enabled by the manifest, so the
later `picmip: 2` log is not by itself proof that launcher preferences failed.

The status cleanup was not promoted during those earlier candidate observations;
the later live release is recorded above. RTCW SP and MP services are untouched;
the Blood crash remains deferred for the user.
