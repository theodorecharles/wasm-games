FROM local/build-wasm:duke-profiles-text-candidate
COPY .work/blood-modernized/dist/blood.js /opt/game-site/blood-modernized.js
COPY .work/blood-modernized/dist/blood.wasm /opt/game-site/blood-modernized.wasm
COPY .work/blood-modernized/dist/blood.data /opt/game-site/blood-modernized.data
COPY web/blood-adapter.js /opt/game-site/adapters/blood.js
COPY web/wasm-game.json /opt/game-site/wasm-game.json
