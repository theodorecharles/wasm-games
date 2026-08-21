#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workspace_dir="$(cd "$repo_dir/../.." && pwd)"
framework_dir="${WASM_FRAMEWORK_DIR:-$workspace_dir/wasm-game-framework}"
image="${1:-build-wasm:dev}"
variant="${2:-suite}"

"$repo_dir/scripts/test-web.sh"
"$framework_dir/scripts/build-static-image.sh" "$repo_dir/.work/build/dist" "$image" "$variant"
