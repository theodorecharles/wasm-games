#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
framework_dir="${WASM_FRAMEWORK_DIR:-$repo_dir/../wasm-game-framework}"
image="${1:-wolf3d-wasm:dev}"
variant="${2:-wolf3d}"

case "$variant" in
    wolf3d|spear) ;;
    *) printf 'Unknown Wolf4SDL variant: %s (expected wolf3d or spear).\n' "$variant" >&2; exit 2 ;;
esac

"$repo_dir/build-web.sh"
"$framework_dir/scripts/build-static-image.sh" "$repo_dir/build-web/dist" "$image" "$variant"
"$repo_dir/scripts/test-http.sh" "$image" "$variant"
