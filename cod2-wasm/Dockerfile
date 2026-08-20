# syntax=docker/dockerfile:1.7

ARG FRAMEWORK_IMAGE=wasm-game-framework:0.9.2
FROM ${FRAMEWORK_IMAGE}

ARG GAME_VARIANT=suite
ARG VCS_REF=local
LABEL org.opencontainers.image.title="Call of Duty 2 WASM development checkpoint" \
      org.opencontainers.image.description="Call of Duty 2 IW 2.0 reconstruction WebAssembly diagnostic" \
      org.opencontainers.image.revision="$VCS_REF"

COPY out/cod2-wasm-core/site/ /opt/game-site/

ENV WASM_GAME_VARIANT=${GAME_VARIANT}
VOLUME ["/data"]
EXPOSE 8088/tcp
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:8088/ >/dev/null
