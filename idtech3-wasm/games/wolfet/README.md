# wolfet-wasm

Status: **Live**

In-tree Enemy Territory package for `idtech3-wasm`. Develop WolfET here,
alongside Quake III and RTCW; `npm run prepare:wolfet` and
`npm run image:wolfet` in the family root stage this directory and build
`wolfet-wasm:devel`.

Wolfenstein: Enemy Territory in a web browser. wolfet-wasm runs a WebAssembly/WebGL 2 build of ET: Legacy in the browser and connects every player to one ET: Legacy Objective server managed by the same host.

The default server is a 12-player Arcade match. Omni-Bot fills empty places and removes a bot whenever a human joins, so the match stays populated without reserving bot-only slots.

## Features

- The real Enemy Territory engine, menus, maps, HUD, compass, weapons, objectives, audio, keyboard, and mouse input in the browser.
- One shared Objective match with the six official maps in rotation: Oasis, Battery, Gold Rush, Radar, Rail Gun, and Fuel Dump.
- A configurable 2–63 player population, with 12 players by default.
- Automatic Omni-Bot population that yields places to human players.
- Global chat with **T**, team chat with **Y**, and the voice menu with **V**. The debrief screen has its own chat field and Quick Chat button.
- Configurable graphics profiles and optional dynamic quality targets of 30, 60, or 120 FPS.
- Server-side download and checksum verification of the official free game data. Browsers receive assets only from your wolfet-wasm server and cache them locally.
- Custom PK3 and map rotation support through `/data/custom_maps`.
- Two server modes: stock-style Vanilla and the faster Arcade ruleset.
- Idle sleep by default, with automatic wake during the browser's initial **Play** loading phase.
- Automatic local-host administration for kicking or banning players and changing maps.

## Vanilla and Arcade modes

Set `ETJS_MODE` to `vanilla` or `arcade`. Arcade is the default.

| Behavior | `vanilla` | `arcade` |
| --- | --- | --- |
| Movement speed | Original 320 | 400 (1.25×) |
| Jumping | Original single jump | Double jump |
| Stamina | Original drain and recharge | Unlimited |
| Custom hit sounds | Off | On |
| Multi-kill announcer | Off | On |
| Aimbot and visibility assists | Unavailable | Available with the `aimbot` console command |

