#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_root="${D3_SABOT_WASM_SOURCE:-${repo_root}/.work/d3-sabot-wasm-reproduced-source}"
build_root="${D3_SABOT_WASM_BUILD:-${source_root}/build-wasm}"
test "$(git -c safe.directory="${source_root}" -C "${source_root}" rev-parse HEAD)" = 48f8f65d1216db3ee0b11872bb3b413febadc669
sdk_version="$(emcc --version)"
[[ "${sdk_version%%$'\n'*}" =~ (^|\ )6\.0\.6(\ |$) ]]
test -s "${source_root}/neo/game/bots/BotAI.cpp"
emcmake cmake -S "${source_root}/neo" -B "${build_root}" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release -DD3WASM_GAME=base \
  -DCMAKE_MAKE_PROGRAM="${repo_root}/scripts/ninja"
cmake --build "${build_root}" --parallel "${JOBS:-4}"
test -s "${build_root}/d3wasm.js"
test -s "${build_root}/d3wasm.wasm"
printf 'Experimental SABot Wasm: %s (not staged or installed)\n' "${build_root}"
