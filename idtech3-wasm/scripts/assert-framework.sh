#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
FRAMEWORK_DIR="${WASM_GAME_FRAMEWORK_DIR:-$(dirname "$ROOT")/wasm-game-framework}"
VERSION="$(node -p "require('$ROOT/sources.lock.json').framework.version")"
COMMIT="$(node -p "require('$ROOT/sources.lock.json').framework.commit")"

test -e "$FRAMEWORK_DIR/.git" || {
  echo "framework checkout not found: $FRAMEWORK_DIR" >&2
  exit 1
}
test "$(node -p "require('$FRAMEWORK_DIR/package.json').version")" = "$VERSION" || {
  echo "framework version must be $VERSION" >&2
  exit 1
}
git -C "$FRAMEWORK_DIR" cat-file -e "$COMMIT^{commit}"

# Later documentation-only commits are harmless; every package/runtime input
# must remain byte-identical to the locked public v0.9.4 release.
for path in package.json package-lock.json dist docker server scripts; do
  git -C "$FRAMEWORK_DIR" diff --quiet "$COMMIT" -- "$path" || {
    echo "framework $path differs from locked commit $COMMIT" >&2
    exit 1
  }
  git -C "$FRAMEWORK_DIR" diff --quiet -- "$path" || {
    echo "framework $path has uncommitted changes" >&2
    exit 1
  }
done

printf '%s\n' "$FRAMEWORK_DIR"
