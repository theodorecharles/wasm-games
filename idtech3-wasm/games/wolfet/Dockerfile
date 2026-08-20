# syntax=docker/dockerfile:1.7

ARG ETLEGACY_IMAGE=etlegacy/server@sha256:e8810511b59a70cd66ddf36951cbb873333c4081d236241343e19ee4a0a30d63

FROM node:22-alpine AS framework-source
RUN apk add --no-cache bash coreutils git
COPY framework-lock.json /tmp/framework-lock.json
COPY web/wasm-game.json web/wasm-game-data.json web/game-adapter.js /game-site/
COPY web/img/et-192.png web/img/et-512.png /game-site/img/
COPY scripts/stage-framework-runtime.js /tmp/stage-framework-runtime.js
RUN FRAMEWORK_REPOSITORY="$(node -p "require('/tmp/framework-lock.json').repository")" \
    && FRAMEWORK_COMMIT="$(node -p "require('/tmp/framework-lock.json').commit")" \
    && FRAMEWORK_VERSION="$(node -p "require('/tmp/framework-lock.json').version")" \
    && git init -q /framework \
    && git -C /framework remote add origin "$FRAMEWORK_REPOSITORY" \
    && git -C /framework fetch -q --depth=1 origin "$FRAMEWORK_COMMIT" \
    && git -C /framework checkout -q --detach FETCH_HEAD \
    && test "$(git -C /framework rev-parse HEAD)" = "$FRAMEWORK_COMMIT" \
    && test "$(node -p "require('/framework/package.json').version")" = "$FRAMEWORK_VERSION" \
    && /framework/scripts/install-browser-package.sh /framework-dist copy \
    && node /framework/scripts/check-game-package.js /game-site \
    && node /tmp/stage-framework-runtime.js /framework /game-site /framework-dist /framework-runtime

FROM debian:trixie-slim AS etlegacy-source
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /source
COPY scripts/setup-etlegacy.sh scripts/setup-etlegacy.sh
COPY patches/etlegacy-wasm.patch patches/etlegacy-wasm.patch
COPY patches/etlegacy-modes.patch patches/etlegacy-modes.patch
COPY patches/etlegacy-eth32nix.patch patches/etlegacy-eth32nix.patch
COPY patches/etlegacy-human-slot.patch patches/etlegacy-human-slot.patch
COPY patches/etlegacy-etjs-ui.patch patches/etlegacy-etjs-ui.patch
COPY eth32nix eth32nix
RUN sh scripts/setup-etlegacy.sh

FROM debian:trixie-slim AS native-builder
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      build-essential ca-certificates cmake libcjson-dev ninja-build pkg-config zip \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY --from=etlegacy-source /source/etlegacy etlegacy
COPY scripts/build-tools.sh scripts/build-etjs-pak.sh scripts/build-server-mod.sh scripts/
COPY tools/huffpack.c tools/huffpack.c
COPY tools/huffinc tools/huffinc
COPY assets/etjs assets/etjs
RUN sh scripts/build-tools.sh \
    && sh scripts/build-etjs-pak.sh \
    && sh scripts/build-server-mod.sh

FROM emscripten/emsdk:6.0.6 AS web-builder
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends ninja-build \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY --from=etlegacy-source /source/etlegacy etlegacy
COPY third_party third_party
COPY web-port web-port
COPY scripts/build-web-client.sh scripts/patch-etjs-gl.js scripts/
RUN sh scripts/build-web-client.sh

FROM ${ETLEGACY_IMAGE} AS runtime
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates curl libcjson1 nodejs npm tini unzip zip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/wolfet-wasm
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force

COPY server server
COPY scripts scripts
COPY web web
COPY framework-lock.json framework-lock.json
COPY --from=framework-source /framework-dist .generated/shared-shell
COPY --from=framework-source /framework-runtime .generated/framework-runtime
COPY runtime seed/runtime
COPY docker/entrypoint.sh docker/entrypoint.sh
COPY --from=native-builder /build/tools/huffpack tools/huffpack
COPY --from=native-builder /build/runtime/legacy/etjs.pk3 seed/runtime/legacy/etjs.pk3
COPY --from=native-builder /build/runtime/legacy/qagame.mp.x86_64.so seed/runtime/legacy/qagame.mp.x86_64.so
COPY --from=web-builder /build/web/client web/client

RUN chmod 0755 docker/entrypoint.sh tools/huffpack \
    && mkdir -p /data

ENV ETJS_DATA_ROOT=/data \
    ETJS_EMBEDDED_DED=1 \
    ETJS_DED_BIN=/legacy/server/etlded \
    ETJS_DED_PORT=27960 \
    ETJS_HTTP_PORT=8088 \
    ETJS_MODE=arcade \
    ETJS_SLOTS=12 \
    ETJS_TRUST_PROXY=0 \
    ETJS_OMNIBOT=1 \
    KEEP_ALIVE=false \
    IDLE_TIMEOUT=15m

VOLUME ["/data"]
EXPOSE 8088/tcp 27960/udp
HEALTHCHECK --interval=30s --timeout=5s --start-period=10m --retries=3 \
  CMD curl --fail --silent http://127.0.0.1:8088/health >/dev/null || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/opt/wolfet-wasm/docker/entrypoint.sh"]
CMD ["node", "server/index.js"]
