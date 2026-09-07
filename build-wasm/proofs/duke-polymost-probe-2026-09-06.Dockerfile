# Base tag must resolve to sha256:8631a4e193cadf1eb16c4b5b5d8c3cb639dd605bcab109c7fd9dac5ea8788e90.
# Probe replaces only EDuke32's native pair.
FROM local/build-wasm:duke-classic-base-20260906
COPY duke3d.js duke3d.wasm /opt/game-site/
