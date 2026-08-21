ARG BASE_IMAGE=wasm-game-framework:0.9.6
FROM ${BASE_IMAGE}

RUN apk add --no-cache innoextract=1.9-r10 \
    && innoextract --version | grep -F 'innoextract 1.9'

LABEL io.openrct2.media-transformer="gog-innoextract" \
      io.openrct2.innoextract.version="1.9-r10"
