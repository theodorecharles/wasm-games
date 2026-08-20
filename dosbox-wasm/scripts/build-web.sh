#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$repo_dir/vendor/dosbox"
build_dir="${BUILD_DIR:-$repo_dir/build-web}"
dist_dir="$repo_dir/web/dist"
emsdk_dir="${EMSDK_DIR:-/home/ted/emsdk}"
framework_dir="${WASM_FRAMEWORK_DIR:-$repo_dir/../wasm-game-framework}"
jobs="${JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || printf '8')}"
required_framework_version="0.9.4"
required_framework_commit="c4ad3b9e075f881d32f044299fbfeee703a9169d"

if [[ ! -f "$emsdk_dir/emsdk_env.sh" ]]; then
  printf 'Emscripten SDK environment not found at %s\n' "$emsdk_dir" >&2
  exit 1
fi
if [[ "$(node -p "require('${framework_dir}/package.json').version")" != "$required_framework_version" || \
      "$(git -C "$framework_dir" rev-parse HEAD)" != "$required_framework_commit" ]]; then
  printf 'dosbox-wasm requires wasm-game-framework %s at %s.\n' \
    "$required_framework_version" "$required_framework_commit" >&2
  exit 1
fi

source "$emsdk_dir/emsdk_env.sh" >/dev/null
mkdir -p "$build_dir"

cflags='-O2 -sUSE_SDL=1'
cxxflags='-O2 -sUSE_SDL=1 -Wno-register -fexceptions'
ldflags='-sUSE_SDL=1 -sMODULARIZE=1 -sEXPORT_NAME=createDosBoxModule -sALLOW_MEMORY_GROWTH=1 -sASYNCIFY=1 -sASYNCIFY_STACK_SIZE=131072 -sENVIRONMENT=web,worker,node -sEXIT_RUNTIME=0 -sDISABLE_EXCEPTION_CATCHING=0 -sEXPORTED_RUNTIME_METHODS=FS,callMain,ccall -lidbfs.js'
configure_ldflags='-sUSE_SDL=1 -sENVIRONMENT=web,worker,node'

if [[ ! -f "$build_dir/Makefile" ]]; then
  (
    cd "$build_dir"
    ac_cv_lib_X11_main=no \
    ac_cv_header_X11_XKBlib_h=no \
    SDL_CONFIG="$repo_dir/scripts/sdl-config-emscripten" \
    CFLAGS="$cflags" CXXFLAGS="$cxxflags" LDFLAGS="$configure_ldflags" \
      emconfigure "$source_dir/configure" \
        --host=wasm32-unknown-none \
        --disable-sdltest \
        --disable-dynamic-core \
        --disable-dynamic-x86 \
        --disable-dynrec \
        --disable-opengl \
        --disable-alsa-midi \
        --disable-fpu-x86
  )
fi

emmake make -C "$build_dir" -j"$jobs" CFLAGS="$cflags" CXXFLAGS="$cxxflags" LDFLAGS="$ldflags"

test -f "$build_dir/src/dosbox"
test -f "$build_dir/src/dosbox.wasm"
wasm-validate "$build_dir/src/dosbox.wasm"

rm -rf "$dist_dir"
mkdir -p "$dist_dir/assets"
cp "$build_dir/src/dosbox" "$dist_dir/dosbox.js"
cp "$build_dir/src/dosbox.wasm" "$dist_dir/dosbox.wasm"
cp "$repo_dir/web/game-adapter.js" "$dist_dir/game-adapter.js"
cp "$repo_dir/web/wasm-game.json" "$dist_dir/wasm-game.json"
cp "$repo_dir/web/wasm-game-data.json" "$dist_dir/wasm-game-data.json"
cp "$repo_dir/web/assets/dosbox.ico" "$dist_dir/assets/dosbox.ico"
cp "$repo_dir/web/assets/dosbox-192.png" "$dist_dir/assets/dosbox-192.png"
cp "$repo_dir/web/assets/dosbox-512.png" "$dist_dir/assets/dosbox-512.png"
"$framework_dir/scripts/install-browser-package.sh" "$dist_dir/shared-shell" copy
node "$framework_dir/scripts/check-game-package.js" "$dist_dir"

node --check "$dist_dir/dosbox.js"
node --check "$dist_dir/game-adapter.js"
printf 'Built DOSBox WebAssembly suite at %s.\n' "$dist_dir"
