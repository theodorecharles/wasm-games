#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
build_dir="${BUILD_WASM_BUILD_DIR:-$repo_dir/build-web}"
dist_dir="$build_dir/dist"
framework_dir="${WASM_FRAMEWORK_DIR:-$repo_dir/../wasm-game-framework}"
jobs="${BUILD_WASM_JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || printf '2')}"
required_framework_version="0.9.4"
required_framework_commit="c4ad3b9"

if ! command -v emcc >/dev/null 2>&1; then
    emsdk_dir="${EMSDK_DIR:-${EMSDK:-}}"
    if [[ -z "$emsdk_dir" || ! -f "$emsdk_dir/emsdk_env.sh" ]]; then
        printf 'Activate Emscripten or set EMSDK_DIR/EMSDK to an initialized emsdk checkout.\n' >&2
        exit 1
    fi
    export EMSDK_QUIET=1
    # shellcheck source=/dev/null
    source "$emsdk_dir/emsdk_env.sh" >/dev/null
fi

if [[ ! -x "$framework_dir/scripts/install-browser-package.sh" ]]; then
    printf 'WASM framework browser package not found at %s\n' "$framework_dir" >&2
    exit 1
fi
framework_version="$(node -p "require('${framework_dir}/package.json').version")"
framework_commit="$(git -C "$framework_dir" rev-parse --short=7 HEAD)"
if [[ "$framework_version" != "$required_framework_version" || "$framework_commit" != "$required_framework_commit" ]]; then
    printf 'Build WASM requires wasm-game-framework %s at %s; found %s at %s.\n' \
        "$required_framework_version" "$required_framework_commit" "$framework_version" "$framework_commit" >&2
    exit 1
fi
if ! command -v magick >/dev/null 2>&1; then
    printf 'ImageMagick is required to derive PWA icons from tracked source artwork.\n' >&2
    exit 1
fi

cmake -E make_directory "$dist_dir/adapters"
for obsolete in index.html index.js index.wasm index.data data-ingest.js service-worker.js app.webmanifest \
    wolfwasm-shell.js wolfwasm-shell.css wolfwasm-bootstrap.js; do
    cmake -E rm -f "$dist_dir/$obsolete"
done

common_flags=(
    -Wno-unsupported-floating-point-opt
    -sUSE_SDL=2
    -sUSE_VORBIS=1
)
base_link_flags=(
    -sUSE_SDL=2
    -sUSE_VORBIS=1
    -sALLOW_MEMORY_GROWTH=1
    -sASYNCIFY=1
    -sASYNCIFY_STACK_SIZE=64KB
    -sENVIRONMENT=web
    -sEXIT_RUNTIME=0
    -sEXPORTED_RUNTIME_METHODS=callMain,FS,addRunDependency,removeRunDependency
    -sSTACK_SIZE=1MB
    -lidbfs.js
)
make_options=(
    -f GNUmakefile
    -j"$jobs"
    PRETTY_OUTPUT=1
    PLATFORM=EMSCRIPTEN
    ARCH=wasm32
    CC=emcc
    CXX=em++
    CLANGNAME=emcc
    CLANGXXNAME=em++
    L_CC=emcc
    L_CXX=em++
    AR=emar
    RANLIB=emranlib
    STRIP=
    SDLCONFIG=
    EXESUFFIX=.js
    NETCODE=0
    STARTUP_WINDOW=0
    USE_OPENGL=0
    POLYMER=0
    USE_LIBVPX=0
    HAVE_VORBIS=1
    HAVE_FLAC=0
    HAVE_XMP=0
    USE_MIMALLOC=0
    RELEASE=1
    LTO=0
    CUSTOMOPT="${common_flags[*]}"
    CFLAGS=-sUSE_SDL=2
)

blood_link_flags=("${base_link_flags[@]}" --preload-file "$repo_dir/nblood.pk3@/game/nblood.pk3")
printf '[Build WASM] Building native NBlood classic target.\n'
make -C "$repo_dir" "${make_options[@]}" blood \
    obj="${build_dir#$repo_dir/}/obj-blood" \
    blood_game="${dist_dir#$repo_dir/}/blood" \
    LDFLAGS="${blood_link_flags[*]}"

printf '[Build WASM] Building native EDuke32 classic target.\n'
make -C "$repo_dir" "${make_options[@]}" duke3d \
    obj="${build_dir#$repo_dir/}/obj-duke3d" \
    duke3d_game="${dist_dir#$repo_dir/}/duke3d" \
    LDFLAGS="${base_link_flags[*]}"

cmake -E copy_if_different "$repo_dir/web/game-adapter.js" "$dist_dir/game-adapter.js"
cmake -E copy_if_different "$repo_dir/web/blood-adapter.js" "$dist_dir/adapters/blood.js"
cmake -E copy_if_different "$repo_dir/web/duke3d-adapter.js" "$dist_dir/adapters/duke3d.js"
cmake -E copy_if_different "$repo_dir/web/wasm-game.json" "$dist_dir/wasm-game.json"
cmake -E copy_if_different "$repo_dir/web/wasm-game-data.json" "$dist_dir/wasm-game-data.json"
cmake -E copy_if_different "$repo_dir/source/blood/rsrc/game_icon.ico" "$dist_dir/blood.ico"
cmake -E copy_if_different "$repo_dir/source/duke3d/rsrc/game_icon.ico" "$dist_dir/duke3d.ico"
magick "$repo_dir/source/blood/rsrc/game_icon.ico[10]" -resize 192x192 "$dist_dir/blood-192.png"
magick "$repo_dir/source/blood/rsrc/game_icon.ico[10]" -resize 512x512 "$dist_dir/blood-512.png"
magick "$repo_dir/source/duke3d/rsrc/game_icon.ico[10]" -resize 192x192 "$dist_dir/duke3d-192.png"
magick "$repo_dir/source/duke3d/rsrc/game_icon.ico[10]" -resize 512x512 "$dist_dir/duke3d-512.png"

"$framework_dir/scripts/install-browser-package.sh" "$dist_dir/shared-shell" copy
node "$framework_dir/scripts/check-game-package.js" "$dist_dir"
printf 'Built Blood and Duke Nukem 3D family site at %s (framework %s/%s).\n' \
    "$dist_dir" "$required_framework_version" "$required_framework_commit"
