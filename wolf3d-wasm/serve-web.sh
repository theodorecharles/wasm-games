#!/usr/bin/env bash
set -euo pipefail

engine_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
port="${1:-8011}"
variant="${2:-wolf3d}"

case "$variant" in
    wolf3d|spear) ;;
    *) printf 'Unknown Wolf4SDL variant: %s (expected wolf3d or spear).\n' "$variant" >&2; exit 2 ;;
esac

if [[ ! -f "$engine_dir/.work/dist/wasm-game.json" ]]; then
    printf 'No browser build found. Run ./build-web.sh first.\n' >&2
    exit 1
fi

framework_dir="${WASM_FRAMEWORK_DIR:-/home/ted/Development/wasm-game-framework}"
data_root="${WOLF3D_DATA_ROOT:-/home/ted/wasm-game-data}"
exec env \
    WASM_GAME_SITE_ROOT="$engine_dir/.work/dist" \
    WASM_GAME_SHELL_ROOT="$engine_dir/.work/dist/shared-shell" \
    WASM_GAME_DATA_MANIFEST="$engine_dir/.work/dist/wasm-game-data.json" \
    WASM_GAME_DATA_ROOT="$data_root" \
    WASM_GAME_HTTP_PORT="$port" \
    WASM_GAME_VARIANT="$variant" \
    node "$framework_dir/server/static-server.js"
