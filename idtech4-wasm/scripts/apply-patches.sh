#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work_root="${IDTECH4_WORK_ROOT:-${repo_root}/.work}"

"${repo_root}/scripts/fetch-sources.sh"
(cd "${repo_root}/patches" && sha256sum --check SHA256SUMS)

for exact_checkout in "${work_root}/openq4-game" "${work_root}/wasm-game-framework"; do
  if [[ -n "$(git -C "${exact_checkout}" status --short)" ]]; then
    echo "Refusing dirty exact dependency checkout: ${exact_checkout}" >&2
    exit 1
  fi
done

verify_exact_patch_tree() {
  local checkout="$1"
  local patch="$2"
  local index_dir expected_index actual_index expected_tree actual_tree
  index_dir="$(mktemp -d -t idtech4-patch-index.XXXXXX)"
  expected_index="${index_dir}/expected"
  actual_index="${index_dir}/actual"

  GIT_INDEX_FILE="${expected_index}" git -C "${checkout}" read-tree HEAD
  GIT_INDEX_FILE="${expected_index}" git -C "${checkout}" apply --cached --whitespace=nowarn "${patch}"
  expected_tree="$(GIT_INDEX_FILE="${expected_index}" git -C "${checkout}" write-tree)"

  GIT_INDEX_FILE="${actual_index}" git -C "${checkout}" read-tree HEAD
  GIT_INDEX_FILE="${actual_index}" git -C "${checkout}" add -A
  actual_tree="$(GIT_INDEX_FILE="${actual_index}" git -C "${checkout}" write-tree)"
  rm -rf -- "${index_dir}"

  if [[ "${actual_tree}" != "${expected_tree}" ]]; then
    echo "Generated checkout differs from the exact patch tree: ${checkout}" >&2
    return 1
  fi
  printf 'verified exact patch tree %s\n' "$(basename "${patch}")"
}

apply_one() {
  local checkout="$1"
  local patch="$2"
  if git -C "${checkout}" apply --reverse --check --whitespace=nowarn "${patch}" >/dev/null 2>&1; then
    printf '%s already applied\n' "$(basename "${patch}")"
    return
  fi
  git -C "${checkout}" apply --check --whitespace=nowarn "${patch}"
  git -C "${checkout}" apply --whitespace=nowarn "${patch}"
  printf 'applied %s\n' "$(basename "${patch}")"
}

apply_one "${work_root}/dhewm3" "${repo_root}/patches/dhewm3-browser.patch"
apply_one "${work_root}/openq4" "${repo_root}/patches/openq4-browser.patch"
apply_one "${work_root}/prey2006" "${repo_root}/patches/prey2006-browser.patch"
verify_exact_patch_tree "${work_root}/dhewm3" "${repo_root}/patches/dhewm3-browser.patch"
verify_exact_patch_tree "${work_root}/openq4" "${repo_root}/patches/openq4-browser.patch"
verify_exact_patch_tree "${work_root}/prey2006" "${repo_root}/patches/prey2006-browser.patch"
