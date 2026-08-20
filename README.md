# wasm-games

Browser ports of classic games, each compiled to WebAssembly and served as a
self-contained static site. One repository holds every engine's **port layer** —
adapters, build scripts, patches, JSON manifests, Dockerfiles and unraid
templates — organized per engine and per game.

> **This repo is source-only.** It contains *our* code: the WASM port glue,
> build orchestration, patches, manifests and packaging. It does **not** contain
> the original game/engine source code, compiled `.wasm` binaries, build
> artifacts, or copyrighted game data (`.pk3`/`.wad`/`.pak`). Original sources
> live in **forks** (see below) and are cloned at Docker build time; game data is
> supplied by you at runtime via a volume mount.

## The framework

Everything here builds on **[wasm-game-framework](https://github.com/theodorecharles/wasm-game-framework)** — the shared runtime/launcher (shell UI, input capture, persistence, PWA, Docker base image) that every game sits on. It's linked into this repo as a git submodule at [`wasm-game-framework/`](wasm-game-framework/) and the build scripts expect it (or `WASM_FRAMEWORK_DIR` pointing at a checkout).

```
wasm-games            ← this repo: per-engine, per-game port layers + packaging
wasm-game-framework   ← shared runtime all games build on (separate repo/submodule)
<engine forks>        ← original game/engine sources, cloned at build time
```

## Repository layout

```
<engine>-wasm/                  one folder per engine/runtime
  package.json, src/, scripts/, patches/, native/, web/   (the shared engine build)
  sources.json                  upstream → fork mapping for this engine
  games/
    <game>/                     one folder per game
      game.json                 manifest: variant, gamedir, ports, theme, data files (sha256)
      Dockerfile                per-game image (framework base + staged web bundle)
      unraid.xml                unraid Community Applications template
      assets/                   icon.svg, background.svg
      patches/                  per-game patches (when present)
wasm-game-framework/            (submodule → the framework repo)
wasm-game-lab/                  the portal that aggregates all games (compose, games.json)
```

**Reference implementation:** [`goldsource-wasm/`](goldsource-wasm/) — fully wired
to this layout with four games (Half-Life, Blue Shift, Opposing Force,
Counter-Strike). The other engines are imported as their port layer and are being
migrated to the same `games/<game>/` + fork model over time.

## Conventions

- **Original source = forks, not commits.** Each engine records its upstreams in
  `sources.json` (`upstream` → `fork` under `github.com/theodorecharles`). Docker
  builds clone the fork and apply the engine's `patches/`. Never vendored in.
- **Game data is a runtime volume.** Containers read the engine data dir at
  `/data`. Each `game.json` lists the exact files (with sha256) it needs; you
  supply your own legally-owned files. Nothing copyrighted is committed.
- **One Docker image per game**, published to GHCR as
  `ghcr.io/theodorecharles/<game>-wasm`, serving on container port `8088`.
- **One unraid template per game** (`unraid.xml`), wiring the GHCR image, the web
  port, and the `/data` volume.

## Game status

### GoldSource (`goldsource-wasm/`) — the active project

| Game | Status | Notes |
|---|---|---|
| **Half-Life** | ✅ Working | Single-player boots to menu & in-game. Quit/multiplayer/previews removed (tab-close is the only quit). |
| **Counter-Strike** | 🟡 Working w/ caveats | In-engine **Join Game** button → self-hosted **de_dust2** listen server over a WebRTC bridge. Mic-permission prompt fixed. Uses the **software renderer** to dodge a WebGL2 black-menu bug. **Open:** menu looks "too big" (text-only Join button styling); WebGL2 menu root-cause; bots disabled (YaPB↔ReGameDLL `null function` crash). |
| **Blue Shift** | 🔴 Broken | Boots to menu, but shows a stray **"THE END"** item and **Quit is still present** (the `xash-no-quit` patch didn't take on its menu build), and New Game doesn't start. Needs the menu patch rebuilt/applied + a New Game/chapter-load fix. |
| **Opposing Force** | 🟡 Needs verification | Engine rebuilt alongside the others; not re-verified end-to-end recently. |

**Running services (local dev):** the GoldSource suite on `:8017`, the CS WebRTC
bridge on `:4190`, and a headless CS listen-server host. Play via
`http://127.0.0.1:8017` (or `?game=counter-strike` on the bridge origin `:4190`).

### Other engines — imported as port layer, migration in progress

`source-wasm`, `idtech1–4-wasm`, `build-wasm`, `dosbox-wasm`, `emulation-wasm`,
`openrct2-wasm`, `openut-wasm`, `wolf3d-wasm`, `jill-wasm`, `lithtech-wasm`,
`midtown-wasm`, `cod2-wasm` — these are imported as their **port layer only**
(build scripts, patches, manifests, web). Each still needs: fork its upstream,
extract our changes into `patches/`, point its Dockerfile at the fork, and add a
`games/<game>/` layout + `unraid.xml`. See *Roadmap*.

## Building & running

```bash
# clone with the framework submodule
git clone --recurse-submodules git@github.com:theodorecharles/wasm-games.git
cd wasm-games/goldsource-wasm

# build the shared web bundle + one Docker image per game
./scripts/build-images.sh          # DOCKER_REGISTRY / DOCKER_TAG overridable

# push to GHCR (after `docker login ghcr.io`)
docker push ghcr.io/theodorecharles/half-life-wasm:latest
```

Game data is provisioned at runtime (mounted at `/data`); see each
`games/<game>/game.json` for the required files and checksums.

## Roadmap / open items (for the next pass)

1. **Fix Blue Shift** — apply the no-quit/menu patch to its menu build; fix New Game start; remove the stray "THE END" item.
2. **CS polish** — fix the oversized main menu; root-cause the WebGL2 black menu (drop the soft-renderer workaround); re-enable bots (fix YaPB↔ReGameDLL).
3. **Verify Opposing Force** end-to-end.
4. **Migrate remaining engines** to the `games/<game>/` + fork model: fork each upstream, extract our changes into `patches/`, point the Dockerfile at the fork, add `game.json` + `unraid.xml`.
5. **Strip temp diagnostics** from `goldsource-wasm/src/framework-adapter.js` (`__csXash`, net-call counters).
6. **Push images to GHCR** and validate the unraid templates on a live server.
