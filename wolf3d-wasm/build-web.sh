#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dist_dir="$repo_dir/build-web/dist"
framework_dir="${WASM_FRAMEWORK_DIR:-$repo_dir/../wasm-game-framework}"
required_framework_version="0.9.4"
required_framework_commit="c4ad3b9e075f881d32f044299fbfeee703a9169d"
framework_version="$(node -p "require('$framework_dir/package.json').version")"
framework_commit="$(git -C "$framework_dir" rev-parse HEAD)"

if [[ "$framework_version" != "$required_framework_version" || "$framework_commit" != "$required_framework_commit" ]]; then
    printf 'Wolf3D WASM requires wasm-game-framework %s at %s; found %s at %s.\n' \
        "$required_framework_version" "$required_framework_commit" "$framework_version" "$framework_commit" >&2
    exit 1
fi

if ! command -v emcc >/dev/null 2>&1; then
    emsdk_dir="${EMSDK_DIR:-${EMSDK:-}}"
    if [[ -z "$emsdk_dir" || ! -f "$emsdk_dir/emsdk_env.sh" ]]; then
        printf 'Activate Emscripten first, or set EMSDK_DIR to an emsdk checkout.\n' >&2
        exit 1
    fi
    # shellcheck source=/dev/null
    source "$emsdk_dir/emsdk_env.sh" >/dev/null
fi

mkdir -p "$dist_dir"
rm -f \
    "$dist_dir/index.html" \
    "$dist_dir/index.js" \
    "$dist_dir/index.wasm" \
    "$dist_dir/index.data" \
    "$dist_dir/wolf3d.html" \
    "$dist_dir/wolf3d.js" \
    "$dist_dir/wolf3d.wasm" \
    "$dist_dir/spear.js" \
    "$dist_dir/spear.wasm" \
    "$dist_dir/wolf3d.data"

build_variant() {
    local variant="$1"
    local output="$2"
    emmake make -C "$repo_dir" clean WEB=1 WEB_VARIANT="$variant" \
        CC=emcc CXX=em++ BINARY="build-web/dist/$output.js"
    emmake make -C "$repo_dir" -j"$(nproc)" \
        WEB=1 \
        WEB_VARIANT="$variant" \
        CC=emcc \
        CXX=em++ \
        BINARY="build-web/dist/$output.js"
}

build_variant wolf3d wolf3d
build_variant spear spear

cp "$repo_dir/web/game-adapter.js" "$repo_dir/web/wasm-game.json" \
    "$repo_dir/web/wasm-game-data.json" "$dist_dir/"
cp "$repo_dir/win/Wolf4SDL.ico" "$dist_dir/wolf3d.ico"
if command -v magick >/dev/null 2>&1; then
    magick "$repo_dir/win/Wolf4SDL.ico[1]" -filter point -resize 192x192 "$dist_dir/wolf3d-192.png"
    magick "$repo_dir/win/Wolf4SDL.ico[1]" -filter point -resize 512x512 "$dist_dir/wolf3d-512.png"
else
    printf 'ImageMagick is required to build the authentic PWA icons.\n' >&2
    exit 1
fi
"$framework_dir/scripts/install-browser-package.sh" "$dist_dir/shared-shell" copy
cp "$dist_dir/shared-shell/wasm-game-framework.json" "$dist_dir/wasm-game-framework.json"

printf '[Wolf4SDL WASM] Canonical browser package %s ready under %s\n' "$required_framework_version" "$dist_dir"
