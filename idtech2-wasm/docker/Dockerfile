ARG FRAMEWORK_IMAGE=wasm-game-framework:0.9.6
FROM ${FRAMEWORK_IMAGE} AS framework
FROM node:22-bookworm-slim AS node-runtime

FROM debian:trixie-slim

LABEL io.wasm-game-framework.version="0.9.6"
ENV DEBIAN_FRONTEND=noninteractive \
    WASM_GAME_FRAMEWORK_VERSION=0.9.6
RUN sed -i 's/Components: main/Components: main contrib/' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates libgcc-s1 tini unzip yamagi-quake2-core && \
    rm -rf /var/lib/apt/lists/*

COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/local/lib/node_modules/ /usr/local/lib/node_modules/
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \
    ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

COPY --from=framework /opt/shared-shell/ /opt/shared-shell/
COPY --from=framework /opt/wasm-game-framework/ /opt/wasm-game-framework/
COPY game-site/ /opt/game-site/
COPY server/ /opt/idtech2-server/
COPY frikbot/ /opt/frikbot/
COPY 3zb2/ /opt/3zb2/

RUN cd /opt/idtech2-server && npm ci --omit=dev --ignore-scripts && \
    test "$(node -p "require('/opt/wasm-game-framework/package.json').version")" = "0.9.6" && \
    test -x /opt/frikbot/bin/nqserver && \
    test -f /opt/frikbot/progs.dat && \
    test -x /usr/lib/yamagi-quake2/q2ded && \
    test -f /opt/3zb2/game.so && \
    test -f /usr/lib/yamagi-quake2/xatrix/game.so && \
    test -f /usr/lib/yamagi-quake2/rogue/game.so

ARG GAME_VARIANT=suite
ENV WASM_GAME_VARIANT=${GAME_VARIANT} \
    WASM_GAME_HTTP_PORT=8088 \
    IDTECH2_STATIC_PORT=8089 \
    WASM_GAME_SITE_ROOT=/opt/game-site \
    WASM_GAME_FRAMEWORK_ROOT=/opt/wasm-game-framework \
    IDTECH2_Q1_SERVER=/opt/frikbot/bin/nqserver \
    IDTECH2_Q1_PROGS=/opt/frikbot/progs.dat \
    IDTECH2_Q2_SERVER=/usr/lib/yamagi-quake2/q2ded \
    IDTECH2_Q2_GAME=/opt/3zb2/game.so \
    IDTECH2_Q2_ASSETS=/opt/3zb2/assets \
    IDTECH2_Q2_XATRIX_GAME=/usr/lib/yamagi-quake2/xatrix/game.so \
    IDTECH2_Q2_ROGUE_GAME=/usr/lib/yamagi-quake2/rogue/game.so \
    KEEP_ALIVE=false \
    IDLE_TIMEOUT=5m

VOLUME ["/data"]
EXPOSE 8088
ENTRYPOINT ["/usr/bin/tini", "--", "node", "/opt/idtech2-server/supervisor.js"]
