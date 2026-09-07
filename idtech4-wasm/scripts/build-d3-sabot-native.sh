#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_root="${D3_SABOT_SOURCE:-${repo_root}/.work/d3-managed-sabot-source}"
build_root="${D3_SABOT_NATIVE:-${repo_root}/.work/d3-managed-sabot}"
test "$(git -C "${source_root}" rev-parse HEAD)" = 31e877e7e4e691ed9f98603da9cd95ac59540cf3
test -s "${source_root}/neo/game/bots/BotAI.cpp"
cmake -S "${source_root}/neo" -B "${build_root}" -G Ninja \
  -DCMAKE_BUILD_TYPE=RelWithDebInfo -DCORE=OFF -DBASE=ON -DD3XP=OFF -DDEDICATED=ON
cmake --build "${build_root}" --parallel "${JOBS:-4}"
test -x "${build_root}/dhewm3ded"
test -s "${build_root}/base.so"
printf 'Experimental SABot binaries: %s (not staged or installed)\n' "${build_root}"
