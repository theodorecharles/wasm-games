#!/usr/bin/env bash
# Build the unmodified, pinned desktop-GL translator for the RTCW SP client.
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
SOURCE_ROOT="${IDTECH3_SOURCE_ROOT:-$ROOT/.sources}"
SOURCE="$SOURCE_ROOT/gl4es"
COMMIT="$(node -p "require('$ROOT/sources.lock.json').rtcwGl4es.commit")"
REPOSITORY="$(node -p "require('$ROOT/sources.lock.json').rtcwGl4es.repository")"

if ! command -v emcmake >/dev/null 2>&1; then
  SDK_ENV="${EMSDK_ENV:-${EMSDK_DIR:-}/emsdk_env.sh}"
  if [ ! -f "$SDK_ENV" ]; then
    echo 'Activate Emscripten, or set EMSDK_ENV/EMSDK_DIR before building GL4ES.' >&2
    exit 1
  fi
  # shellcheck disable=SC1090
  source "$SDK_ENV" >&2
fi

mkdir -p "$SOURCE_ROOT"
if [ ! -d "$SOURCE/.git" ]; then
  if [ -e "$SOURCE" ]; then
    echo "$SOURCE exists but is not a Git checkout" >&2
    exit 1
  fi
  git clone --filter=blob:none "$REPOSITORY" "$SOURCE" >&2
fi
if [ -n "$(git -C "$SOURCE" status --porcelain)" ]; then
  echo "$SOURCE has unrelated changes; refusing to overwrite them" >&2
  exit 1
fi
if ! git -C "$SOURCE" cat-file -e "$COMMIT^{commit}" 2>/dev/null; then
  git -C "$SOURCE" fetch --no-tags origin "$COMMIT" >&2
fi
git -C "$SOURCE" checkout --detach "$COMMIT" >&2
test "$(git -C "$SOURCE" rev-parse HEAD)" = "$COMMIT"

emcmake cmake -S "$SOURCE" -B "$SOURCE/build" \
  -DCMAKE_BUILD_TYPE=RelWithDebInfo -DNOX11=ON -DNOEGL=ON -DSTATICLIB=ON >&2
cmake --build "$SOURCE/build" -j "${JOBS:-4}" >&2
test -f "$SOURCE/lib/libGL.a"
test -f "$SOURCE/LICENSE"
printf '%s\n' "$SOURCE"