In Arcade mode, `aimbot` toggles the compiled-in [ETH32NIX rabbmod](https://github.com/rabb/eth32nix-rabbmod) layer: bullet and grenade aimbots, wallhack/chams, name/class/item ESP, radar, and the in-game settings UI. There is no injector. `aimbot menu` (or `aimbotmenu`) opens the ETH32 windows. Teammates are excluded from targeting. Vanilla mode blocks the feature even if a client sets `cl_aimbot` directly. The old `rshook` / `cchook` commands are gone.

## Run with Docker

The deployment image currently targets `linux/amd64`. It contains the web client, Node host, dedicated server, Omni-Bot, and project-owned runtime files. It does not contain the original Wolfenstein: Enemy Territory PK3s.

Build the image:

```bash
git clone https://github.com/theodorecharles/wolfet-wasm.git
cd wolfet-wasm
docker build --platform linux/amd64 -t wolfet-wasm:latest .
```

Create a persistent data directory and start a 12-player Arcade server:

```bash
mkdir -p ./wolfet-wasm-data/custom_maps

docker run -d \
  --name wolfet-wasm \
  --restart unless-stopped \
  -p 8088:8088/tcp \
  -p 27960:27960/udp \
  -e ETJS_MODE=arcade \
  -e ETJS_SLOTS=12 \
  -e KEEP_ALIVE=false \
  -e IDLE_TIMEOUT=15m \
  -v "$(pwd)/wolfet-wasm-data:/data" \
  wolfet-wasm:latest
```

Follow startup and open the game:

```bash
docker logs -f wolfet-wasm
```

Visit <http://127.0.0.1:8088/> when the website reports that it is listening. With the default idle settings, submitting the initial player-name screen starts the dedicated match before the ET main menu appears.

On its first start, the server downloads the official Enemy Territory archive from Splash Damage, verifies pinned SHA-256 checksums, and extracts the required files into `/data`. Keep that directory or volume mounted. Later starts verify and reuse the existing data instead of downloading it again.

### Docker configuration

| Variable | Default | Description |
| --- | --- | --- |
| `ETJS_MODE` | `arcade` | `arcade` or `vanilla`, as described above. |
| `ETJS_SLOTS` | `12` | Human-plus-bot population maintained by the server; integer from 2 through 63. |
| `ETJS_HTTP_PORT` | `8088` | HTTP and WebSocket port inside the container. Keep the Docker port mapping in sync if changed. |
| `ETJS_DED_PORT` | `27960` | Dedicated-server UDP port inside the container. Keep the UDP mapping in sync if changed. |
| `ETJS_OMNIBOT` | `1` | Set to `0` to disable automatic bot fill. |
| `KEEP_ALIVE` | `false` | Set to `true` to keep the dedicated ET process running indefinitely. |
| `IDLE_TIMEOUT` | `15m` | Stop the dedicated process after this long without a human player. Accepts seconds or values such as `10m` or `2h`. |
| `WASM_GAME_PASSWORD` | empty | Optional browser-game password. When set, the framework login protects game data, engine assets, match status, Play/wake, administration, and WebSocket upgrades. |
| `WASM_GAME_PASSWORD_TTL` | `12h` | Lifetime of the HttpOnly browser password session. Accepts values such as `30m`, `12h`, or `48h`. |
| `WASM_GAME_TRUST_PROXY` | `false` | Set to `true` only behind a controlled TLS proxy that overwrites `X-Forwarded-Proto`, so password cookies receive the `Secure` attribute. |
| `ETJS_RCON` | generated | Optional RCON password. If omitted, a random password is stored in the persistent data directory. |
| `ETJS_TRUST_PROXY` | `0` | Set to `1` only when a same-host reverse proxy overwrites `X-Forwarded-For`. |
| `ETJS_ADMIN_IPS` | empty | Optional comma-separated admin IP allowlist for NAT or proxy setups where automatic same-host detection is insufficient. |

`ETJS_SLOTS` is the maintained playing population. The dedicated server internally keeps one temporary connection place above that number so a human can finish connecting before the supervisor removes the bot being replaced.

Health and match information are available at `/health` and `/status`.

When `WASM_GAME_PASSWORD` is set, the canonical launcher remains reachable so it can present the login form. `/auth/status`, `/auth/login`, and `/auth/logout` manage one HttpOnly same-origin session. The public health check remains available but returns only `{ "ok": true }`; match status and all game traffic require the session.

With the default `KEEP_ALIVE=false`, the lightweight HTTP/WebSocket host stays online while the ET dedicated process and Omni-Bot sleep. Submitting the browser's initial **Play** screen wakes the match and waits for it to become ready before opening the ET main menu; **Join Game** then connects immediately. Each wake chooses a random map from the configured rotation and avoids immediately repeating the previous start map. After the last human leaves, the dedicated process stops when `IDLE_TIMEOUT` expires. Set `KEEP_ALIVE=true` for an always-running match; in that mode `IDLE_TIMEOUT` is ignored.

### Optional UT2004 announcer

To use the original Unreal Tournament 2004 male announcer as a local override,
extract these files into `/data/announcer`:

```text
doublekill.wav
multikill.wav
megakill.wav
ultrakill.wav
monsterkill.wav
```

Restart the container after adding all five files. wolfet-wasm builds a private
ETJS overlay at startup and logs `installed locally supplied UT2004 announcer`.
The override is used only in Arcade mode because Vanilla disables multi-kill
announcements.

## Unraid

The canonical Community Applications template is [wolfet-wasm.xml](https://github.com/theodorecharles/unraid-templates/blob/master/wolfet-wasm.xml), with a synchronized copy in [templates/wolfet-wasm.xml](templates/wolfet-wasm.xml). It uses `/mnt/user/appdata/wolfet-wasm` for persistent data and exposes all normal server settings in the Unraid container form.

Until the app is listed in Community Applications, install the template manually from an Unraid terminal:

```bash
curl --fail --location \
  --output /boot/config/plugins/dockerMan/templates-user/my-wolfet-wasm.xml \
  https://raw.githubusercontent.com/theodorecharles/unraid-templates/master/wolfet-wasm.xml
```

Then open **Docker → Add Container**, select `wolfet-wasm` from the template list, review the settings, and apply it. The persistent data share contains `custom_maps`; restart the container after adding or removing PK3 files.

## Local server administration

A browser whose source address matches the server is marked as a local administrator. Direct access through `127.0.0.1`, `::1`, a server interface address, and Docker's published localhost bridge is detected automatically. The RCON password remains on the server and is never returned to the browser.

Open the in-game console and use:

```text
etjs_admin help
etjs_admin status
etjs_admin kick <slot or player name>
etjs_admin ban <slot or player name>
etjs_admin bans
etjs_admin unban <ip address>
etjs_admin map <map name>
etjs_admin map_restart
etjs_admin nextmap
```

`ban` records the player's real browser/WebSocket IP in `/data/runtime/.admin-bans.json`, disconnects their WebSocket, and blocks later connections. This is deliberately handled by the web proxy: the ET server sees proxied browser connections as localhost, so using ET's stock IP-ban command would ban the proxy itself. `kick` disconnects only the selected game client.

For a reverse proxy, set `ETJS_TRUST_PROXY=1` only if clients cannot bypass that proxy and the proxy replaces—not appends untrusted input to—`X-Forwarded-For`. If Docker or NAT prevents the host address from being recognized, add the administrator's exact address to `ETJS_ADMIN_IPS`.

## Add custom maps

Put custom-map and supporting PK3 files in the persistent data directory:

```text
wolfet-wasm-data/
└── custom_maps/
    ├── example-map.pk3
    └── example-map-assets.pk3
```

Restart the container after adding or removing files:

```bash
docker restart wolfet-wasm
```

At startup, wolfet-wasm:

1. makes every safe `*.pk3` in `custom_maps` available to the dedicated server;
2. publishes those PK3s to browsers through the same origin;
3. finds `maps/*.bsp` entries inside them; and
4. appends the discovered maps to the Objective rotation after the six official maps.

Supporting PK3s that do not contain a BSP are still loaded and delivered to clients. Use simple PK3 filenames containing letters, numbers, dots, underscores, or hyphens. Do not name a custom file `pak0.pk3`, `pak1.pk3`, `pak2.pk3`, or `mp_bin.pk3`.

Every connecting browser must download custom content it does not already have cached, so large map packs increase first-load time. Maps must be compatible with Enemy Territory Objective mode and include their own required scripts and assets.

## Reverse proxy

The game page, PK3 files, and `/ws` endpoint must be served from the same public origin. A reverse proxy must support WebSocket upgrades and should preserve byte-range requests for large PK3 files. A minimal nginx location setup looks like this:

```nginx
location / {
    proxy_pass http://127.0.0.1:8088;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
}

location /ws {
    proxy_pass http://127.0.0.1:8088;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_read_timeout 3600s;
}
```

Expose UDP 27960 only if native ET status queries or other direct UDP access are needed. Browser gameplay travels through `/ws`.

## Local development

Local development is supported on Linux. Install:

- Node.js 18 or newer and npm;
- Git, CMake, Ninja, a C/C++ compiler, `curl`, `unzip`, `zip`, and ImageMagick;
- Docker; and
- an activated Emscripten SDK when building the WebAssembly client.

Prepare the pinned ET: Legacy checkout, official local data, native server module, and project PK3:

```bash
npm install
npm run setup
```

Activate Emscripten and build the browser client:

```bash
source /path/to/emsdk/emsdk_env.sh
npm run build:web
```

Start the development host:

```bash
ETJS_MODE=arcade ETJS_SLOTS=12 KEEP_ALIVE=false IDLE_TIMEOUT=15m npm start
```

The local development host listens on TCP 8088 and starts its dedicated-server container on UDP 27961 by default. Custom maps belong in `custom_maps` at the repository data root during local development. Generated builds, downloaded game files, credentials, sessions, and upstream workspaces are ignored by Git.

Useful commands:

```bash
npm test                    # run the Node and structural test suite
npm run setup:data          # verify or restore local game data
npm run setup:engine        # prepare the pinned ET: Legacy source tree
npm run build:pak           # rebuild project-owned runtime data
npm run build:server-mod    # rebuild the native game module
npm run build:web           # rebuild JavaScript and WebAssembly
npm run test:e2e            # run the browser smoke test
```

## Contributing

The `etlegacy/` and `quakejs/` directories are local reference workspaces and are not committed. ET: Legacy is pinned to a known revision; the maintained engine changes live in `patches/etlegacy-wasm.patch`, `patches/etlegacy-modes.patch`, and `patches/etlegacy-eth32nix.patch`. The ETH32NIX sources in `eth32nix/` are copied into cgame by `setup-etlegacy.sh`. Make engine changes in the prepared `etlegacy/` tree and keep the corresponding patch current so a fresh clone remains reproducible.

Before submitting a change:

```bash
npm test
npm run build:web
```

Rendering, input, and UI changes should also be tested manually from the name screen through joining, spawning, live play, map loading, and the debrief screen. Do not commit original game PK3s, downloaded archives, generated WebAssembly output, runtime data, or credentials.

The `devel` branch publishes the Docker `dev` tag and `master` publishes `latest` after the repository has `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` Actions secrets configured.
