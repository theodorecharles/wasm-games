# GoldSource WASM suite

This project runs four GoldSource-family titles through the x8BitRain/webXash
base, Xash3D-FWGS WebAssembly packages, and the
canonical WASM Game Framework 0.9.4
(`c4ad3b9e075f881d32f044299fbfeee703a9169d`). It emits one unified suite and
four locked game images from a single adapter:

- Half-Life: single-player, with multiplayer when a WebRTC bridge is deployed;
- Half-Life: Blue Shift: single-player compatibility mode;
- Half-Life: Opposing Force: single-player and multiplayer where the portable
  HLSDK compatibility layer supports the expansion content;
- Counter-Strike 1.6: multiplayer only.

## Status

| Title | Status |
| --- | --- |
| Half-Life | Still in development |
| Half-Life: Blue Shift | Still in development |
| Half-Life: Opposing Force | Still in development |
| Counter-Strike 1.6 | Still in development |

The downstream contains no HTML, CSS, web manifest, or service worker. It
provides only `wasm-game.json`, `wasm-game-data.json`, one built adapter,
source-built engine artifacts, original placeholder launcher art, and
declarative PWA metadata. The framework owns the launcher, provisioning,
private IndexedDB cache, loading/runtime surfaces, input capture, canvas,
fullscreen preference, PWA document, and service worker.

## Game data

No Valve game data or demo ZIP is present in Git or any image. Build
deterministic PK3s and PWA icons from a Steam installation:

```bash
python3 -m venv .venv-owner
. .venv-owner/bin/activate
pip install -r requirements-owner.txt
python scripts/package-owner-data.py \
  "$HOME/.steam/debian-installation/steamapps/common/Half-Life" \
  /tmp/goldsource-owner-data
```

The committed exact policy describes the inspected Steam install used on
2026-08-14. The output must match these names, sizes, signatures, and SHA-256
digests. Different releases should be reviewed and added as explicit
allowlisted revisions; do not weaken the policy to arbitrary folders or ZIPs.

The packager omits native DLLs/shared objects, saves, downloads, screenshots,
logs, demos, and user configuration. It makes one read-only PK3 plus the
matching `liblist.gam` game-directory descriptor for each of `valve`, `bshift`,
`gearbox`, and `cstrike`. Xash needs the real descriptor before it can register
the private archive inside that directory. The packager also extracts each
installed title icon and creates exact 192px/512px PNGs for the framework-owned,
variant-aware PWA manifest. Those extracted icons stay in the administrator's
`/data` volume and are served only through exact allowlisted `/game-data`
routes after the selected variant is fully provisioned.

Choose all required files for the selected title in the first-run framework
provisioner. The suite does not require all four titles: Half-Life needs Valve;
Blue Shift needs Valve + Blue Shift; Opposing Force needs Valve + Gearbox; and
Counter-Strike needs Valve + Counter-Strike. Shared Valve data uses one
namespace/version/cache key, so the browser's origin-private IndexedDB copy can
be reused between variants. `/data` itself is never an HTTP route.

## Build and test

```bash
npm ci
npm run build
npm test
./scripts/test-static.sh
```

The adapter bundles the checksum-pinned npm packages and the focused native
Xash framework patch into immutable `.wasm` and support `.pk3` artifacts. The
native core reports menu, loading, gameplay, paused, and debrief state directly;
its capture-intent export covers JOIN, New Game, Load, and Resume transitions.
It also distinguishes a pending local player name from the name received back
in the active server scoreboard. Xash3D uses a WebGL 2 backbuffer synchronized
to the framework's dynamic, aspect-correct viewport. The adapter passes that
backbuffer size into native startup and forwards later resize requests through
`vid_setmode`, so the GL viewport and native menu use the same dimensions.
Native SDL input supplies WASD and mouse look; the framework owns click capture,
Escape/lost-capture handling, desktop/mobile warning, audio resume, and
remembered fullscreen. Framework persistence is attached before native main
and bound to Xash's `/rwdir`, keeping saves and configuration isolated by
variant. The adapter forwards the framework's current backbuffer coordinates
to a focused native menu-pointer export; this keeps browser and in-game cursors
aligned through dynamic resizes without changing gameplay-relative mouse input.

Chrome acceptance loaded the installed Half-Life data, registered `valve`
through the mounted descriptor, rendered the native menu and a live New Game at
an exact 1085x806 dynamic backbuffer, and confirmed launcher name `Paloooz`
through the active server scoreboard. A native `BLACK MESA INBOUND` save slot
and an inverted-mouse preference both survived full page reloads through the
framework persistence mount; the adapter also reapplied WASD bindings and
native mouse look. The delayed menu-to-gameplay capture request is covered by
the adapter contract, but actual pointer-lock acquisition could not be observed
while the browser-control overlay was attached. Controller discovery is
currently disabled; keyboard and mouse are the supported input path.

To run the canonical server locally, place matching packager outputs under the
manifest paths in a temporary data directory:

```bash
mkdir -p /tmp/goldsource-data/goldsource/icons
cp /tmp/goldsource-owner-data/*-owner.pk3 /tmp/goldsource-data/goldsource/
cp /tmp/goldsource-owner-data/*-liblist.gam /tmp/goldsource-data/goldsource/
cp /tmp/goldsource-owner-data/*-icon-*.png /tmp/goldsource-data/goldsource/icons/
WASM_GAME_SITE_ROOT="$PWD/web" \
WASM_GAME_SHELL_ROOT="$PWD/../wasm-game-framework/dist" \
WASM_GAME_DATA_ROOT=/tmp/goldsource-data \
WASM_GAME_HTTP_PORT=4183 \
node ../wasm-game-framework/server/static-server.js
```

## Multiplayer deployment

Browser GoldSource networking is a WebRTC data-channel bridge, not direct UDP.
The default signaling URL is same-origin `ws(s)://<site>/websocket`. Put the
Xash3D-compatible signaling/UDP bridge behind the same public origin and proxy
that path to it. The static game container intentionally does not pretend to
be a UDP/WebSocket proxy.

For an explicitly configured deployment, append `?server=host:port` (or a full
`ws://`/`wss://` URL whose path is `/websocket`). There is deliberately no
free-form server field in the launcher: an address is useful only when a
corresponding WebRTC proxy target policy exists. Blue Shift never enables the
transport. Half-Life and Opposing Force enable it only when `?server=` is
present; Counter-Strike always uses the same-origin default or override.

## Images

```bash
WASM_FRAMEWORK_DIR=../wasm-game-framework ./scripts/build-images.sh
```

This builds `goldsource-wasm:dev`, `half-life-wasm:dev`,
`blue-shift-wasm:dev`, `opposing-force-wasm:dev`, and
`counter-strike-wasm:dev`. Every image inherits the exact framework base and
contains no game data. Mount a persistent volume at `/data` when running one.

Expansion support has an honest upstream-runtime boundary: the available
portable package supplies the Half-Life client/server game library and the
legacy webXash integration aliases it for Blue Shift and Opposing Force. The
expansion archives and menu load paths are present, but campaign-specific game
DLL behavior must be confirmed in the serialized Chromium smoke test. No
upstream project is contacted or modified by this repository.
