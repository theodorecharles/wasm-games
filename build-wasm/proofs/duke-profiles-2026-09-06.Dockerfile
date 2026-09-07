# Isolated selectable-profile proof. Existing Classic/Blood engines stay intact.
# docker build -f proofs/duke-profiles-2026-09-06.Dockerfile build-wasm
FROM local/build-wasm:duke-classic-base-20260906
COPY .work/duke-modernized/dist/duke3d.js /opt/game-site/duke3d-modernized.js
COPY .work/duke-modernized/dist/duke3d.wasm /opt/game-site/duke3d-modernized.wasm
COPY web/duke3d-adapter.js /opt/game-site/adapters/duke3d.js
COPY web/wasm-game.json /opt/game-site/wasm-game.json
