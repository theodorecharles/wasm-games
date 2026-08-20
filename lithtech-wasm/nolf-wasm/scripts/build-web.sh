#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if ! command -v emcc >/dev/null 2>&1; then
  emsdk_dir="${EMSDK_DIR:-${EMSDK:-${HOME}/emsdk}}"
  if [[ -f "${emsdk_dir}/emsdk_env.sh" ]]; then
    # shellcheck source=/dev/null
    source "${emsdk_dir}/emsdk_env.sh" >/dev/null
  fi
fi
if ! command -v emcmake >/dev/null 2>&1; then
  echo "Activate Emscripten first, or set EMSDK_DIR." >&2
  exit 1
fi
build="${root}/build-web"
emcmake cmake -S "${root}/native" -B "${build}"
cmake --build "${build}" -j"$(nproc)"
if [[ -f "${build}/dist/nolf-game.mjs" ]]; then
  cp -f "${build}/dist/nolf-game.mjs" "${root}/web/nolf-game.mjs"
  cp -f "${build}/dist/nolf-game.wasm" "${root}/web/nolf-game.wasm"
fi
echo "NOLF game module staged under web/"
