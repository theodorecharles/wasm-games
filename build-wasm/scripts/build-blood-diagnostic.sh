#!/usr/bin/env bash
# Isolated native diagnostic build. Never stages into the production web tree.
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
command -v emcc >/dev/null || { echo 'Activate Emscripten before building the diagnostic.' >&2; exit 1; }
prepared="$(bash "$repo/scripts/fetch-source")"
pin="$(node -p "require('$repo/games/blood/sources.json').repositories[0].commit")"
diagnostic="$(mktemp -d "$repo/.work/blood-diagnostic.XXXXXX")"
source_dir="$diagnostic/source"
mkdir "$diagnostic/dist"
# Copy the object store: the retained diagnostic must not depend on a deleted
# temporary checkout or alternates file, as the old prepared checkout did.
git clone --no-hardlinks --no-checkout "$prepared" "$source_dir"
git -C "$source_dir" checkout --detach "$pin"
git -C "$source_dir" remote set-url origin https://github.com/theodorecharles/build-wasm.git
git -C "$source_dir" remote set-url --push origin DISABLED
BUILD_ENGINE_SOURCE_DIR="$source_dir" bash "$repo/scripts/fetch-source"
git -C "$source_dir" apply --check "$repo/tests/blood-diagnostics.patch"
git -C "$source_dir" apply "$repo/tests/blood-diagnostics.patch"
install -m 0644 "$repo/tests/blood-diagnostics.cpp" "$source_dir/source/blood/src/wasm_test.h"

# Match build-web.sh's classic Blood target; retain names for crash traces.
make -C "$source_dir" -f GNUmakefile -j"${BUILD_WASM_JOBS:-8}" \
    PRETTY_OUTPUT=1 PLATFORM=EMSCRIPTEN ARCH=wasm32 \
    CC=emcc CXX=em++ CLANGNAME=emcc CLANGXXNAME=em++ L_CC=emcc L_CXX=em++ \
    AR=emar RANLIB=emranlib STRIP= SDLCONFIG= EXESUFFIX=.js NETCODE=0 \
    STARTUP_WINDOW=0 USE_OPENGL=0 POLYMER=0 USE_LIBVPX=0 HAVE_VORBIS=1 \
    HAVE_FLAC=0 HAVE_XMP=0 USE_MIMALLOC=0 RELEASE=1 LTO=0 \
    CUSTOMOPT='-Wno-unsupported-floating-point-opt -sUSE_SDL=2 -sUSE_VORBIS=1 -g2' \
    CFLAGS=-sUSE_SDL=2 blood obj="$diagnostic/obj" blood_game="$diagnostic/dist/blood" \
    LDFLAGS="-sUSE_SDL=2 -sUSE_VORBIS=1 -sALLOW_MEMORY_GROWTH=1 -sASYNCIFY=1 -sASYNCIFY_STACK_SIZE=64KB -sENVIRONMENT=web -sEXIT_RUNTIME=0 -sEXPORTED_RUNTIME_METHODS=callMain,FS,addRunDependency,removeRunDependency -sSTACK_SIZE=1MB -lidbfs.js -g2 --preload-file $source_dir/nblood.pk3@/game/nblood.pk3"
printf 'Diagnostic artifacts (not deployed): %s/dist\n' "$diagnostic"
