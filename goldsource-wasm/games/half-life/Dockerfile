# Half-Life — GoldSource WASM per-game image.
# The shared engine web bundle is staged into this build context as game-site/
# by engine/scripts/build-images.sh. Game data is mounted at /data at runtime.
ARG FRAMEWORK_IMAGE=wasm-game-framework:0.9.6
FROM ${FRAMEWORK_IMAGE}

ARG GAME_VARIANT=half-life
COPY game-site/ /opt/game-site/
ENV WASM_GAME_VARIANT=${GAME_VARIANT}
