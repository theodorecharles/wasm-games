#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="${DSDA_SOURCE_DIR:-${repo_dir}/references/dsda-doom}"
source_url="https://github.com/kraflab/dsda-doom.git"
source_commit="ae7c280cd08047c399283bebcfaeeb3e9ecb8e6d"
patch_file="${repo_dir}/patches/dsda-wasm.patch"

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
    echo "DSDA source is ${actual_commit}; expected pinned ${source_commit}." >&2
    echo "Use a clean checkout at the pinned revision; this script will not overwrite local work." >&2
    exit 1
fi

if git -C "${source_dir}" apply --check "${patch_file}" 2>/dev/null; then
    git -C "${source_dir}" apply "${patch_file}"
elif git -C "${source_dir}" apply --reverse --check "${patch_file}" 2>/dev/null; then
    : # The deterministic downstream patch is already present.
else
    echo "DSDA source has changes that do not match the downstream patch." >&2
    exit 1
fi

find "${source_dir}" -type f -name '*.md' -delete

printf '%s\n' "${source_dir}"
