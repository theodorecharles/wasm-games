#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work_root="${IDTECH4_WORK_ROOT:-${repo_root}/.work}"
tools_dir="${IDTECH4_TOOLS_DIR:-${work_root}/build-tools}"
meson_version="$(node -p "require('${repo_root}/source-lock.json').buildTools.meson")"

meson="${tools_dir}/bin/meson"
if [[ ! -x "${meson}" || "$("${meson}" --version 2>/dev/null || true)" != "${meson_version}" ]]; then
  python3 -m venv --clear "${tools_dir}"
  "${tools_dir}/bin/python" -m pip install --disable-pip-version-check --no-input --quiet \
    "meson==${meson_version}"
fi

test "$("${meson}" --version)" = "${meson_version}"
printf '%s\n' "${meson}"
