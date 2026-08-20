#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
q1_build_dir="${IDTECH2_Q1_BUILD_DIR:-$repo_dir/build-web}"
q2_build_dir="${IDTECH2_Q2_BUILD_DIR:-$repo_dir/engines/quake2/build-web}"
dist_dir="$repo_dir/web/dist"
framework_dir="${WASM_FRAMEWORK_DIR:-$repo_dir/../wasm-game-framework}"
build_type="${IDTECH2_BUILD_TYPE:-Release}"
jobs="${IDTECH2_BUILD_JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || printf '2')}"
required_framework_version="0.9.4"
required_framework_commit="c4ad3b9e075f881d32f044299fbfeee703a9169d"

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

cmake -E make_directory "$dist_dir/adapters"
for obsolete in index.html quake1.html owner-data.js service-worker.js app.webmanifest \
    wolfwasm-shell.js wolfwasm-shell.css wolfwasm-bootstrap.js quake1.data; do
    cmake -E rm -f "$dist_dir/$obsolete"
done

emcmake cmake -S "$repo_dir" -B "$q1_build_dir" \
    -UQUAKE_DATA_DIR \
    -DCMAKE_BUILD_TYPE="$build_type"
cmake --build "$q1_build_dir" --target quake1 --parallel "$jobs"

emcmake cmake -S "$repo_dir/engines/quake2" -B "$q2_build_dir" -G Ninja \
    -DCMAKE_BUILD_TYPE="$build_type"
cmake --build "$q2_build_dir" --target quake2 --parallel "$jobs"

cmake -E copy_if_different "$q2_build_dir/release/quake2.js" "$dist_dir/quake2.js"
cmake -E copy_if_different "$q2_build_dir/release/quake2.wasm" "$dist_dir/quake2.wasm"
cmake -E copy_if_different "$repo_dir/engines/quake2/stuff/icon/Quake2.ico" "$dist_dir/quake2.ico"
cmake -E copy_if_different "$repo_dir/web/quake-adapter.js" "$dist_dir/adapters/quake.js"
cmake -E copy_if_different "$repo_dir/engines/quake2/web/game-adapter.js" "$dist_dir/adapters/quake2.js"

magick "$repo_dir/WinQuake/quake.ico[4]" -filter point -resize 192x192 "$dist_dir/quake-192.png"
magick "$repo_dir/WinQuake/quake.ico[4]" -filter point -resize 512x512 "$dist_dir/quake-512.png"
magick "$repo_dir/engines/quake2/stuff/icon/Quake2.png" -resize 192x192 "$dist_dir/quake2-192.png"
cmake -E copy_if_different "$repo_dir/engines/quake2/stuff/icon/Quake2.png" "$dist_dir/quake2-512.png"

"$framework_dir/scripts/install-browser-package.sh" "$dist_dir/shared-shell" copy

printf 'Built Quake and Quake II family site at %s (framework %s/%s).\n' \
    "$dist_dir" "$required_framework_version" "$required_framework_commit"
