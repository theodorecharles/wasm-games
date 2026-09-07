#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work_root="${IDTECH4_WORK_ROOT:-${repo_root}/.work}"
source_root="${work_root}/d3wasm-roe-game"
build_root="${work_root}/d3-managed-native"
# Reuse the already pinned original dhewm3 game source, whose native dedicated
# server speaks the browser client's unmodified Doom 3 protocol 1.42. Do not
# revive the discarded custom browser renderer in .work/dhewm3.
expected="$(node -p "require('${repo_root}/source-lock.json').d3wasmRoeGame.commit")"
test "$(git -C "${source_root}" rev-parse HEAD)" = "${expected}"
cmake -S "${source_root}/neo" -B "${build_root}" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release -DCORE=OFF -DBASE=ON -DD3XP=OFF -DDEDICATED=ON
cmake --build "${build_root}" --parallel "${JOBS:-4}"
test -x "${build_root}/dhewm3ded"
test -s "${build_root}/base.so"
mkdir -p "${repo_root}/build/native"
install -m 0755 "${build_root}/dhewm3ded" "${build_root}/base.so" "${repo_root}/build/native/"
printf 'Built native managed Doom 3 server and base game in %s\n' "${build_root}"
