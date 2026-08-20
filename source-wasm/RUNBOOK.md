# Source Wasm — implementation runbook

**Current reviewed browser-debug handoff:** [`RUNBOOK-FREEZE.md`](RUNBOOK-FREEZE.md).

This is the working contract for **Source Wasm** on WASM Game Framework
**@wasm-game-framework/browser@0.9.6**, plus the Linux compile and data
combination that actually runs Half-Life 2 on this machine.

Read the canonical framework docs before editing the adapter. Do not invent a
second website.

## Canonical docs

1. https://theodorecharles.github.io/wasm-game-framework/llms.txt
2. https://theodorecharles.github.io/wasm-game-framework/build-a-game.html
3. `vendor/wasm-game-framework/ADAPTER_RUNBOOK.md`
4. https://theodorecharles.github.io/wasm-game-framework/adapter.html
5. https://theodorecharles.github.io/wasm-game-framework/game-data.html

## Declared policy (`web/wasm-game.json`)

| Field | Value |
| --- | --- |
| id | `source-wasm` |
| title | Source Wasm |
| status copy | **Still in development** |
| displayMode | `16:9` |
| menuCursor | `browser` |
| nativeManaged | `false` (SDL / the engine owns the window) |
| syncBackbuffer | `true` |
| pointer | 1280×720, `contain`, lock on |
| fullscreen | `true` |
| controller.mode | `disabled` |
| persistence | `/save/{variant}` |
| media library | no |
| dedicated server stub | no |
| framework pin | `@wasm-game-framework/browser@0.9.6` |

Do not author downstream `index.html`, CSS, a service worker, or a web manifest.

## The engine

This repo does **not** vendor the leaked tree. The person running Docker (or
`scripts/prepare.sh`) mounts their own 2017 ToGL/TOGLES tree at
`SOURCE_ENGINE_ROOT` / `/inputs/source`. `scripts/apply-source-patches.mjs`
applies `patches/` onto that tree, then `scripts/build-web.sh` compiles it.

Do not contact or submit changes upstream. Do not add the engine tree to Git.

### What the Desktop compile had to fix

The dump had no `.git`, so `ivp`, `thirdparty`, and `lib` were empty. Those
were cloned. Missing game/engine files (HL2 client/server, lzma, ToGL headers,
minimp3, Sixense, other headers) were filled from nillerusr/source-engine.

Other host issues that already bit once:

- `/tmp` is a 32G tmpfs. Do not clone or extract large trees there.
- Waf wants `python`; this machine has `python3`.
- `libsdl2-dev` is not installed. Desktop headers lived under `.deps/` (not
  vendored here).
- SDL2 needed an unversioned `.so` symlink.
- `sound.h` had to be on the include path.
- Deleting Waf’s lock mid-build requires a reconfigure.

**Proven native build:** debug Linux x86_64, `--disable-warns`, 2202/2202
tasks. Install next to the game data; **do not** install Steam’s `hl2/bin`.

Wayland dies immediately. Use X11:

```bash
cd /home/ted/Desktop/source-engine-master
SDL_VIDEODRIVER=x11 ./hl2_launcher -game hl2 -windowed -w 1280 -h 720 -novid
```

That combination is the one that “works like perfectly.”

### Browser compile

`scripts/build-web.sh` configures the same tree with `--emscripten --togles`
and installs `web/source-engine.js` + `web/source-engine.wasm`. The factory
must be `createSourceEngineModule` with `noInitialRun`. Generated JS/WASM stay
out of Git.

A recognisable in-browser GameUI has **not** been proven. Status stays
**Still in development** until `readEngineState()` reports `menu` or
`gameplay` from native truth.

## The only working game-data combination

Owner data is built at run time from **two user-provided** sets:

1. **2014 GOTY / Collectors ISO** — maps, materials, fonts, sounds (loose).
2. **Steam `steam_legacy`** — shader `.vcs` version 6 (and the required
   `flashlight_border` shader adjunct).

`scripts/combine-owner-data.mjs` stages a fresh destination, copies (1), then
overlays only shader paths from (2), including `flashlight_border`, and strips
native libraries plus `glshaders.cfg`. It requires
`vertexlit_and_unlit_generic_vs20.vcs` version 6 before publishing. An existing
private destination is renamed to a timestamped `.previous-*` tree so stale
files cannot survive a rebuild and a failed rebuild remains recoverable.

Steam → Half-Life 2 → Properties → Betas → **`steam_legacy`**
(Pre-20th Anniversary). Proven install: app **220**, build **12694556**.

| Data | What happens |
| --- | --- |
| Steam **current** (20th anniversary) | Too-new shaders, GorDIN fonts, maps ~3× heavier. Garbled text, cyan error materials, window dies after a chapter load. |
| Collector’s Edition DVD | 2014 SteamPipe cabs, **not** a 2004 GoldSrc dump. Maps/materials/fonts are the right era. `.vcs` shaders are **version 1**. Engine wants **6** → abort on `vertexlit_and_unlit_generic_vs20`. |
| Steam **`steam_legacy`** | Shaders, maps, textures, fonts match. This is the working set. |

