#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
lock_file="${repo_root}/source-lock.json"
work_root="${IDTECH4_WORK_ROOT:-${repo_root}/.work}"
release="$(node -p "require('${lock_file}').openq4.runtimePacks.release")"
asset_dir="${work_root}/openq4-assets/${release}"

mkdir -p "${asset_dir}"

node -e '
  const packs = require(process.argv[1]).openq4.runtimePacks;
  for (const [name, spec] of Object.entries(packs.files)) {
    process.stdout.write(`${name}\t${spec.bytes}\t${spec.sha256}\t${packs.baseUrl}/${name}\n`);
  }
' "${lock_file}" | while IFS=$'\t' read -r name expected_bytes expected_sha256 url; do
  destination="${asset_dir}/${name}"
  valid=false
  if [[ -f "${destination}" ]] \
    && [[ "$(stat -c '%s' "${destination}")" = "${expected_bytes}" ]] \
    && [[ "$(sha256sum "${destination}" | awk '{print $1}')" = "${expected_sha256}" ]]; then
    valid=true
  fi
  if [[ "${valid}" != true ]]; then
    temporary="$(mktemp "${asset_dir}/.${name}.download.XXXXXX")"
    trap 'rm -f -- "${temporary}"' EXIT
    printf 'Downloading pinned openQ4 runtime pack %s...\n' "${name}" >&2
    curl --fail --location --show-error --output "${temporary}" "${url}"
    test "$(stat -c '%s' "${temporary}")" = "${expected_bytes}"
    test "$(sha256sum "${temporary}" | awk '{print $1}')" = "${expected_sha256}"
    mv -f -- "${temporary}" "${destination}"
    trap - EXIT
  fi
  printf 'verified openQ4 runtime pack %s\n' "${name}" >&2
done

printf '%s\n' "${asset_dir}"
