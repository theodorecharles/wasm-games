# Verify this base tag resolves to the exact historical image before building.
# Base: sha256:8571367ae10dae7267c67a28dfdf4031eaf588ee622e1171c9286be2ff5e1e6d
FROM local/idtech4-wasm:prey-menu-cache-candidate
COPY prey06.js prey06.wasm game-adapter.js /opt/game-site/
