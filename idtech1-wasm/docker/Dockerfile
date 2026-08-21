ARG FRAMEWORK_IMAGE=wasm-game-framework:0.9.6
FROM ${FRAMEWORK_IMAGE} AS framework
FROM node:22-bookworm-slim AS node-runtime

FROM ubuntu:24.04 AS chocolate-server-build
ARG CHOCOLATE_DOOM_COMMIT=410d96855b5df5410ff591a90efeafa889119224
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      build-essential ca-certificates cmake git libsdl2-dev libsdl2-net-dev && \
    rm -rf /var/lib/apt/lists/*
RUN git init /src/chocolate-doom && \
    git -C /src/chocolate-doom remote add origin https://github.com/chocolate-doom/chocolate-doom.git && \
    git -C /src/chocolate-doom fetch --depth 1 origin "${CHOCOLATE_DOOM_COMMIT}" && \
    git -C /src/chocolate-doom checkout --detach FETCH_HEAD && \
    test "$(git -C /src/chocolate-doom rev-parse HEAD)" = "${CHOCOLATE_DOOM_COMMIT}" && \
    cmake -S /src/chocolate-doom -B /build/chocolate-doom \
      -DCMAKE_BUILD_TYPE=Release \
      -DENABLE_SDL2_MIXER=OFF \
      -DENABLE_SDL2_NET=ON && \
    cmake --build /build/chocolate-doom --target chocolate-server --parallel && \
    test "$(/build/chocolate-doom/src/chocolate-server --version)" = "Chocolate Doom 3.1.1"

FROM ubuntu:24.04

LABEL io.wasm-game-framework.version="0.9.6"
ENV DEBIAN_FRONTEND=noninteractive \
    WASM_GAME_FRAMEWORK_VERSION=0.9.6
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates libsdl1.2debian libsdl2-2.0-0 libsdl2-net-2.0-0 libzstd1 tini && \
    rm -rf /var/lib/apt/lists/*

COPY --from=chocolate-server-build /build/chocolate-doom/src/chocolate-server /usr/games/chocolate-server

COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/local/lib/node_modules/ /usr/local/lib/node_modules/
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \
    ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx && \
    node --version && npm --version

COPY --from=framework /opt/shared-shell/ /opt/shared-shell/
COPY --from=framework /opt/wasm-game-framework/ /opt/wasm-game-framework/
COPY game-site/ /opt/game-site/
COPY server/ /opt/idtech1-server/
COPY zandronum/ /opt/zandronum/

RUN cd /opt/idtech1-server && npm ci --omit=dev --ignore-scripts && \
    test "$(node -p "require('/opt/wasm-game-framework/package.json').version")" = "0.9.6" && \
    test -x /usr/games/chocolate-server && \
    test "$(/usr/games/chocolate-server --version)" = "Chocolate Doom 3.1.1" && \
    test -x /opt/zandronum/zandronum-server

ARG GAME_VARIANT=suite
ENV WASM_GAME_VARIANT=${GAME_VARIANT} \
    WASM_GAME_HTTP_PORT=8088 \
    WASM_GAME_SITE_ROOT=/opt/game-site \
    WASM_GAME_FRAMEWORK_ROOT=/opt/wasm-game-framework \
    IDTECH1_CLASSIC_SERVER=/usr/games/chocolate-server \
    IDTECH1_ZANDRONUM_SERVER=/opt/zandronum/zandronum-server \
    IDTECH1_ZANDRONUM_ROOT=/opt/zandronum \
    KEEP_ALIVE=false \
    IDLE_TIMEOUT=5m

VOLUME ["/data"]
EXPOSE 8088
ENTRYPOINT ["/usr/bin/tini", "--", "node", "/opt/idtech1-server/supervisor.js"]
