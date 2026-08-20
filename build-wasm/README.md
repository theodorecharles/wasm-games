# Build Engine WASM family

Native-source WebAssembly builds for Blood and Duke Nukem 3D from one
NBlood/EDuke32 codebase. The repository produces one family launcher and two
locked-title images without embedding game data.

| Title | Status |
| --- | --- |
| Blood | Still in development |
| Duke Nukem 3D | Still in development |

## Browser contract

The downstream emits only declarative configuration, a family adapter, native
artifacts, and tracked source icons. wasm-game-framework 0.9.4 at immutable
commit `c4ad3b9e075f881d32f044299fbfeee703a9169d` owns HTML, CSS, the service
worker, PWA manifests, fullscreen,
input capture, launcher/loading/runtime state, `/data` provisioning, and
origin-private IndexedDB caching. It also owns the durable browser lifecycle
for saves, configuration, and keybindings. Controller support is currently
disabled for both variants.

Both shipped variants use one honest classic configuration: SDL2/Web Audio, the 8-bit
software renderer, a fixed 800×600 4:3 backbuffer, WASD defaults, horizontal
mouse turning, and classic mouse-Y forward/back movement. Blood saves/configuration use
`/home/web_user/.config/nblood`; Duke uses
`/home/web_user/.config/eduke32`. Both mount through framework IDBFS before
native startup and flush on lifecycle transitions. Polymost/WebGL is not
advertised because renderer selection, dynamic resizing, and runtime behavior
have not yet received browser verification.

See [WEB_BUILD.md](WEB_BUILD.md) for build commands and data requirements,
[RUNBOOK.md](RUNBOOK.md) for operational checks, and [MIGRATION.md](MIGRATION.md)
for the relationship to the preserved `blood-wasm` repository.

## Images

- `build-wasm`: Blood + Duke Nukem 3D suite selector.
- `blood-wasm`: locked Blood launcher.
- `duke3d-wasm`: locked Duke Nukem 3D launcher.

Each image requires a persistent `/data` mount. Required game files stay
outside Git, image layers, and the public document root.
Set `WASM_GAME_PASSWORD` to enable the framework's optional launch password.

## Native-source provenance

This history descends from the NBlood project, which uses EDuke32 engine
technology and includes the native `source/blood` and `source/duke3d` targets.
The browser work does not reuse a third-party WebAssembly port. Native
authorship is retained in [AUTHORS.md](AUTHORS.md)
and the repository history.

The broader source tree also contains other Build-engine games and tools; they
are not browser variants in this family release.
