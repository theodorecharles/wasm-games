#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cache_dir="${CHEX_SUPPORT_CACHE:-${repo_dir}/build-chex-support}"
archive="${cache_dir}/chexdeh.zip"
expected_sha256="eeed61747165a4a90c792cf4ae4572593ff36a8f87d365af5107f68ed4000bad"

mkdir -p "${cache_dir}"
if [[ ! -f "${archive}" ]] || [[ "$(sha256sum "${archive}" | awk '{print $1}')" != "${expected_sha256}" ]]; then
    curl -fL --retry 3 \
      -o "${archive}" \
      https://www.gamers.org/pub/idgames/themes/chex/chexdeh.zip
fi

actual_sha256="$(sha256sum "${archive}" | awk '{print $1}')"
if [[ "${actual_sha256}" != "${expected_sha256}" ]]; then
    echo "Chex support archive checksum mismatch." >&2
    exit 1
fi

unzip -jo "${archive}" chex.deh chexdeh.txt -d "${cache_dir}" >/dev/null
install -m 0644 "${cache_dir}/chex.deh" "${repo_dir}/web/dist/chex.deh"
install -m 0644 "${cache_dir}/chexdeh.txt" "${repo_dir}/web/dist/chexdeh.txt"
