# Build only after verifying this tag resolves to the exact base below.
# Base: sha256:fc651e2b5697e8605f53566d1e1d67b600e09d3c7166a51d3292cabc519d932a
FROM local/idtech4-wasm:quake4-quad-candidate
COPY game-adapter.js /opt/game-site/game-adapter.js
