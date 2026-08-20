# idtech3-wasm

`idtech3-wasm` is the engine-family workspace for Quake III Arena,
Return to Castle Wolfenstein single-player and multiplayer, and Wolfenstein:
Enemy Territory. It combines pinned native sources, reviewable downstream
patches, and the exact `wasm-game-framework` 0.9.4 launcher/data/PWA,
persistence, and input contract.
Generated engines and required game data stay outside Git.

## Status

| Game | Status | Deployment |
| --- | --- | --- |
| Wolfenstein: Enemy Territory | Live | In-tree under `games/wolfet`; image preserves the public runtime contract |
| Quake III Arena | Still in development | Canonical framework image, native JOIN GAME, sleeping same-origin QuakeJS server, rotation, and observed eight-bot fill |
| Return to Castle Wolfenstein SP/MP | Still in development | Runnable ioRTCW SP/MP clients, framework provisioning, private persistence, native state/capture, and serialized browser acceptance are complete |
| Unified id Tech 3 selector image | Still in development | Omitted until the selector can delegate every variant to its real lifecycle adapter |

These are the only status labels used by this repository: `Live` and
`Still in development`.

## Repository boundary

- `sources.lock.json` pins framework and native upstream commits.
- `patches/quake3` is the committed ioq3 QVM bridge used by fresh QuakeJS.
- `patches/rtcw` is the canonical browser-source patch based on iortcw
  `438e7d4`; its prepared tree contains no downstream launcher document.
- `games/quake3/site` and `games/rtcw/site` contain declarative framework
  metadata and native adapters, never a downstream HTML document, service
  worker, or web manifest.
- `games/wolfet` is the Live Enemy Territory package: adapter, Node host,
  Docker image, ET: Legacy patches, menus, and tests. Its `web/` tree holds
  the same framework metadata as the other games' `site/` directories.
- `.sources`, `.build`, and `dist` are generated locally and ignored.

No Quake III or RTCW game archive is downloaded by a build or stored in an
image. The required files are provisioned through a persistent `/data`
mount and the framework allowlist. Enemy Territory downloads official Splash
Damage data into `/data` at runtime; no generated engine or game archive is
copied into this repository.

## Reproducible sources

Prepare one source family from the pins and apply its committed patches:

```sh
npm run prepare:q3
npm run prepare:rtcw
npm run prepare:wolfet
```

The preparation script refuses a mismatched or dirty checkout. It never uses
the existing `quake3-wasm` or `rtcw-wasm` worktrees as build inputs. Those
siblings remain recoverable migration references.

## Images

The framework checkout must be the sibling
`/home/ted/Development/wasm/wasm-game-framework` at exact version 0.9.4 and
commit `c4ad3b9e075f881d32f044299fbfeee703a9169d`.

```sh
npm run image:q3       # quake3-wasm:devel
npm run image:rtcw     # rtcw-{sp,mp}-wasm:devel
npm run image:wolfet   # wolfet-wasm:devel
```

The Q3 image builds from official QuakeJS plus the family ioq3 patch and uses
the framework base image without bundling required game data. The WolfET image
stages `games/wolfet` into `.sources`, verifies engine-patch and icon
SHA-256 pins, then builds that clean context. Ports, Docker variables,
health/status paths, WebSocket route, idle lifecycle, and `/data` layout stay
the Live contract. The aggregate selector image remains omitted until it can
dispatch each choice to that game's real adapter and server lifecycle.

The Q3 and WolfET custom-server images accept `WASM_GAME_PASSWORD`. When set,
the canonical `/auth/status`, `/auth/login`, and `/auth/logout` flow protects
game data, engine files, status, Play/wake, administration, and WebSocket
upgrades with an HttpOnly session. Each outer server generates a process-local
`WASM_GAME_SESSION_SECRET` when one is not supplied; Q3 passes that same secret
to its private framework static child so one login cookie works across the
whole origin. `WASM_GAME_PASSWORD_TTL` defaults to `12h`, and
`WASM_GAME_TRUST_PROXY=true` is reserved for a controlled TLS proxy that
overwrites `X-Forwarded-Proto`.

## Parity gaps

- Q3 Chrome acceptance covers its absolute menu pointer, two-frame native
  resize seam, JOIN/loading/gameplay state transitions, audio, identity, and
  live human/bot replacement. The controller cannot grant browser
  pointer-lock or fullscreen permission, so those permission-bearing calls
  retain explicit intent/state telemetry for direct-browser confirmation.
- RTCW SP/MP now builds real client/QVM artifacts from the pinned iortcw tree,
  mounts owner-provisioned content through the framework, and restores
  variant-isolated configuration and saves before native main. Serialized
  Chrome acceptance covers both native menus, immediate native resize,
  configuration restore, MP identity, and the no-controller launcher state;
  gameplay save/restore coverage remains before Live.
- WolfET remains Live from the in-tree `games/wolfet` package. Its later
  serialized browser portfolio pass is intentionally separate from this
  source/package/image/server acceptance.
- The suite selector remains unshipped. Multiplayer process multiplexing and
  variant-adapter dispatch across Q3, RTCW MP, and WolfET are required before
  an aggregate image can be emitted.

Run `npm test` before any local commit. Tests verify source/patch pins,
framework 0.9.4 metadata, forbidden downstream documents, and game-data
exclusions. No build or test pushes to a remote.
