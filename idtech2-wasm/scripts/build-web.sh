#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
q1_source_dir="$("$repo_dir/scripts/fetch-source" quake)"
q2_source_dir="$("$repo_dir/scripts/fetch-source" quake2)"
q1_build_dir="${IDTECH2_Q1_BUILD_DIR:-$repo_dir/.work/build/quake}"
q2_build_dir="${IDTECH2_Q2_BUILD_DIR:-$repo_dir/.work/build/quake2}"
dist_dir="$repo_dir/web/dist"
workspace_dir="$(cd "$repo_dir/../.." && pwd)"
framework_dir="${WASM_FRAMEWORK_DIR:-$workspace_dir/wasm-game-framework}"
build_type="${IDTECH2_BUILD_TYPE:-Release}"
jobs="${IDTECH2_BUILD_JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || printf '2')}"
required_framework_version="0.9.6"
required_framework_commit="ebb1ebe35ad8224a9080279a6529414db42d3284"

if ! command -v emcmake >/dev/null 2>&1; then
    emsdk_dir="${EMSDK_DIR:-${EMSDK:-}}"
    if [[ -z "$emsdk_dir" || ! -f "$emsdk_dir/emsdk_env.sh" ]]; then
        printf 'Activate Emscripten or set EMSDK_DIR/EMSDK to an initialized emsdk checkout.\n' >&2
        exit 1
    fi
    export EMSDK_QUIET=1
    # shellcheck disable=SC1090
    source "$emsdk_dir/emsdk_env.sh" >/dev/null
fi

if [[ ! -x "$framework_dir/scripts/install-browser-package.sh" ]]; then
    printf 'WASM framework browser package not found at %s\n' "$framework_dir" >&2
    exit 1
fi
framework_version="$(node -p "require('${framework_dir}/package.json').version")"
framework_commit="$(git -C "$framework_dir" rev-parse HEAD)"
if [[ "$framework_version" != "$required_framework_version" || "$framework_commit" != "$required_framework_commit" ]]; then
    printf 'id Tech 2 WASM requires wasm-game-framework %s at %s; found %s at %s.\n' \
        "$required_framework_version" "$required_framework_commit" "$framework_version" "$framework_commit" >&2
    exit 1
fi

if ! command -v magick >/dev/null 2>&1; then
    printf 'ImageMagick is required to derive PWA icons from the engine artwork.\n' >&2
    exit 1
fi

cmake -E make_directory "$dist_dir/adapters" "$q1_source_dir/web" "$q2_source_dir/web"
cmake -E copy_if_different "$repo_dir/games/quake/web/game-adapter.js" "$q1_source_dir/web/game-adapter.js"
cmake -E copy_if_different "$repo_dir/web/wasm-game.json" "$q1_source_dir/web/wasm-game.json"
cmake -E copy_if_different "$repo_dir/web/wasm-game-data.json" "$q1_source_dir/web/wasm-game-data.json"
cmake -E copy_if_different "$repo_dir/games/quake2/web/game-adapter.js" "$q2_source_dir/web/game-adapter.js"
for obsolete in index.html quake1.html owner-data.js service-worker.js app.webmanifest \
    wolfwasm-shell.js wolfwasm-shell.css wolfwasm-bootstrap.js quake1.data; do
    cmake -E rm -f "$dist_dir/$obsolete"
done

emcmake cmake -S "$q1_source_dir" -B "$q1_build_dir" \
    -UQUAKE_DATA_DIR \
    -DCMAKE_BUILD_TYPE="$build_type"
cmake --build "$q1_build_dir" --target quake1 --parallel "$jobs"

cmake -E copy_if_different "$q1_source_dir/web/dist/quake1.js" "$dist_dir/quake1.js"
cmake -E copy_if_different "$q1_source_dir/web/dist/quake1.wasm" "$dist_dir/quake1.wasm"

emcmake cmake -S "$q2_source_dir" -B "$q2_build_dir" \
    -DCMAKE_BUILD_TYPE="$build_type"
cmake --build "$q2_build_dir" --target quake2 --parallel "$jobs"

cmake -E copy_if_different "$q2_build_dir/release/quake2.js" "$dist_dir/quake2.js"
cmake -E copy_if_different "$q2_build_dir/release/quake2.wasm" "$dist_dir/quake2.wasm"
cmake -E copy_if_different "$q2_source_dir/stuff/icon/Quake2.ico" "$dist_dir/quake2.ico"
cmake -E copy_if_different "$repo_dir/web/game-adapter.js" "$dist_dir/game-adapter.js"
cmake -E copy_if_different "$repo_dir/games/quake/web/game-adapter.js" "$dist_dir/adapters/quake.js"
cmake -E copy_if_different "$repo_dir/games/quake2/web/game-adapter.js" "$dist_dir/adapters/quake2.js"
cmake -E copy_if_different "$repo_dir/web/wasm-game.json" "$dist_dir/wasm-game.json"
cmake -E copy_if_different "$repo_dir/web/wasm-game-data.json" "$dist_dir/wasm-game-data.json"

magick "$q1_source_dir/WinQuake/quake.ico[4]" -filter point -resize 192x192 "$dist_dir/quake-192.png"
magick "$q1_source_dir/WinQuake/quake.ico[4]" -filter point -resize 512x512 "$dist_dir/quake-512.png"
magick "$q2_source_dir/stuff/icon/Quake2.png" -resize 192x192 "$dist_dir/quake2-192.png"
cmake -E copy_if_different "$q2_source_dir/stuff/icon/Quake2.png" "$dist_dir/quake2-512.png"

"$framework_dir/scripts/install-browser-package.sh" "$dist_dir/shared-shell" copy

printf 'Built Quake and Quake II family site at %s (framework %s/%s).\n' \
    "$dist_dir" "$required_framework_version" "$required_framework_commit"
