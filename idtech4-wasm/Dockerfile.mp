# syntax=docker/dockerfile:1.7
ARG FRAMEWORK_IMAGE=wasm-game-framework:0.9.6
FROM ${FRAMEWORK_IMAGE} AS framework
FROM node:22-bookworm-slim
ARG GAME_VARIANT=doom3-mp
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsdl2-2.0-0 libvorbisfile3 libjpeg62-turbo zlib1g libcurl4 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=framework /opt/wasm-game-framework /opt/wasm-game-framework
COPY --from=framework /opt/shared-shell /opt/shared-shell
COPY server/package.json server/package-lock.json /opt/doom3-server/
RUN npm ci --ignore-scripts --omit=dev --prefix /opt/doom3-server
COPY server/*.cjs /opt/doom3-server/
COPY build/native/dhewm3ded build/native/base.so /opt/doom3-native/
COPY build/site/ /opt/game-site/
ENV WASM_GAME_VARIANT=${GAME_VARIANT} WASM_GAME_FRAMEWORK_VERSION=0.9.6 WASM_GAME_HTTP_PORT=8088
USER node
VOLUME ["/data"]
EXPOSE 8088/tcp
ENTRYPOINT ["node", "/opt/doom3-server/supervisor.cjs"]
