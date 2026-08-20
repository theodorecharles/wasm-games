#!/bin/sh
set -eu

PROJECT_ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
FRAMEWORK_ROOT="${WASM_GAME_FRAMEWORK_DIR:-}"
FRAMEWORK_LOCK="$PROJECT_ROOT/framework-lock.json"
FRAMEWORK_TARGET="$PROJECT_ROOT/.generated/shared-shell"
FRAMEWORK_RUNTIME_TARGET="$PROJECT_ROOT/.generated/framework-runtime"
FRAMEWORK_REPOSITORY="$(node -p "require('$FRAMEWORK_LOCK').repository")"
FRAMEWORK_VERSION="$(node -p "require('$FRAMEWORK_LOCK').version")"
FRAMEWORK_COMMIT="$(node -p "require('$FRAMEWORK_LOCK').commit")"
TEMP_ROOT="$(mktemp -d)"

cleanup() {
  rm -rf -- "$TEMP_ROOT"
}
trap cleanup EXIT HUP INT TERM

if [ -z "$FRAMEWORK_ROOT" ]; then
  for candidate in \
    "$PROJECT_ROOT/../wasm/wasm-game-framework" \
    "$PROJECT_ROOT/../wasm-game-framework"
  do
    if [ -x "$candidate/scripts/install-browser-package.sh" ]; then
      FRAMEWORK_ROOT="$candidate"
      break
    fi
  done
fi

FRAMEWORK_SOURCE="$TEMP_ROOT/framework"
mkdir -p "$FRAMEWORK_SOURCE"

if [ -n "$FRAMEWORK_ROOT" ] && [ -d "$FRAMEWORK_ROOT/.git" ] &&
   git -C "$FRAMEWORK_ROOT" cat-file -e "$FRAMEWORK_COMMIT^{commit}" 2>/dev/null
then
  git -C "$FRAMEWORK_ROOT" archive "$FRAMEWORK_COMMIT" | tar -x -C "$FRAMEWORK_SOURCE"
else
  git -C "$FRAMEWORK_SOURCE" init -q
  git -C "$FRAMEWORK_SOURCE" remote add origin "$FRAMEWORK_REPOSITORY"
  git -C "$FRAMEWORK_SOURCE" fetch -q --depth=1 origin "$FRAMEWORK_COMMIT"
  git -C "$FRAMEWORK_SOURCE" checkout -q --detach FETCH_HEAD
fi

ACTUAL_VERSION="$(node -p "require('$FRAMEWORK_SOURCE/package.json').version")"
if [ "$ACTUAL_VERSION" != "$FRAMEWORK_VERSION" ]; then
  echo "wasm-game-framework $FRAMEWORK_COMMIT is $ACTUAL_VERSION, expected $FRAMEWORK_VERSION" >&2
  exit 1
fi

rm -rf -- "$FRAMEWORK_TARGET"
"$FRAMEWORK_SOURCE/scripts/install-browser-package.sh" "$FRAMEWORK_TARGET" copy
node "$FRAMEWORK_SOURCE/scripts/check-game-package.js" "$PROJECT_ROOT/web"
node "$PROJECT_ROOT/scripts/stage-framework-runtime.js" \
  "$FRAMEWORK_SOURCE" "$PROJECT_ROOT/web" "$FRAMEWORK_TARGET" "$FRAMEWORK_RUNTIME_TARGET"
