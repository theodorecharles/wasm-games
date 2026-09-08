# Standalone HL2 runtime image

`Dockerfile.runtime` serves already built browser modules with the framework on port 8088. It uses the pinned official Node 22 Alpine image and runs as UID/GID 1000. Engine source, SDKs and owned game data are excluded from the image.

Build from a **private staging directory**, not the repository root. The context contains the Dockerfile and these allowlisted paths:

- `runtime/scripts/{start.js,owner-file.js}` from this repository.
- `runtime/framework/package.json` and `dist/{index.html,wasm-game-bootstrap.js,wasm-game-framework.css,wasm-game-framework.js}` from the current framework.
- `runtime/framework/server/{static-server.js,provisioning.js,media-library.js,password-auth.js,public-path.js,pwa.js,lifecycle.js}` from the current framework.
- `runtime/site/`: frozen `source-engine.js`, `source-engine.wasm`, 25 matching `.so` modules, `game-adapter.js`, `wasm-game.json`, `wasm-game-data.json`, `data-validator.mjs` and `icon.svg`.

Generate the private `wasm-game.json` with `scripts/generate-runtime-manifest.mjs REVIEWED_MANIFEST PRIVATE_OUTPUT`. This selects only HL2, retains the reviewed canvas and persistence settings, marks it as a playable preview and disables unsupported settings. It leaves the generic repository manifest unchanged.

Keep the candidate receipt, file hashes and image inspection alongside the private context. Include no engine source, owner files, build logs or diagnostic receipts in `runtime/site/`. The browser manifest must match the mounted owner recipe and file sizes. Never mix engine/client/server modules from diagnostic candidates into the selected repaired baseline.

Build and run with the owned, complete Steam legacy tree mounted separately:

```sh
docker build -t local/windows96-source-hl2:20260907-r1 /absolute/private/runtime-context
docker run -d --name windows96-source-hl2 --init --read-only \
  --user 1000:1000 --cap-drop ALL --security-opt no-new-privileges \
  --memory 1g --cpus 2 --pids-limit 128 \
  --publish 127.0.0.1:28141:8088 \
  --mount type=bind,source=/absolute/owned/hl2-steam-legacy-complete,target=/data/owner,readonly \
  --tmpfs /tmp:rw,nosuid,nodev,noexec,size=64m \
  local/windows96-source-hl2:20260907-r1
```

The health check verifies the game server responds. Deployment acceptance additionally checks all 27 native hashes, the `steam-legacy-loose-v1` owner index containing 31,001 files, raw and base64 ranges, ready provisioning status, and COOP/COEP headers. Those HTTP checks establish packaging and data availability; they do not establish gameplay or visual acceptance.

The image sets `WASM_GAME_BASE_PATH=/hl2/`. Its public HTML, framework URLs, native/owner URLs and PWA scope use that prefix. The reverse proxy must strip `/hl2/` when forwarding to port 28141; the internal owner and framework routes remain rooted at `/`. For a direct standalone deployment, override `WASM_GAME_BASE_PATH=/`.

Transfer privately with `docker save`, then `docker load` on the destination. The owner tree is a separate transfer and must be readable by UID 1000. Preserve the previous container/image and exact launch configuration for rollback.
