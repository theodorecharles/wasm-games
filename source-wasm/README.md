# Source Wasm

Source Wasm is a Source 1 browser project on wasm-game-framework **0.9.6**.
Current status: **Still in development**.

This repository does **not** ship Valve game files and does **not** ship the
leaked Source engine tree. It ships:

- the 0.9.6 browser shell (vendored framework)
- an adapter and owner-data policy
- **patches** applied to *your* copy of the engine
- scripts that combine **your** 2014 GOTY ISO with **your** Steam
  `steam_legacy` shaders

Whoever runs the Docker image (or a local prepare) must provide all three
inputs. The container then patches, compiles, and builds the owner-data tree.

## What you must provide

| Input | What it is | Why |
| --- | --- | --- |
| **Leaked Source tree** | A 2017-era nillerusr/ToGL (TOGLES) Source tree you already have | We only apply patches. We do not clone, vendor, or redistribute that tree. |
| **Steam `steam_legacy`** | Half-Life 2 (app 220) on the **Pre-20th Anniversary** beta | Shader bytecode **version 6**. The 2014 disc shaders are version **1** and this engine rejects them. |
| **2014 GOTY / Collectors ISO** | The 2014 SteamPipe disc (maps, materials, fonts, sounds as loose files) | The working art/map set for this engine era. Do not use the 20th-anniversary Steam depot as the world. |

Steam path: **Library → Half-Life 2 → Properties → Betas → `steam_legacy`**.

Proven match from the native Linux port: build **12694556**.

### How the assets are combined

1. Extract the 2014 ISO (`HalfLife2.cab`) to a private loose tree.
2. Pull `shaders/**` (and `flashlight_border.vtf`) out of the `steam_legacy` VPKs.
3. Overlay those shaders onto the 2014 tree.
4. Delete `hl2/glshaders.cfg` and native plugins (`*.dll`, `*.exe`, `*.so`,
   `*.dylib`, and `*.asi`). Steam’s leftover GL cache crashes the loader;
   Windows plugins (`trackerui.dll`, `serverbrowser.dll`, `hl2/bin/*.dll`)
   are not used.

Do **not** mix in 20th-anniversary maps, GorDIN-only schemes, or DVD v1
`.vcs` files as the live shaders. Do **not** cherry-pick anniversary textures
onto 2014 maps.

| Combination | Result |
| --- | --- |
| Steam current (20th anniversary) alone | Wrong shaders, GorDIN fonts, heavier maps. Cyan / crash. |
| 2014 ISO shaders alone | `.vcs` version 1 vs engine 6. Abort. |
| 2014 ISO **plus** `steam_legacy` shaders | The intended owner-data set. |
| Full `steam_legacy` depot (native Linux) | Also matches this engine if you are not using the ISO. |

## Portal variant

The roster also advertises `?game=portal`. Portal needs only one owner input:
a Steam **Portal** (app 400) install, which carries `portal/` on top of the
shared `hl2/` base. No ISO and no `steam_legacy` branch are involved; the
current Portal depot matches this engine era.

```bash
docker run --rm -p 8088:8088 \
  -e SOURCE_WASM_GAMES=portal \
  -v /path/to/your/source-engine:/inputs/source:rw \
  -v "/home/YOU/.steam/debian-installation/steamapps/common/Portal:/inputs/steam-portal:ro" \
  -v /path/to/private-source-wasm-data:/data \
  source-wasm:dev
# serves http://127.0.0.1:8088/?game=portal
```

Locally, point the owner root at the Portal install before generating the
browser stub:

```bash
export HL2_OWNER_ROOT="/home/YOU/.steam/debian-installation/steamapps/common/Portal"
node scripts/generate-game-data.mjs
```

Serving `hl2` and `portal` from a single owner root in one container run is
not wired yet; pick the root for the game you are proving.

## Docker

Build the public image (patches + shell only):

```bash
WASM_GAME_FRAMEWORK_ROOT=/path/to/wasm-game-framework npm run build:image
# or
docker build -t source-wasm:dev .
```

Run it with your three inputs. Nothing proprietary is in the image layers.

```bash
docker run --rm -p 8088:8088 \
  -v /path/to/your/source-engine:/inputs/source:rw \
  -v "/home/YOU/.steam/debian-installation/steamapps/common/Half-Life 2:/inputs/steam:ro" \
  -v "/path/to/Half-Life 2 GOTY 2014.iso:/inputs/iso/hl2.iso:ro" \
  -v /path/to/private-source-wasm-data:/data \
  source-wasm:dev
```

On first start the entrypoint:

1. applies `patches/` to `/inputs/source`
2. extracts the ISO
3. overlays `steam_legacy` shaders onto the 2014 files in `/data`
4. compiles the patched tree with Emscripten into `/opt/game-site`
5. serves http://127.0.0.1:8088/?game=hl2

If any input is missing, the container **does not** pretend the game works. It
prints what is still required. A missing compile or a failed native start is
not a playable game.

## Local prepare (no Docker)

```bash
export SOURCE_ENGINE_ROOT=/path/to/your/source-engine
export HL2_STEAM_ROOT="/home/YOU/.steam/debian-installation/steamapps/common/Half-Life 2"
export HL2_GOTY_ISO="/path/to/Half-Life 2 GOTY 2014.iso"
export HL2_GOTY_ROOT="$HOME/.local/share/source-wasm/hl2-dvd"
export HL2_COMBINED_ROOT="$HOME/.local/share/source-wasm/hl2-combined"

./scripts/extract-goty-iso.sh
node scripts/apply-source-patches.mjs "$SOURCE_ENGINE_ROOT"
node scripts/combine-owner-data.mjs
node scripts/generate-game-data.mjs
npm test
npm start
```

Native Linux (already proven on a patched ToGL tree, X11 only):

```bash
SDL_VIDEODRIVER=x11 ./hl2_launcher -game hl2 -windowed -w 1280 -h 720 -novid
```

## What this repo is allowed to contain

- Declarative manifests, the adapter, patches, and redistributable title art
- wasm-game-framework **0.9.6** (`v0.9.6`)

Not allowed:

- The leaked engine tree
- Retail VPKs, maps, materials, `.vcs`, ISOs
- Downstream `index.html`, CSS, service worker, or web manifest
- Calling a failed start a playable game

Product labels are exactly **Live** or **Still in development**.

Read `RUNBOOK.md` before changing patches or the data combine.

No changes are submitted upstream.
