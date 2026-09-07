#!/usr/bin/env bash
# Isolated NBlood GPU build; does not replace Classic or any running service.
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
command -v emcc >/dev/null || { echo 'Activate Emscripten before building.' >&2; exit 1; }
source_dir="$(bash "$repo/scripts/fetch-source")"
candidate="${BLOOD_MODERNIZED_BUILD_DIR:-$repo/.work/blood-modernized}"
mkdir -p "$candidate/dist"
# Native make does not track JS-library inputs; force the final link.
force_link=()
if [[ -f "$candidate/obj/build/rev.o" ]]; then force_link=(-W "$candidate/obj/build/rev.o"); fi
make -C "$source_dir" -f GNUmakefile -j"${BUILD_WASM_JOBS:-4}" "${force_link[@]}" \
    PRETTY_OUTPUT=1 PLATFORM=EMSCRIPTEN ARCH=wasm32 \
    CC=emcc CXX=em++ CLANGNAME=emcc CLANGXXNAME=em++ L_CC=emcc L_CXX=em++ \
    AR=emar RANLIB=emranlib STRIP= SDLCONFIG= EXESUFFIX=.js NETCODE=0 \
    STARTUP_WINDOW=0 USE_OPENGL=1 POLYMER=0 USE_LIBVPX=0 HAVE_VORBIS=1 \
    HAVE_FLAC=0 HAVE_XMP=0 USE_MIMALLOC=0 RELEASE=1 LTO=0 \
    CUSTOMOPT='-Wno-unsupported-floating-point-opt -sUSE_SDL=2 -sUSE_VORBIS=1 -g2' \
    CFLAGS=-sUSE_SDL=2 blood obj="$candidate/obj" blood_game="$candidate/dist/blood" \
    LDFLAGS="-sUSE_SDL=2 -sUSE_VORBIS=1 -sALLOW_MEMORY_GROWTH=1 -sASYNCIFY=1 -sASYNCIFY_STACK_SIZE=64KB -sENVIRONMENT=web -sEXIT_RUNTIME=0 -sEXPORTED_RUNTIME_METHODS=callMain,FS,addRunDependency,removeRunDependency -sSTACK_SIZE=1MB -lidbfs.js -sLEGACY_GL_EMULATION=1 -sMIN_WEBGL_VERSION=2 -sMAX_WEBGL_VERSION=2 -sASSERTIONS=1 -sGL_ASSERTIONS=1 -g2 --js-library=$repo/web/polymost-glsl.js --pre-js=$repo/tests/polymost-errors.js --preload-file=$source_dir/nblood.pk3@/game/nblood.pk3"
printf 'Isolated GPU candidate (not staged or deployed): %s/dist\n' "$candidate"
