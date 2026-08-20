#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="${LIBTESS2_SOURCE_DIR:-${repo_dir}/references/libtess2}"
source_url="https://github.com/memononen/libtess2.git"
source_commit="8dbd6483e920311a58c9af10a10beb278efebc36"

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
    echo "libtess2 source is ${actual_commit}; expected pinned ${source_commit}." >&2
    exit 1
fi

printf '%s\n' "${source_dir}"
