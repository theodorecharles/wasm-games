#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="${ZANDRONUM_SOURCE_DIR:-${repo_dir}/.work/zandronum}"
source_url="https://github.com/torrsamaho/zandronum.git"
source_commit="bdd0f7beb43d9786cc13502395f60aa84d34e28d"
patch_file="${repo_dir}/patches/zandronum-wasm.patch"

if [[ ! -d "${source_dir}/.git" ]]; then
    mkdir -p "$(dirname "${source_dir}")"
    git clone --filter=blob:none --no-checkout "${source_url}" "${source_dir}"
    git -C "${source_dir}" remote rename origin upstream
    git -C "${source_dir}" remote set-url --push upstream DISABLED
    git -C "${source_dir}" fetch --depth=1 upstream "${source_commit}"
    git -C "${source_dir}" switch --detach "${source_commit}"
fi

actual_commit="$(git -C "${source_dir}" rev-parse HEAD)"
if [[ "${actual_commit}" != "${source_commit}" ]]; then
    echo "Zandronum source is ${actual_commit}; expected pinned ${source_commit}." >&2
    echo "Use a clean checkout at the pinned revision; this script will not overwrite local work." >&2
    exit 1
fi

if git -C "${source_dir}" apply --check "${patch_file}" 2>/dev/null; then
    git -C "${source_dir}" apply "${patch_file}"
elif git -C "${source_dir}" apply --reverse --check "${patch_file}" 2>/dev/null; then
    : # The deterministic browser patch is already present.
else
    echo "Zandronum source has changes that do not match the browser patch." >&2
    exit 1
fi

git -C "${source_dir}" diff --check
grep -Fq 'emscripten_websocket_send_binary' "${source_dir}/src/network.cpp"
grep -Fq 'I_BrowserControllerMouse' "${source_dir}/src/sdl/i_input.cpp"
grep -Fq 'SDL.defaults.discardOnLock = true' "${source_dir}/src/sdl/sdlvideo.cpp"
grep -Fq 'I_BrowserPlayerCount' "${source_dir}/src/d_main.cpp"

printf '%s\n' "${source_dir}"
