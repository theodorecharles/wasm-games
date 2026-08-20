#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
port="${1:-8007}"
variant="${2:-suite}"
framework_dir="${WASM_FRAMEWORK_DIR:-$repo_dir/../wasm-game-framework}"
data_root="${BUILD_WASM_DATA_ROOT:-$repo_dir/build-web/container-data}"
required_framework_version="0.9.4"
required_framework_commit="c4ad3b9"

if [[ ! -f "$repo_dir/build-web/dist/wasm-game.json" ]]; then
    printf 'No browser build found. Run ./build-web.sh first.\n' >&2
    exit 1
fi
if [[ ! -f "$framework_dir/server/static-server.js" ]]; then
    printf 'WASM framework server not found at %s\n' "$framework_dir" >&2
    exit 1
fi
framework_version="$(node -p "require('${framework_dir}/package.json').version")"
framework_commit="$(git -C "$framework_dir" rev-parse --short=7 HEAD)"
if [[ "$framework_version" != "$required_framework_version" || "$framework_commit" != "$required_framework_commit" ]]; then
    printf 'Build WASM requires wasm-game-framework %s at %s; found %s at %s.\n' \
        "$required_framework_version" "$required_framework_commit" "$framework_version" "$framework_commit" >&2
    exit 1
fi
case "$variant" in suite|blood|duke3d) ;; *) printf 'Variant must be suite, blood, or duke3d.\n' >&2; exit 1 ;; esac

mkdir -p "$data_root"
printf '[Build WASM] Serving %s launcher at http://127.0.0.1:%s/\n' "$variant" "$port"
printf '[Build WASM] Persistent private owner-data root: %s\n' "$data_root"
exec env \
    WASM_GAME_SITE_ROOT="$repo_dir/build-web/dist" \
    WASM_GAME_SHELL_ROOT="$framework_dir/dist" \
    WASM_GAME_DATA_ROOT="$data_root" \
    WASM_GAME_HTTP_PORT="$port" \
    WASM_GAME_VARIANT="$variant" \
    node "$framework_dir/server/static-server.js"
