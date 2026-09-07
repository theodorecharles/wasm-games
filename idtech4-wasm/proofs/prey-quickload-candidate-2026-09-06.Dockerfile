# Verify the local base tag resolves to this exact image before building:
# sha256:73534e2ca76cd98ea89ab904fe13aeeb65139fdb0ac8b49cb05a53f6202d1ffd
FROM local/idtech4-wasm:prey-trace-cache-candidate
COPY prey06.js prey06.wasm /opt/game-site/
