# id Tech 2 WASM

Canonical browser family project for Quake and Quake II. One repository builds
the suite and both locked-title container images from native source; it does not
use QuakeJS, qwasm, or another third-party WebAssembly port.

| Title | Status | Browser renderer |
| --- | --- | --- |
| Quake | Still in development | Native WinQuake software renderer: original 640×480 / 4:3 or dynamic high resolution |
| Quake II | Still in development | Native WebGL 2 / OpenGL ES 3 renderer, dynamic aspect |

## Provenance

The repository retains both authoritative downstream histories in one merge:

- Quake: official id Software WinQuake GPL source plus the browser port at
  `bb0514ddbdb2b53182afac59fe2f2136bf2afa70`.
- Quake II: Yamagi Quake II GPL native source plus the browser port at
  `a325b27ce47c30781f82e9ab8aaa6c1d2fdd73b0`, grafted under
  `engines/quake2/`.
- The history-graft commit is
  `a382f8d1f549c87fb3fa56da496752b890f646b5` and has those two commits as
  parents.

The prior `quake1-wasm` and `quake2-wasm` repositories remain unchanged. This
family repository is published independently; its engine changes are not
submitted to the native upstream projects.

## Runtime contract

The site is declarative. `web/wasm-game.json` defines variants `quake` and
`quake2`, PWA identities, remembered Launch-fullscreen policy, input capture,
and truthful display/quality controls. `web/game-adapter.js` selects a thin
native adapter for the chosen engine. The framework owns the HTML, CSS,
launcher, service worker, web manifest, IndexedDB cache, provisioning UI,
fullscreen, and canvas lifecycle.

This project is pinned to immutable `wasm-game-framework` v0.9.4 at commit
`c4ad3b9e075f881d32f044299fbfeee703a9169d`. Builds refuse any other framework
version or checkout.

Quake's Original profile keeps the native 640×480, 8-bit, 4:3 presentation and
72 FPS timing ceiling. Its Modernized profile uses the same official software
renderer with a real aspect-correct framebuffer that follows the viewport up
to the renderer's 1280×1024 bounds, and runs at the browser display cadence.
It does not label the software path as OpenGL or claim texture filtering it
does not implement. Quake II exposes medium/high/ultra native profiles,
30/60/120 FPS targets, dynamic quality, and native-managed aspect-correct
resizing through its GLES 3 renderer.

Both ports report authoritative menu/loading/gameplay state to the framework.
Quake dispatches native Enter/Escape menu transitions during the trusted key
event, resumes its engine-owned SDL AudioContext on user interaction, installs
WASD plus fast mouse look only on the first browser-config migration, and then
retains later keybinding and sensitivity changes. Controller support is
currently disabled. Config and save files restore from each
variant-specific IDBFS mount before native main.

## Game data

No game PAK is tracked, copied into a build, or baked into an image.
Provision the required files into a persistent `/data` volume:

| Variant | Container path | Exact size | SHA-256 |
| --- | --- | ---: | --- |
| Quake | `id1/pak0.pak` | 18,689,235 | `35a9c55e5e5a284a159ad2a62e0e8def23d829561fe2f54eb402dbc0a9a946af` |
| Quake | `id1/pak1.pak` | 34,257,856 | `94e355836ec42bc464e4cbe794cfb7b5163c6efa1bcc575622bb36475bf1cf30` |
| Quake II | `pak0.pak` | 183,997,730 | `1ce99eb11e7e251ccdf690858effba79836dbe5e32a4083ad00a13ecda491679` |
| Quake II | `pak1.pak` | 12,992,754 | `678210ecd1b27dde1c645660333a1a7b139d849425793859657f804d379b62ad` |
| Quake II | `pak2.pak` | 45,055 | `cb88d584ef939d08e24433a6cf86274737303fac2bbd94415927a75e6b269dd8` |

Every file must start with `PACK`. The framework validates the exact variant
policy, serves game data only through the private `/game-data` gate, and
caches a validated copy in origin-private IndexedDB. `/data` and `/local-data`
are never HTTP routes. The native mounts are read-only bounded MEMFS paths;
Both engines keep settings and saves in distinct browser-private IDBFS mounts.

## Build and verify

Prerequisites: CMake, Ninja, an initialized Emscripten SDK, Node.js,
ImageMagick, Docker, curl, and standard Unix inspection tools. Point at an
isolated checkout of the exact framework release:

```bash
EMSDK_DIR=/path/to/emsdk \
WASM_FRAMEWORK_DIR=/path/to/wasm-game-framework-v0.9.4 \
./scripts/test-web.sh

WASM_FRAMEWORK_DIR=/path/to/wasm-game-framework-v0.9.4 \
./scripts/test-static.sh

EMSDK_DIR=/path/to/emsdk \
WASM_FRAMEWORK_DIR=/path/to/wasm-game-framework-v0.9.4 \
./scripts/build-images.sh
```

The final command builds and verifies:

- `idtech2-wasm:dev` — suite selector
- `quake1-wasm:dev` — locked Quake deployment
- `quake2-wasm:dev` — locked Quake II deployment

Generated JavaScript, WebAssembly, PWA icon sizes, and framework files live
under ignored `web/dist/`. Each container uses the framework static server and
a persistent `/data` volume. See `RUNBOOK.md` for image smoke commands and
`MIGRATION.md` for the transition from the two predecessor repositories.
