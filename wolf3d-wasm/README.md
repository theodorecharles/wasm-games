# Wolf3D WASM

Wolf3D WASM builds the native Wolf4SDL source as two browser games with
Emscripten and the shared
[WASM Game Framework](https://github.com/theodorecharles/wasm-game-framework).
The framework supplies the launcher, validated container provisioning,
browser cache, installable PWA metadata, fullscreen preference, fixed 4:3
viewport, and input-capture lifecycle. This repository supplies the native
engine adaptation, declarative game policy, and source-distributed artwork.

## Status

| Title | Status |
| --- | --- |
| Wolfenstein 3D | Still in development |
| Spear of Destiny | Still in development |

Wolfenstein 3D and Spear of Destiny both reach their authentic menus and
playable first levels in Chromium. The `.WL6` and `.SOD` releases have separate
native modules, launcher identities, data policies, persistent save roots,
PWAs, and Docker images.

## Controls and presentation

- W/S move forward and backward.
- A/D strafe.
- Horizontal mouse movement turns; vertical mouse movement is intentionally
  ignored because Wolfenstein 3D has no vertical view axis.
- Clicking gameplay captures input. Menus and lost capture release it.
- The original palette-indexed renderer is presented in a contained 4:3
  viewport without stretching.

## Game data

No game data files are committed to Git or copied into the Docker images. On
first deployment, select the eight required `.WL6` or `.SOD` files through the
framework provisioner. The selected variant's filename, size, and SHA-256
policy is declared in `web/wasm-game-data.json`.

The server never exposes `/data` as a directory. Browsers download only the
validated allowlist and retain it in origin-private IndexedDB, so later
launches normally restore the game files without downloading them again.

## Build locally

Prerequisites include Make, ImageMagick, Node.js, and an initialized
Emscripten SDK.

```bash
git clone https://github.com/theodorecharles/wolf3d-wasm.git
git clone https://github.com/theodorecharles/wasm-game-framework.git ../wasm-game-framework
git -C ../wasm-game-framework checkout c4ad3b9e075f881d32f044299fbfeee703a9169d

cd wolf3d-wasm
EMSDK_DIR=/path/to/emsdk ./build-web.sh
WOLF3D_DATA_ROOT=/path/to/persistent-data ./serve-web.sh 8011
```

Open `http://127.0.0.1:8011/`. Pass `spear` as the second argument to
`serve-web.sh` to launch that variant. The framework server owns `/` and its setup
flow; this project deliberately ships no `index.html`, CSS, service worker, or
web manifest.

## Docker

```bash
WASM_FRAMEWORK_DIR=../wasm-game-framework \
  ./scripts/build-image.sh wolf3d-wasm:dev

WASM_FRAMEWORK_DIR=../wasm-game-framework \
  ./scripts/build-image.sh spear-wasm:dev spear

docker run --rm -p 8088:8088 \
  -v wolf3d-wasm-data:/data \
  wolf3d-wasm:dev
```

`scripts/build-images.sh` builds and verifies both locked images.

Keep the `/data` volume across container upgrades. The image contains engine
code and framework assets only.

## Contributing

Read [RUNBOOK.md](RUNBOOK.md) before changing native browser seams. Preserve
the game-data boundary and native builds where practical. Do not submit this
WebAssembly port or its patches to the upstream Wolf4SDL project.
