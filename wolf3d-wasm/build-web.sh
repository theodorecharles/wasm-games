#!/usr/bin/env bash
set -euo pipefail

engine_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source_dir="$("${engine_dir}/scripts/fetch-source")"
node "$engine_dir/scripts/test-source.mjs"
node "$engine_dir/scripts/test-source-preparation.mjs"
dist_dir="$engine_dir/.work/dist"
framework_dir="${WASM_FRAMEWORK_DIR:-/home/ted/Development/wasm-game-framework}"
required_framework_version="0.9.6"
required_framework_commit="ebb1ebe35ad8224a9080279a6529414db42d3284"
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

if command -v magick >/dev/null 2>&1; then
    image_command=magick
elif command -v convert >/dev/null 2>&1 && convert -version | head -n 1 | grep -q ImageMagick; then
    image_command=convert
else
    printf 'ImageMagick is required to build the authentic PWA icons.\n' >&2
    exit 1
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
    emmake make -C "$source_dir" clean WEB=1 WEB_VARIANT="$variant" \
        CC=emcc CXX=em++ BINARY="$dist_dir/$output.js"
    emmake make -C "$source_dir" -j"${JOBS:-4}" \
        WEB=1 \
        WEB_VARIANT="$variant" \
        CC=emcc \
        CXX=em++ \
        BINARY="$dist_dir/$output.js"
}

build_variant wolf3d wolf3d
build_variant spear spear
node "$engine_dir/scripts/test-menu-pointer.mjs"
node "$engine_dir/scripts/test-keyboard-movement.mjs"
node "$engine_dir/scripts/test-menu-key-pump.mjs"
node "$engine_dir/scripts/test-palette-present.mjs"
node "$engine_dir/scripts/test-gameplay-input.mjs"
node "$engine_dir/scripts/test-key-bindings.mjs"

cp "$engine_dir/web/game-adapter.js" "$engine_dir/web/wasm-game.json" \
    "$engine_dir/web/wasm-game-data.json" "$dist_dir/"
cp "$source_dir/win/Wolf4SDL.ico" "$dist_dir/wolf3d.ico"
"$image_command" "$source_dir/win/Wolf4SDL.ico[1]" -filter point -resize 192x192 "$dist_dir/wolf3d-192.png"
"$image_command" "$source_dir/win/Wolf4SDL.ico[1]" -filter point -resize 512x512 "$dist_dir/wolf3d-512.png"
"$framework_dir/scripts/install-browser-package.sh" "$dist_dir/shared-shell" copy
cp "$dist_dir/shared-shell/wasm-game-framework.json" "$dist_dir/wasm-game-framework.json"

printf '[Wolf4SDL WASM] Canonical browser package %s ready under %s\n' "$required_framework_version" "$dist_dir"
