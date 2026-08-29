#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work_root="${IDTECH4_WORK_ROOT:-${repo_root}/.work}"
tools_dir="${IDTECH4_TOOLS_DIR:-${work_root}/build-tools}"
meson_version="$(node -p "require('${repo_root}/source-lock.json').buildTools.meson")"
meson_site="${IDTECH4_MESON_SITE:-${tools_dir}/meson-${meson_version}}"

export PYTHONPATH="${meson_site}${PYTHONPATH:+:${PYTHONPATH}}"
exec python3 -m mesonbuild.mesonmain "$@"
