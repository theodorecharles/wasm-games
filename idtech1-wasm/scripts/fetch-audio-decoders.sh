#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="${DR_LIBS_SOURCE_DIR:-${repo_dir}/.work/dr_libs}"
source_commit="dfe8377631000664666519fdb83da193fd8037f4"
if [[ ! -d "${source_dir}/.git" ]]; then
    git clone --filter=blob:none --no-checkout https://github.com/mackron/dr_libs.git "${source_dir}"
    git -C "${source_dir}" remote rename origin upstream
    git -C "${source_dir}" remote set-url --push upstream DISABLED
    git -C "${source_dir}" fetch --depth=1 upstream "${source_commit}"
    git -C "${source_dir}" switch --detach "${source_commit}"
fi
if [[ "$(git -C "${source_dir}" rev-parse HEAD)" != "${source_commit}" ]]; then
    echo "dr_libs source does not match pinned ${source_commit}; preserving local checkout." >&2
    exit 1
fi
git -C "${source_dir}" diff --exit-code -- dr_flac.h dr_wav.h LICENSE >&2
printf '%s\n' "${source_dir}"
