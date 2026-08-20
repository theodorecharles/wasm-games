# syntax=docker/dockerfile:1.7

ARG FRAMEWORK_IMAGE=wasm-game-framework:0.9.2
FROM ${FRAMEWORK_IMAGE}

ARG VCS_REF=unknown
ARG GAME_VARIANT=suite
LABEL org.opencontainers.image.title="id Tech 4 WASM suite" \
      org.opencontainers.image.description="Doom 3, RoE, Quake 4, and Prey browser suite" \
      org.opencontainers.image.revision="$VCS_REF"

COPY build/site/ /opt/game-site/

ENV WASM_GAME_VARIANT=${GAME_VARIANT}
VOLUME ["/data"]
EXPOSE 8088/tcp
