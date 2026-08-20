#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work_root="${IDTECH4_WORK_ROOT:-${repo_root}/.work}"
framework_dir="${WASM_GAME_FRAMEWORK_DIR:-${work_root}/wasm-game-framework}"
jobs="${JOBS:-4}"
meson="$("${repo_root}/scripts/ensure-build-tools.sh")"

"${repo_root}/scripts/apply-patches.sh"

test "$(node -p "require('${framework_dir}/package.json').version")" = "0.9.2"
test "$(git -C "${framework_dir}" rev-parse HEAD)" = "53bc7e6eeef1ae35dcf3b25dea4e3ec0ab46726f"

D3WASM_FRAMEWORK_DIR="${framework_dir}" JOBS="${jobs}" \
  "${work_root}/dhewm3/scripts/build-web.sh"
Q4WASM_FRAMEWORK_DIR="${framework_dir}" \
OPENQ4_GAMELIBS_REPO="${work_root}/openq4-game" \
OPENQ4_MESON="${meson}" \
JOBS="${jobs}" \
  "${work_root}/openq4/scripts/build-web.sh"

export EMSDK_QUIET=1
if ! command -v emcmake >/dev/null 2>&1; then
  if [[ -n "${EMSDK_DIR:-}" && -f "${EMSDK_DIR}/emsdk_env.sh" ]]; then
    # shellcheck disable=SC1090
    source "${EMSDK_DIR}/emsdk_env.sh"
  else
    echo "Activate Emscripten or set EMSDK_DIR before building Prey." >&2
    exit 1
  fi
fi
emcmake cmake -S "${work_root}/prey2006/neo" -B "${work_root}/prey2006/build/web" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DPREYWASM_CLIENT=ON \
  -DREPRODUCIBLE_BUILD=ON
cmake --build "${work_root}/prey2006/build/web" --parallel "${jobs}"

"${repo_root}/scripts/stage-site.sh"
