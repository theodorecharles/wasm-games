# Public image: patches, adapter, and framework only.
# The leaked engine tree, steam_legacy depot, and 2014 GOTY ISO are
# provided at run time by the person who runs the container.
FROM emscripten/emsdk:4.0.10@sha256:90b757eb11fa9a0e3ce4d2d9f76d932a56018e4accc37b5a28b2783751e60eb7

ARG GAME_VARIANT=hl2

RUN apt-get update \
  && apt-get install -y --no-install-recommends cabextract libfreetype6-dev msitools p7zip-full rsync python3 \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

# The pinned Emscripten SDK ships the FreeType port headers flat under
# freetype2, while this Source tree includes the conventional <freetype/...>
# spelling. Keep the compatibility aliases inside the private SDK layer.
RUN embuilder build freetype \
  && freetype_root="$(em-config CACHE)/sysroot/include/freetype2" \
  && if [ -d "${freetype_root}" ] && [ ! -e "${freetype_root}/freetype/ftbitmap.h" ]; then \
       mkdir -p "${freetype_root}/freetype"; \
       for header in "${freetype_root}"/*.h; do \
         ln -s "../$(basename "${header}")" "${freetype_root}/freetype/$(basename "${header}")"; \
       done; \
     fi

COPY vendor/wasm-game-framework/ /opt/wasm-game-framework/
# Copy only repository-owned browser assets. Generated source-engine.js/WASM
# are private build outputs and must be produced inside the image after the
# user supplies the engine tree; a blanket COPY web/ could capture ignored
# local binaries from the build context.
COPY web/data-validator.mjs /opt/game-site/data-validator.mjs
COPY web/game-adapter.js /opt/game-site/game-adapter.js
COPY web/icon.svg /opt/game-site/icon.svg
COPY web/wasm-game-data.json /opt/game-site/wasm-game-data.json
COPY web/wasm-game.json /opt/game-site/wasm-game.json
COPY scripts/ /opt/source-wasm/scripts/
COPY patches/ /opt/source-wasm/patches/
COPY package.json framework-lock.json source-lock.json /opt/source-wasm/

RUN chmod +x /opt/source-wasm/scripts/*.sh /opt/source-wasm/scripts/*.mjs \
  && mkdir -p /inputs/source /inputs/steam /inputs/iso /data /var/lib/source-wasm

ENV WASM_GAME_VARIANT=${GAME_VARIANT} \
    WASM_GAME_FRAMEWORK_ROOT=/opt/wasm-game-framework \
    WASM_GAME_SITE_ROOT=/opt/game-site \
    WASM_GAME_SHELL_ROOT=/opt/wasm-game-framework/dist \
    WASM_GAME_DATA_ROOT=/data/owner \
    WASM_GAME_HTTP_PORT=8088 \
    SOURCE_ENGINE_ROOT=/inputs/source \
    HL2_STEAM_ROOT=/inputs/steam \
    HL2_GOTY_ROOT=/var/lib/source-wasm/goty \
    HL2_COMBINED_ROOT=/data/owner \
    SOURCE_WASM_WEB_DIR=/opt/game-site

VOLUME ["/inputs/source", "/inputs/steam", "/inputs/iso", "/data"]
EXPOSE 8088
ENTRYPOINT ["/opt/source-wasm/scripts/docker-entrypoint.sh"]
