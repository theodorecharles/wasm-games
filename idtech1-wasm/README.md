# id Tech 1 WASM suite

Play the classic id Tech 1/Doom-engine family in a browser from one shared
codebase. The suite builds native Crispy Doom and DSDA-Doom sources with
Emscripten and uses
the common WASM Game Framework launcher, loading surface, viewport, input, and
Docker deployment contract. This repository does not own an HTML/CSS shell:
it supplies `wasm-game.json`, `game-adapter.js`, the declarative game-data
manifest, engine artifacts, and public artwork to framework 0.9.4
(`c4ad3b9e075f881d32f044299fbfeee703a9169d`).

## Games

| Title | Status |
| --- | --- |
| Doom / Ultimate Doom | Still in development |
| Doom II | Still in development |
| Final Doom: TNT | Still in development |
| Final Doom: Plutonia | Still in development |
| Heretic | Still in development |
| Hexen | Still in development |
| Chex Quest | Still in development |

No game IWAD is included in Git or a container image, including Chex Quest and
Doom Shareware. The build downloads neither from third-party archives. Supply
the required WAD through the framework's first-run container
provisioner. The container applies a bounded downstream WAD-directory parser,
identifies the selected game from its structural lump signatures, and performs
an atomic write to its persistent `/data` volume only after validation.
The same `/data-validator.mjs` module runs before browser caching. It accepts
compatible classic, rerelease, and enhanced WAD revisions by structure; known
SHA-256 values are reported as release metadata and never used as a hard gate.
Malformed ranges, wrong IWAD/PWAD types, and files from another game family
are rejected. Chex Quest also requires the separately supplied `chex.deh`
compatibility patch built by this repository.

The only redistributable WAD-adjacent artifact is `chex.deh`, a compatibility
patch fetched from its checksum-pinned `/idgames` release. The accompanying
`chexdeh.txt` permission notice is retained in the build and explicitly permits
unrestricted use. DSDA's support WAD is generated from its GPL source during
the build.

Launcher icons are the GPL-covered Crispy/Chocolate application icons already
tracked under `data/`; see `data/README` for their provenance. Doom II, TNT,
Plutonia, and Chex use the generic Doom-port icon because this repository has
no independently redistributable title art for them. The per-title backdrop
SVGs are original abstract artwork and contain no WAD-derived graphics.
The framework renders per-title installable PWA manifests and owns the service
worker and remembered Launch fullscreen control. Port icons are supplied at
192px and 512px; no artwork extracted from game files is used.

## Profiles

- **Original** — Crispy Doom configured for Chocolate-style 320×200,
  capped-framerate presentation.
- **Smooth** — Crispy Doom high-resolution, uncapped and interpolated, with a
  fixed 4:3 presentation.
- **Modernized** — actual DSDA-Doom 0.29.4 native source, built as an
  independent Emscripten target with widescreen full-window output, the
  native software scene renderer, accelerated SDL browser presentation when
  available, and a selectable cap up to 120 FPS.

All profiles use WASD, mouse fire, click-to-capture input, and horizontal-only
mouse turning by default. Original and Smooth preserve a contained 4:3 game
aspect; Modernized uses the available widescreen viewport without stretching.
Validated WADs are cached in private browser storage and restored before any
server request, while saves and configuration use a separate framework-owned
IDBFS mount restored before native `main`.

Modernized deliberately does not advertise DSDA's desktop OpenGL renderer.
That renderer is fixed-function desktop GL rather than a native GLES/WebGL
backend, and Emscripten's legacy translation currently produces a black
browser compositor. The reliable browser path renders the DSDA scene in
software and asks SDL for accelerated presentation, with a compatible fallback
when the browser cannot provide it. Dynamic native backbuffer telemetry,
delivered-FPS telemetry, and the selectable 60/90/120 FPS ceiling make this
boundary measurable without mislabeling the renderer.

## Build and run locally

Prerequisites: CMake, Git, Node.js, curl, unzip, and an Emscripten SDK.

```bash
EMSDK_DIR=/path/to/emsdk ./scripts/build-web.sh
mkdir -p /tmp/idtech1-wasm-data
WASM_GAME_SITE_ROOT="$PWD/web" \
WASM_GAME_SHELL_ROOT="$PWD/../wasm-game-framework/dist" \
WASM_GAME_DATA_ROOT=/tmp/idtech1-wasm-data \
WASM_GAME_HTTP_PORT=4177 \
node ../wasm-game-framework/server/static-server.js
```

Open `http://127.0.0.1:4177/`, select a title/profile, install its WAD into the
local data directory once, and press **Play**. The framework server supplies
the canonical document at `/`; a generic static server cannot provide the
validated `/game-data` contract. Build output under `web/dist/` is ignored by
Git.

DSDA-Doom is fetched at pinned commit
`ae7c280cd08047c399283bebcfaeeb3e9ecb8e6d`, patched with
`patches/dsda-wasm.patch`, and compiled from native source. No third-party
DSDA WebAssembly port is used.

## Docker

The same site can be published as one suite image or as a locked single-title
image. Images contain engine code, never game WADs.

```bash
# Build all suite and single-title images with :dev tags.
WASM_FRAMEWORK_DIR=../wasm-game-framework ./scripts/build-images.sh

# Optional repository namespace/tag.
DOCKER_NAMESPACE=yourname DOCKER_TAG=latest ./scripts/build-images.sh

# Unified suite with a persistent game-data volume.
docker volume create idtech1-wasm-data
docker run --rm -p 8088:8088 -v idtech1-wasm-data:/data idtech1-wasm:dev

# Doom II only; the game selector is hidden.
docker run --rm -p 8088:8088 -v idtech1-doom2-data:/data idtech1-doom2-wasm:dev
```

Expected filenames are `DOOM.WAD`, `DOOM2.WAD`, `TNT.WAD`, `PLUTONIA.WAD`,
`HERETIC.WAD`, `HEXEN.WAD`, and `CHEX.WAD`. The server never exposes `/data`
directly: it serves only the exact selected-title allowlist through same-origin
`/game-data` routes after setup is complete. Browser IndexedDB then restores
validated files before a later WAD request.

The suite manifest scopes readiness and setup by selected variant. Installing
Doom II therefore makes Doom II playable without requiring any of the other
six WADs. A single-title image locks the same policy to its deployed title.

There is deliberately no default `DOOM1.WAD`: this project has not documented
an affirmative modern redistribution grant for the historic shareware archive.

## Contributing

Read [RUNBOOK.md](RUNBOOK.md) before changing engine seams. Keep native builds
working where practical, keep required game data outside Git/build images, and do not
submit this downstream port or its patches upstream.
