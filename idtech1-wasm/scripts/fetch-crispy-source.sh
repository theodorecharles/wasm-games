#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="${IDTECH1_CRISPY_SOURCE_DIR:-${repo_dir}/.work/crispy-doom}"
repository="https://github.com/theodorecharles/idtech1-wasm.git"
commit="7775ef82d1e9dfd50eb9d2824acefaeff7247458"
patch_files=(
  "${repo_dir}/patches/crispy-browser.patch"
  "${repo_dir}/patches/crispy-cooperative-main-loop.patch"
  "${repo_dir}/patches/crispy-lobby-telemetry.patch"
  "${repo_dir}/patches/crispy-websocket.patch"
  "${repo_dir}/patches/crispy-multiplayer-telemetry.patch"
  "${repo_dir}/patches/crispy-browser-sleep.patch"
)

if [[ ! -d "${source_dir}/.git" ]]; then
  mkdir -p "$(dirname "${source_dir}")"
  git clone --filter=blob:none --no-checkout "${repository}" "${source_dir}" >&2
  git -C "${source_dir}" checkout --detach "${commit}" >&2
  for patch_file in "${patch_files[@]}"; do
    git -C "${source_dir}" apply "${patch_file}"
  done
fi

actual_origin="$(git -C "${source_dir}" remote get-url origin)"
actual_commit="$(git -C "${source_dir}" rev-parse HEAD)"
if [[ "${actual_origin}" != "${repository}" || "${actual_commit}" != "${commit}" ]]; then
  echo "Unexpected Crispy source checkout at ${source_dir}." >&2
  exit 1
fi
if ! git -C "${source_dir}" diff --check; then
  echo "The patched Crispy browser source has whitespace errors at ${source_dir}." >&2
  exit 1
fi
grep -Fq 'I_BrowserSetMainLoop' "${source_dir}/src/i_browser.c"
grep -Fq 'I_BrowserSetMainLoop(D_RunFrame)' "${source_dir}/src/doom/d_main.c"
grep -Fq 'I_BrowserSetMainLoop(D_RunFrame)' "${source_dir}/src/heretic/d_main.c"
grep -Fq 'I_BrowserSetMainLoop(H2_RunFrame)' "${source_dir}/src/hexen/h2_main.c"
grep -Fq 'I_BrowserPlayerCount' "${source_dir}/src/i_browser.c"
grep -Fq 'net_websockets_module.InitClient' "${source_dir}/src/d_loop.c"
grep -Fq 'emscripten_sleep(timeout > 0 ? timeout : 10)' "${source_dir}/textscreen/txt_sdl.c"

# Do not retain upstream Markdown in ignored build trees.
find "${source_dir}" -type f -name '*.md' -delete

printf '%s\n' "${source_dir}"
