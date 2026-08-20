# syntax=docker/dockerfile:1.7

ARG FRAMEWORK_IMAGE=wasm-game-framework:dev
FROM ${FRAMEWORK_IMAGE} AS framework

FROM debian:bookworm-slim AS native-builder
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src/MP
COPY iortcw/ /src/
RUN make -j"$(getconf _NPROCESSORS_ONLN)" \
      ARCH=x86_64 \
      BUILD_SERVER=1 BUILD_CLIENT=0 BUILD_GAME_SO=0 BUILD_GAME_QVM=0 \
      BUILD_BASEGAME=1 \
      USE_OPENAL=0 USE_CURL=0 USE_CODEC_VORBIS=0 USE_CODEC_OPUS=0 USE_MUMBLE=0 USE_VOIP=0 \
      USE_INTERNAL_LIBS=1 \
    && install -Dm755 build/release-linux-x86_64/iowolfded.x86_64 /out/iowolfded.x86_64 \
    && strip /out/iowolfded.x86_64

FROM node:22-bookworm-slim

ARG RTCW_SOURCE_COMMIT=unknown
ARG FRAMEWORK_VERSION=dev
LABEL org.opencontainers.image.title="RTCW MP WASM" \
      io.wasm-game-framework.engine-source="${RTCW_SOURCE_COMMIT}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends tini wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=framework /opt/wasm-game-framework/ /opt/wasm-game-framework/
COPY --from=framework /opt/shared-shell/ /opt/shared-shell/
COPY game-site/ /opt/game-site/
COPY rtcw-server/ /opt/rtcw-server/
COPY omni-bot/ /opt/omni-bot/
COPY --from=native-builder /out/iowolfded.x86_64 /opt/rtcw-native/iowolfded.x86_64
COPY omni-bot/native/qagame.mp.x86_64.so /opt/rtcw-native/qagame.mp.x86_64.so
RUN cd /opt/rtcw-server \
    && npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force \
    && cp server.cfg /opt/rtcw-native/server.cfg \
    && chmod 555 /opt/rtcw-native/iowolfded.x86_64 /opt/rtcw-native/qagame.mp.x86_64.so \
    && test -f /opt/omni-bot/omnibot_rtcw.x86_64.so \
    && test -f /opt/omni-bot/rtcw/nav/mp_depot.way \
    && test "$(node -p "require('/opt/wasm-game-framework/package.json').version")" = "$FRAMEWORK_VERSION"

ENV WASM_GAME_VARIANT=rtcw-mp \
    WASM_GAME_HTTP_PORT=8088 \
    WASM_GAME_SHELL_ROOT=/opt/shared-shell \
    RTCW_STATIC_PORT=8089 \
    RTCW_GAME_PORT=27960 \
    RTCW_MAP=mp_depot \
    RTCW_MODE=arcade \
    KEEP_ALIVE=false \
    IDLE_TIMEOUT=5m

EXPOSE 8088
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8088/health || exit 1
ENTRYPOINT ["/usr/bin/tini", "--", "node", "/opt/rtcw-server/supervisor.js"]
