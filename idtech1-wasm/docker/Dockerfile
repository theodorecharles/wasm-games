ARG FRAMEWORK_IMAGE=wasm-game-framework:0.9.6
FROM ${FRAMEWORK_IMAGE} AS framework
FROM node:22-bookworm-slim AS node-runtime

FROM ubuntu:24.04

LABEL io.wasm-game-framework.version="0.9.6"
ENV DEBIAN_FRONTEND=noninteractive \
    WASM_GAME_FRAMEWORK_VERSION=0.9.6
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates chocolate-doom libsdl1.2debian libzstd1 tini && \
    rm -rf /var/lib/apt/lists/*

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
