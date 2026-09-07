ARG BASE_IMAGE=scratch
FROM ${BASE_IMAGE}
COPY blood-adapter.js duke3d-adapter.js /opt/game-site/
COPY blood-adapter.js /opt/game-site/adapters/blood.js
COPY duke3d-adapter.js /opt/game-site/adapters/duke3d.js
LABEL io.wasm-game-lab.release="20260906-captured-mouse"
