#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
vendor_dir="${EMULATION_VENDOR_DIR:-${repo_dir}/vendor}"
mkdir -p "${vendor_dir}"

node --input-type=module - "${repo_dir}/source-lock.json" <<'NODE' |
import fs from 'node:fs';
const lock = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
for (const [name, spec] of Object.entries(lock.sources)) {
  process.stdout.write([name, spec.repository, spec.ref, spec.commit, spec.submodules === true ? '1' : '0'].join('\t') + '\n');
}
NODE
while IFS=$'\t' read -r name repository ref commit submodules; do
  destination="${vendor_dir}/${name}"
  if [[ -e "${destination}" && ! -d "${destination}/.git" ]]; then
    printf '%s exists but is not a Git checkout; refusing to replace it.\n' "${destination}" >&2
    exit 1
  fi
  if [[ ! -d "${destination}/.git" ]]; then
    mkdir -p "${destination}"
    git -C "${destination}" init --quiet
    git -C "${destination}" remote add origin "${repository}"
  fi
  actual_remote="$(git -C "${destination}" remote get-url origin)"
  if [[ "${actual_remote}" != "${repository}" ]]; then
    printf '%s origin mismatch: expected %s, found %s\n' "${name}" "${repository}" "${actual_remote}" >&2
    exit 1
  fi
  if ! git -C "${destination}" cat-file -e "${commit}^{commit}" 2>/dev/null; then
    git -C "${destination}" fetch --depth=1 origin "${commit}"
  fi
  git -C "${destination}" checkout --quiet --detach "${commit}"
  if [[ "${submodules}" == "1" ]]; then
    git -C "${destination}" submodule update --init --recursive --depth=1
  fi
  actual_commit="$(git -C "${destination}" rev-parse HEAD)"
  [[ "${actual_commit}" == "${commit}" ]]
  printf 'checked out %s %s (%s)\n' "${name}" "${ref}" "${commit}"
done

node "${repo_dir}/scripts/verify-source-lock.mjs"
