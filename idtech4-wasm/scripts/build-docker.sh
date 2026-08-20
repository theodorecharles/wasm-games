#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
site="${repo_root}/build/site"
work_root="${IDTECH4_WORK_ROOT:-${repo_root}/.work}"
framework_dir="${WASM_GAME_FRAMEWORK_DIR:-${work_root}/wasm-game-framework}"
image_repo="${IMAGE_REPO:-theodorecharles/idtech4-wasm}"
image_tag="${IMAGE_TAG:-dev}"

test "$(node -p "require('${framework_dir}/package.json').version")" = "0.9.2"
test "$(git -C "${framework_dir}" rev-parse HEAD)" = "53bc7e6eeef1ae35dcf3b25dea4e3ec0ab46726f"
test "$(md5sum "${site}/baseoq4/pak0.pk4" | awk '{print $1}')" = "17550cb028326cdf1cee440bc5d73d74"
test "$(md5sum "${site}/baseoq4/pak1.pk4" | awk '{print $1}')" = "c3434e1d28bebdc367d6e50f3b1fda3a"
test "$(stat -c '%s' "${site}/baseoq4/pak0.pk4")" = "4285437"
test "$(stat -c '%s' "${site}/baseoq4/pak1.pk4")" = "641646791"
unzip -tqq "${site}/baseoq4/pak0.pk4"
unzip -tqq "${site}/baseoq4/pak1.pk4"

unexpected_package="$(find "${site}" -type f \( -iname '*.pk4' -o -iname '*.pak' \) \
  ! -path "${site}/baseoq4/pak0.pk4" ! -path "${site}/baseoq4/pak1.pk4" -print -quit)"
if [[ -n "${unexpected_package}" ]]; then
  echo "Refusing to build: unexpected package ${unexpected_package}" >&2
  exit 1
fi

framework_image="wasm-game-framework:0.9.2"
"${framework_dir}/scripts/build-base-image.sh" "${framework_image}"

for variant in suite doom3 doom3-mp roe quake4 quake4-mp prey; do
  if [[ "${variant}" == suite ]]; then
    image="${image_repo}:${image_tag}"
  else
    image="${image_repo}:${variant}-${image_tag}"
  fi
  WASM_GAME_FRAMEWORK_IMAGE="${framework_image}" \
    "${framework_dir}/scripts/build-static-image.sh" "${site}" "${image}" "${variant}"
done
printf 'Built id Tech 4 suite and six locked images.\n'
