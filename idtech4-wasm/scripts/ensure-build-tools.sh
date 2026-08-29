#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work_root="${IDTECH4_WORK_ROOT:-${repo_root}/.work}"
tools_dir="${IDTECH4_TOOLS_DIR:-${work_root}/build-tools}"
meson_version="$(node -p "require('${repo_root}/source-lock.json').buildTools.meson")"
ninja_package_version="$(node -p "require('${repo_root}/source-lock.json').buildTools.ninjaPackage")"
meson_site="${tools_dir}/meson-${meson_version}"
meson="${repo_root}/scripts/run-meson.sh"
ninja_root="${tools_dir}/ninja-${ninja_package_version}"
ninja="${ninja_root}/bin/ninja"

if [[ "$(PYTHONPATH="${meson_site}" python3 -m mesonbuild.mesonmain --version 2>/dev/null || true)" != "${meson_version}" ]]; then
  mkdir -p "${meson_site}"
  python3 -m pip install --disable-pip-version-check --no-input --quiet --upgrade \
    --target "${meson_site}" \
    "meson==${meson_version}"
fi
if [[ ! -x "${ninja}" ]]; then
  mkdir -p "${ninja_root}"
  python3 -m pip install --disable-pip-version-check --no-input --quiet --upgrade \
    --target "${ninja_root}" \
    "ninja==${ninja_package_version}"
fi

test "$(IDTECH4_MESON_SITE="${meson_site}" "${meson}" --version)" = "${meson_version}"
"${ninja}" --version >/dev/null
printf '%s\n' "${meson}"
