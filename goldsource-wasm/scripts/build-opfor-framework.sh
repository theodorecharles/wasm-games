#!/usr/bin/env bash
set -euo pipefail

# Opposing Force needs the dedicated HLSDK Portable opfor branch. Reusing the
# base Half-Life DLL makes of0a0 render, but its Osprey cinematic never advances.
OPFOR_REPO="https://github.com/theodorecharles/hlsdk-portable.git"
OPFOR_COMMIT="613eb55d5bcd257219c881297d1d43c1da4a7445"
EMSDK_IMAGE="emscripten/emsdk:4.0.23"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BUILD_ROOT="$(mktemp -d /tmp/goldsource-opfor-build.XXXXXX)"
SOURCE_DIR="${BUILD_ROOT}/source"
OUTPUT_DIR="${BUILD_ROOT}/output"

cleanup() {
  rm -rf -- "${BUILD_ROOT}"
}
trap cleanup EXIT

git clone --quiet --filter=blob:none --no-checkout "${OPFOR_REPO}" "${SOURCE_DIR}"
git -C "${SOURCE_DIR}" checkout --quiet "${OPFOR_COMMIT}"
git -C "${SOURCE_DIR}" submodule update --init --recursive --quiet
git -C "${SOURCE_DIR}" apply "${REPO_DIR}/patches/hlsdk-opfor-local-callbacks.patch"
mkdir -p "${OUTPUT_DIR}"

docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "${SOURCE_DIR}:/hlsdk-portable" \
  -v "${OUTPUT_DIR}:/out" \
  -w /hlsdk-portable \
  "${EMSDK_IMAGE}" bash -lc '
    emcmake cmake -S . -B build-wasm \
      -DCMAKE_BUILD_TYPE=Release \
      -DBUILD_CLIENT=ON \
      -DBUILD_SERVER=ON \
      -DCMAKE_C_FLAGS_RELEASE="-Oz -DNDEBUG -fvisibility=hidden -fno-semantic-interposition -sSIDE_MODULE=1" \
      -DCMAKE_CXX_FLAGS_RELEASE="-Oz -DNDEBUG -fvisibility=hidden -fno-semantic-interposition -fno-threadsafe-statics -sSIDE_MODULE=1"
    emmake cmake --build build-wasm -j4
    em++ -sSIDE_MODULE=1 -Oz -Wl,-Bsymbolic \
      -Wl,--whole-archive build-wasm/dlls/opfor_emscripten_wasm32.a build-wasm/game_shared/libvcs_info.a -Wl,--no-whole-archive \
      -o /out/opfor-server-framework.wasm
    em++ -sSIDE_MODULE=1 -Oz -Wl,-Bsymbolic \
      -Wl,--whole-archive build-wasm/cl_dll/client_emscripten_wasm32.a build-wasm/game_shared/libvcs_info.a -Wl,--no-whole-archive \
      -o /out/opfor-client-framework.wasm
  '

cp "${OUTPUT_DIR}/opfor-server-framework.wasm" "${REPO_DIR}/native/opfor-server-framework.wasm"
cp "${OUTPUT_DIR}/opfor-client-framework.wasm" "${REPO_DIR}/native/opfor-client-framework.wasm"
echo "Built Opposing Force client/server WASM from ${OPFOR_COMMIT}."
