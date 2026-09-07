# Wolf3D / Spear config-persistence and prefix release

The rebuilt images are deployed at normal Game Lab8011/8012 and private Trashcan
`/wolf3d/`28127 and `/spear/`28128. Browser acceptance is still pending; there is
no connected supported browser. The old WIP patch remains unchanged as evidence.

## Repairs

`browser-config-persistence.patch` promotes that exact WIP to the canonical
series. Accepted sound, control, binding, mouse-sensitivity and view-size changes
now call `WriteConfig` at their nine native menu commit points instead of relying
on Quit before a tab reload. The original config payload is preserved with a
trailing browser version marker. Only the exact old unversioned WASD direction
layout is migrated; custom directions and intentionally saved WASD survive.
WASD fallback movement no longer also fires when that key has an explicit action
or movement binding. A separate eighth patch rejects truncated records before
partially restoring fields and truncates stale trailing bytes on rewrite.

The adapter routes policy/script/WASM downloads through the shared public-path
helper. Native `/game` and `/persistent/wolf4sdl/{variant}` paths stay unchanged.
The Emscripten pthread worker loads the same script URL supplied by the prefixed
script element; no game filesystem paths were rewritten. This still needs a
real browser worker/gameplay check. Steam exposes the supported fullscreen option,
not fabricated graphics profiles, player identity or controller support.

## Evidence and limits

- Exact eight-patch reconstruction of13 source files, all nine preparation
  prefixes, repeat runs, note preservation and overlapping-edit refusal pass.
- New config fixture compiles the actual read/write/menu-save/movement functions
  with packed native record types and real SDK key constants under host UBSan.
  Each game passes24 cases: config round trips, legacy migration, intentional
  bindings, six truncated-record lengths, bad header, stale-tail replacement and
  WASD precedence. Old unconditional direction restoration fails3 cases; omitting
  menu saves fails6. The menu call-site wiring is checked structurally, not by
  interacting with the native UI in this fixture.
- Existing menu-pointer40, movement28, menu-key12, browser palette44/desktop39,
  gameplay input81 per browser variant and SDK variant/73desktop, and binding
  names161 per variant still pass, with their negative controls.
- Both engines clean-build with SDK6.0.6 using a one-CPU,4GiB,non-root build
  container. Full `test-web.sh` passes with the pristine pinned0.9.6 framework.
  The packaging stage then explicitly installs/hashes the modified framework for
  prefix/launch preferences. The old lock does not attest that newer overlay;
  a controlled framework release/pin update remains required.
- Both images pass all16 installed site hashes and four effective-shell hashes,
  valid/distinct WASM checks, and root HTTP/PWA/range/private-data tests. The
  actual served adapters pass both variants at root, single and nested prefixes.
- All28 private routes and actual container/catalog/raw-manifest/served-manifest
  links pass. Each Wolf/Spear route has eight validated owner files and rejects
  the other variant's file keys. Normal original ports, anonymous/bind volumes,
  restart policies and all18 owner-file checksums are unchanged.

These tests do **not** prove browser IndexedDB durability, save/reload/load,
rendering, audible mix, real input capture/fullscreen or physical controllers.
Prior capture/fullscreen limitations remain open; no browser state was cleared
or user saves edited. Steam ready records remain disabled.

## Artifacts and continuation

Exact images/config IDs and hashes are in sibling Game Lab
`deploy/steam/wolf4sdl-release.json`. Additional receipts:
`wolf4sdl-build-receipt.json`, `verification-wolf4sdl-config-native-20260907.json`,
`verification-wolf3d-image-20260907.json`, `verification-spear-image-20260907.json`,
`verification-wolf4sdl-local-20260907.json`, `verification-wolf4sdl-20260907.json`
and `verification-steam-wolf4sdl-stage-20260907.json`.

Build work is retained in `/tmp/windows96-wolf4sdl-current.MNQ9qy`: source,
task-owned SDK cache, old/new distributions, logs, package receipts, exported
images and final `context-current`. The earlier `context` is incomplete; do not
use it. The compiler and all temporary image/HTTP test containers are removed.
Only the lightweight static services remain running.
