#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
variant="${VARIANT:-${1:-}}"
case "${variant}" in
  nes|snes|ps1|ps2) ;;
  *) printf 'usage: VARIANT=nes|snes|ps1|ps2 %s\n' "$0" >&2; exit 2 ;;
esac

if [[ -z "${EMSDK_DIR:-}" || ! -f "${EMSDK_DIR}/emsdk_env.sh" ]]; then
  printf 'Set EMSDK_DIR to an Emscripten SDK checkout.\n' >&2
  exit 1
fi

"${repo_dir}/scripts/verify-source-lock.mjs"
source "${EMSDK_DIR}/emsdk_env.sh" >/dev/null

work_dir="${repo_dir}/.work"
output_dir="${repo_dir}/build/core/${variant}"
mkdir -p "${work_dir}/include" "${output_dir}"
ln -sfn "${repo_dir}/vendor/jolly-good-api" "${work_dir}/include/jg"

if [[ -n "${EMULATION_BUILD_JOBS:-}" ]]; then
  jobs="${EMULATION_BUILD_JOBS}"
else
  jobs="$(getconf _NPROCESSORS_ONLN 2>/dev/null || printf '2')"
fi

common_make_args=(
  DISABLE_MODULE=1
  ENABLE_STATIC_JG=1
  CC=emcc
  CXX=em++
  CC_FOR_BUILD=cc
  CXX_FOR_BUILD=c++
  AR=emar
  STRIP=emstrip
  "CFLAGS_JG=-I${work_dir}/include"
  "-j${jobs}"
)

case "${variant}" in
  nes)
    emmake make -C "${repo_dir}/vendor/nestopia-jg" "${common_make_args[@]}"
    archive="${repo_dir}/vendor/nestopia-jg/nestopia/libnestopia-jg.a"
    ;;
  snes)
    patch_file="${repo_dir}/patches/bsnes-jg/0001-emscripten-fiber-backend.patch"
    if git -C "${repo_dir}/vendor/bsnes-jg" apply --reverse --check "${patch_file}" 2>/dev/null; then
      : # already applied
    elif git -C "${repo_dir}/vendor/bsnes-jg" apply --check "${patch_file}"; then
      git -C "${repo_dir}/vendor/bsnes-jg" apply "${patch_file}"
    else
      printf 'bsnes-jg Emscripten fiber patch does not apply cleanly.\n' >&2
      exit 1
    fi
    # Upstream's vendored-samplerate rules do not create this nested directory.
    # Keep the workaround outside the source patch set and make it repeatable.
    mkdir -p "${repo_dir}/vendor/bsnes-jg/objs/deps/libsamplerate"
    emmake make -C "${repo_dir}/vendor/bsnes-jg" \
      USE_VENDORED_SAMPLERATE=1 "${common_make_args[@]}"
    archive="${repo_dir}/vendor/bsnes-jg/bsnes/libbsnes-jg.a"
    ;;
  ps1)
    patch_file="${repo_dir}/patches/mednafen-jg/0001-emscripten-internal-codecs.patch"
    if git -C "${repo_dir}/vendor/mednafen-jg" apply --reverse --check "${patch_file}" 2>/dev/null; then
      : # already applied
    elif git -C "${repo_dir}/vendor/mednafen-jg" apply --check "${patch_file}"; then
      git -C "${repo_dir}/vendor/mednafen-jg" apply "${patch_file}"
    else
      printf 'Mednafen JG Emscripten dependency patch does not apply cleanly.\n' >&2
      exit 1
    fi
    emmake make -C "${repo_dir}/vendor/mednafen-jg/jollygood" clean
    emmake make -C "${repo_dir}/vendor/mednafen-jg/jollygood" \
      "${common_make_args[@]}" \
      MEDNAFEN_JG_PSX_ONLY=1 \
      "CFLAGS=-O2 -sUSE_ZLIB=1" \
      "CXXFLAGS=-O2 -sUSE_ZLIB=1 -fexceptions"
    archive="${repo_dir}/vendor/mednafen-jg/jollygood/mednafen/libmednafen-jg.a"
    ;;
  ps2)
    printf '%s\n' \
      'PS2 needs a new Play! native host, random-access disc transport, and WebGL 2/WebGPU GS seam.' \
      'The existing Play! browser host is intentionally excluded and this target remains disabled.' >&2
    exit 1
    ;;
esac

if [[ ! -s "${archive}" ]]; then
  printf 'expected archive was not produced: %s\n' "${archive}" >&2
  exit 1
fi
emar t "${archive}" >/dev/null
cp "${archive}" "${output_dir}/"
printf 'built %s Emscripten native core: %s\n' "${variant}" "${output_dir}/$(basename "${archive}")"
