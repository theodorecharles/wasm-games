#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
lock_file="${repo_root}/source-lock.json"
work_root="${IDTECH4_WORK_ROOT:-${repo_root}/.work}"

lock_value() {
  node -e 'let value=require(process.argv[1]); for (const key of process.argv[2].split(".")) value = value[key]; process.stdout.write(String(value));' \
    "${lock_file}" "$1"
}

ensure_checkout() {
  local name="$1"
  local url="$2"
  local commit="$3"
  local destination="${work_root}/${name}"

  if [[ ! -d "${destination}/.git" ]]; then
    mkdir -p "${work_root}"
    git clone --no-checkout "${url}" "${destination}"
  fi
  git -C "${destination}" remote set-url --push origin DISABLED
  if ! git -C "${destination}" cat-file -e "${commit}^{commit}" 2>/dev/null; then
    git -C "${destination}" fetch --no-tags origin "${commit}"
  fi
  local worktree_file
  worktree_file="$(find "${destination}" -mindepth 1 -maxdepth 1 ! -name .git -print -quit)"
  if [[ "$(git -C "${destination}" rev-parse HEAD 2>/dev/null || true)" != "${commit}" || -z "${worktree_file}" ]]; then
    if [[ -n "${worktree_file}" && -n "$(git -C "${destination}" status --short)" ]]; then
      echo "Refusing to change dirty generated checkout: ${destination}" >&2
      exit 1
    fi
    git -C "${destination}" checkout --detach "${commit}"
  fi
  test "$(git -C "${destination}" rev-parse HEAD)" = "${commit}"
  printf '%s pinned at %s\n' "${name}" "${commit}"
}

ensure_checkout \
  dhewm3 \
  "${DHEWM3_SOURCE_URL:-$(lock_value dhewm3.url)}" \
  "$(lock_value dhewm3.commit)"
ensure_checkout \
  openq4 \
  "${OPENQ4_SOURCE_URL:-$(lock_value openq4.url)}" \
  "$(lock_value openq4.commit)"
ensure_checkout \
  openq4-game \
  "${OPENQ4_GAME_SOURCE_URL:-$(lock_value openq4Game.url)}" \
  "$(lock_value openq4Game.commit)"
ensure_checkout \
  prey2006 \
  "${PREY2006_SOURCE_URL:-$(lock_value prey2006.url)}" \
  "$(lock_value prey2006.commit)"
ensure_checkout \
  wasm-game-framework \
  "${WASM_GAME_FRAMEWORK_SOURCE_URL:-$(lock_value framework.url)}" \
  "$(lock_value framework.commit)"
