#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work_root="${IDTECH4_WORK_ROOT:-${repo_root}/.work}"
framework_dir="${WASM_GAME_FRAMEWORK_DIR:-${work_root}/wasm-game-framework}"
jobs="${JOBS:-4}"
required_emscripten="$(node -p "require('${repo_root}/source-lock.json').buildTools.emscripten")"

if ! command -v emcc >/dev/null 2>&1; then
  if [[ -n "${EMSDK_DIR:-}" && -f "${EMSDK_DIR}/emsdk_env.sh" ]]; then
    export EMSDK_QUIET=1
    # shellcheck disable=SC1090
    source "${EMSDK_DIR}/emsdk_env.sh"
  else
    echo "Activate Emscripten ${required_emscripten} or set EMSDK_DIR." >&2
    exit 1
  fi
fi
if [[ "$(emcc --version | head -n 1)" != *" ${required_emscripten} ("* ]]; then
  echo "idTech 4 requires Emscripten ${required_emscripten}." >&2
  exit 1
fi

meson="$("${repo_root}/scripts/ensure-build-tools.sh")"
ninja_package_version="$(node -p "require('${repo_root}/source-lock.json').buildTools.ninjaPackage")"
tools_dir="${IDTECH4_TOOLS_DIR:-${work_root}/build-tools}"
export PATH="${repo_root}/scripts:${PATH}"
test -x "${tools_dir}/ninja-${ninja_package_version}/bin/ninja"
embuilder build sdl2

"${repo_root}/scripts/apply-patches.sh"
openq4_assets="$("${repo_root}/scripts/fetch-openq4-assets.sh")"

test "$(node -p "require('${framework_dir}/package.json').version")" = "0.9.6"
test "$(git -C "${framework_dir}" rev-parse HEAD)" = "ebb1ebe35ad8224a9080279a6529414db42d3284"

emcmake cmake -S "${work_root}/d3wasm/neo" -B "${work_root}/d3wasm/build-wasm" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DD3WASM_GAME=base
cmake --build "${work_root}/d3wasm/build-wasm" --parallel "${jobs}"

emcmake cmake -S "${work_root}/d3wasm/neo" -B "${work_root}/d3wasm/build-wasm-roe" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DD3WASM_GAME=roe \
  -DD3WASM_D3XP_SOURCE_DIR="${work_root}/d3wasm-roe-game"
cmake --build "${work_root}/d3wasm/build-wasm-roe" --parallel "${jobs}"
Q4WASM_FRAMEWORK_DIR="${framework_dir}" \
Q4WASM_WEB_BUILD_DIR="${work_root}/openq4/build/web-meson-${required_emscripten}" \
OPENQ4_GAMELIBS_REPO="${work_root}/openq4-game" \
OPENQ4_PREBUILT_PAK_DIR="${openq4_assets}" \
OPENQ4_MESON="${meson}" \
JOBS="${jobs}" \
  "${work_root}/openq4/scripts/build-web.sh"

emcmake cmake -S "${work_root}/prey-d3wasm/neo" -B "${work_root}/prey-d3wasm/build/web-d3wasm" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DPREYWASM_CLIENT=ON \
  -DREPRODUCIBLE_BUILD=ON
cmake --build "${work_root}/prey-d3wasm/build/web-d3wasm" --parallel "${jobs}"

"${repo_root}/scripts/stage-site.sh"