**Do not mix eras.** Failed experiments:

1. Anniversary VPKs + 2014 maps → cyan (2024 shaders on 2014 geometry).
2. DVD shaders on this engine → version 1 vs 6 abort.

If data is wrong, rebuild the private combined root from a clean 2014 extract
and the declared `steam_legacy` shader overlay. Do not leave stale files in the
destination or cherry-pick anniversary art.

### Files this engine must not load

Never mount or copy these into owner data:

- `hl2/glshaders.cfg` — leftover Steam GL cache; crashes the loader
- `*.dll` — Windows plugins. Proven noise:
  - `../bin/trackerui.dll` (Friends)
  - `../bin/serverbrowser.dll`
- Steam / DVD `hl2/bin` (`client.dll`, `engine.dll`, Miles, …)
- native `*.so`, `*.dylib`, and `*.asi` plugins
- Anniversary `hl2_complete` GorDIN-only schemes as the primary scheme

Linux is case-sensitive: `HALFLIFE2.ttf` must exist with that name. Tahoma /
Verdana should resolve to DejaVu, not a broken Noto substitute.

ToGL video settings that survived: windowed **1280×720**, no MSAA, no HDR, no
vsync.

### Owner-data policy

`scripts/generate-game-data.mjs` writes a **tiny** `web/wasm-game-data.json`
(gameinfo + steam.inf only) so Play is not blocked on a 20MB parse. The local
debugger indexes the full private tree in `scripts/start.js` as `/owner-index`
and serves `/owner/<path>` with range support. The bridge now validates the
pinned recipe, rejects native files and symlinks, applies realpath containment,
and shares the framework password/session gate when enabled. It remains a
downstream debug seam until the production Docker route and headed browser
acceptance are proven.

Local default root:

`/home/ted/.steam/debian-installation/steamapps/common/Half-Life 2`

Override with `HL2_OWNER_ROOT` or `WASM_GAME_DATA_ROOT`. Docker builds the
private `/data/owner` publication from the supplied ISO and `steam_legacy`
mounts; bind `/data` to a private writable host volume for that run. Never
bake VPKs or other retail data into the image. The extracted 2014 tree keeps
some material directories capitalized (`Console`, `Debug`, `Dev`, `Engine`)
while Source requests lower-case paths on Linux. The adapter therefore mounts
the original indexed path and a lower-case alias only when no exact lower-case
entry exists; it never duplicates owner bytes or broadens the data recipe.

## Adapter rules

Work in this order. A canvas screenshot is not done.

1. Native source is the user-provided tree (`SOURCE_ENGINE_ROOT`). Apply
   `patches/` first. Do not copy another project’s generated JS/WASM.
2. Compile the `noInitialRun` factory. Replace `createNativeModule()` only
   with that factory.
3. Attach persistence **before** `callMain`.
4. For the current local debugger, mount owner files from `/owner-index` +
   `/owner/<path>` rather than rebuilding a 20MB browser catalog or performing
   per-open HTTP stats. Large files are range-lazy. Do not call this production
   acceptance until the downstream bridge is server-validated, authenticated,
   and traversal-safe as required by `RUNBOOK-FREEZE.md`.
   Sync XHR from the document must use
   `overrideMimeType('text/plain; charset=x-user-defined')`.
   `responseType=arraybuffer` on a sync XHR throws. Worker + `Atomics.wait`
   on the main thread hangs Firefox. Preserve the case-fold alias behavior for
   both eager and range-lazy files.
5. `readEngineState()` is native truth only. Valid states: `launcher`,
   `loading`, `menu`, `gameplay`, `paused`, `debrief`, `crashed`. Gameplay
   only after a real controllable snapshot.
6. The framework is the only caller of `requestPointerLock()`.
7. Sanitize the player name. Re-apply it after native configs load.
8. Controller polling stays off until `controller.mode` changes.

## Forbidden

- Downstream `index.html`, `*.css`, service worker, `*.webmanifest`
- Committing or imaging retail Valve VPKs, maps, materials, or `.vcs`
- Inferring `gameplay` from a timeout, canvas visibility, or the last click
- Calling `requestPointerLock()` / `exitPointerLock()` from the adapter
- Mixing anniversary, DVD, and `steam_legacy` content
- Mounting `glshaders.cfg` or Windows `.dll` plugins
- Marking unreached behavior as passed
- Contacting upstream

## Commands

```bash
npm test
node scripts/generate-game-data.mjs
npm start
# http://127.0.0.1:8088/?game=hl2

# native (Desktop tree, already proven)
cd /home/ted/Desktop/source-engine-master
SDL_VIDEODRIVER=x11 ./hl2_launcher -game hl2 -windowed -w 1280 -h 720 -novid

# browser factory (not yet a finished game)
./scripts/build-web.sh

WASM_GAME_FRAMEWORK_ROOT=/path/to/wasm-game-framework npm run build:image
```

## Acceptance

Follow section 11 of the adapter runbook. Compiling, linking, or reaching a
menu is not a finished adapter. A failed native start is not a playable game.
