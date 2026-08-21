#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$(${repo_dir}/scripts/fetch-zandronum-source.sh)"
zstd_source="$(${repo_dir}/scripts/fetch-zstd-source.sh)"
native_build="${ZANDRONUM_NATIVE_BUILD_DIR:-${repo_dir}/.work/zandronum-native}"
wasm_build="${ZANDRONUM_WASM_BUILD_DIR:-${repo_dir}/.work/zandronum-wasm}"
zstd_build="${ZSTD_WASM_BUILD_DIR:-${repo_dir}/.work/zstd-wasm}"
dist_dir="${repo_dir}/web/dist"
jobs="${IDTECH1_BUILD_JOBS:-$(nproc)}"

if ! command -v emcc >/dev/null 2>&1; then
    emsdk_dir="${EMSDK_DIR:-${EMSDK:-}}"
    if [[ -z "${emsdk_dir}" || ! -f "${emsdk_dir}/emsdk_env.sh" ]]; then
        echo "Activate Emscripten 6.0.6 or set EMSDK_DIR." >&2
        exit 1
    fi
    # shellcheck disable=SC1091
    source "${emsdk_dir}/emsdk_env.sh" >/dev/null
fi

emcc_path="$(readlink -f "$(command -v emcc)")"
emscripten_root="$(dirname "${emcc_path}")"
sdl_include="${EMSCRIPTEN_SDL_INCLUDE_DIR:-${emscripten_root}/cache/sysroot/include/SDL}"
if [[ ! -d "${sdl_include}" ]]; then
    sdl_include="${emscripten_root}/system/include/SDL"
fi
if [[ ! -d "${sdl_include}" ]]; then
    echo "Could not locate Emscripten's SDL 1 headers; set EMSCRIPTEN_SDL_INCLUDE_DIR." >&2
    exit 1
fi

if [[ ! -s "${native_build}/ImportExecutables.cmake" || ! -x "${native_build}/zandronum-server" ]]; then
    cmake -S "${source_dir}" -B "${native_build}" \
        -DCMAKE_BUILD_TYPE=Release \
        -DSERVERONLY=ON -DNO_ASM=ON -DNO_GTK=ON \
        -DFORCE_INTERNAL_ZLIB=ON -DFORCE_INTERNAL_JPEG=ON \
        -DFORCE_INTERNAL_BZIP2=ON -DFORCE_INTERNAL_GME=ON \
        -DRELEASE_WITH_DEBUG_FILE=OFF
    cmake --build "${native_build}" --parallel "${jobs}" --target zdoom
fi

emcmake cmake -S "${zstd_source}/build/cmake" -B "${zstd_build}" \
    -DCMAKE_BUILD_TYPE=Release \
    -DZSTD_BUILD_PROGRAMS=OFF -DZSTD_BUILD_TESTS=OFF \
    -DZSTD_BUILD_SHARED=OFF -DZSTD_BUILD_STATIC=ON
cmake --build "${zstd_build}" --parallel "${jobs}"

emcmake cmake -S "${source_dir}" -B "${wasm_build}" \
    -DCMAKE_BUILD_TYPE=Release \
    -DFORCE_CROSSCOMPILE=ON \
    -DIMPORT_EXECUTABLES="${native_build}/ImportExecutables.cmake" \
    -DNO_ASM=ON -DNO_GTK=ON -DNO_LIBSECRET=ON -DNO_GL=ON -DNO_SOUND=ON \
    -DDYN_FLUIDSYNTH=OFF \
    -DFORCE_INTERNAL_ZLIB=ON -DFORCE_INTERNAL_JPEG=ON \
    -DFORCE_INTERNAL_BZIP2=ON -DFORCE_INTERNAL_GME=ON \
    -DRELEASE_WITH_DEBUG_FILE=OFF \
    -DSDL_INCLUDE_DIR="${sdl_include}" \
    -DSDL_LIBRARY='-sUSE_SDL=1' \
    -DZSTD_INCLUDE_DIR="${zstd_source}/lib" \
    -DZSTD_LIBRARY="${zstd_build}/lib/libzstd.a"
cmake --build "${wasm_build}" --parallel "${jobs}" --target zdoom

mkdir -p "${dist_dir}"
install -m 0644 "${wasm_build}/zandronum.js" "${dist_dir}/zandronum.js"
install -m 0644 "${wasm_build}/zandronum.wasm" "${dist_dir}/zandronum.wasm"
for asset in zandronum.pk3 brightmaps.pk3 skulltag_actors.pk3; do
    install -m 0644 "${native_build}/${asset}" "${dist_dir}/${asset}"
done

node --check "${dist_dir}/zandronum.js"
test "$(od -An -tx1 -N4 "${dist_dir}/zandronum.wasm" | tr -d ' \n')" = "0061736d"
test -x "${native_build}/zandronum-server"
printf 'Zandronum browser client: %s\nZandronum dedicated server: %s\n' \
    "${dist_dir}/zandronum.wasm" "${native_build}/zandronum-server"
