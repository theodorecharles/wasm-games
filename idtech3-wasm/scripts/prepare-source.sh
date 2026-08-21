#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
SOURCE_ROOT="${IDTECH3_SOURCE_ROOT:-$ROOT/.sources}"
TARGET="${1:-all}"

lock() {
  node -p "require('$ROOT/sources.lock.json').$1"
}

clone_pin() {
  repository="$1"
  commit="$2"
  directory="$3"
  if [ ! -d "$directory/.git" ]; then
    if [ -e "$directory" ]; then
      echo "$directory exists but is not a Git checkout" >&2
      exit 1
    fi
    git clone --filter=blob:none "$repository" "$directory"
  fi
  if [ -n "$(git -C "$directory" status --porcelain)" ]; then
    echo "$directory has unrelated changes" >&2
    exit 1
  fi
  git -C "$directory" checkout --detach "$commit"
}

prepare_quake3() {
  directory="$SOURCE_ROOT/quakejs"
  if [ -d "$directory/.git" ] &&
      [ "$(git -C "$directory" rev-parse HEAD)" = "$(lock quake3.commit)" ] &&
      [ -e "$directory/ioq3/.git" ] &&
      [ "$(git -C "$directory/ioq3" rev-parse HEAD)" = "$(lock quake3.downstreamCommit)" ] &&
      [ -z "$(git -C "$directory/ioq3" status --porcelain)" ]; then
    echo "QuakeJS source ready at $directory"
    return
  fi
  if [ -d "$directory/.git" ] &&
      [ "$(git -C "$directory" rev-parse HEAD)" = "$(lock quake3.commit)" ] &&
      [ -e "$directory/ioq3/.git" ] &&
      [ -z "$(git -C "$directory/ioq3" status --porcelain)" ]; then
    :
  else
    clone_pin "$(lock quake3.repository)" "$(lock quake3.commit)" "$directory"
  fi
  # QuakeJS's historical .gitmodules uses the retired git:// transport. Keep
  # the recorded submodule relation while resolving it through pinned HTTPS.
  git -C "$directory" \
    -c url.https://github.com/.insteadOf=git://github.com/ \
    submodule update --init ioq3
  git -C "$directory/ioq3" fetch --no-tags "$(lock quake3.ioq3Repository)" "$(lock quake3.ioq3Commit)"
  git -C "$directory/ioq3" checkout --detach "$(lock quake3.ioq3Commit)"
  if git -C "$directory/ioq3" apply --reverse --check "$ROOT/patches/quake3/0001-Add-framework-join-and-lifecycle-QVM-hooks.patch" >/dev/null 2>&1; then
    :
  else
    GIT_COMMITTER_DATE="$(lock quake3.downstreamCommitterDate)" \
      GIT_COMMITTER_NAME="$(lock quake3.downstreamCommitterName)" \
      GIT_COMMITTER_EMAIL="$(lock quake3.downstreamCommitterEmail)" \
      git -C "$directory/ioq3" am "$ROOT/patches/quake3/0001-Add-framework-join-and-lifecycle-QVM-hooks.patch"
  fi
  test "$(git -C "$directory/ioq3" rev-parse HEAD)" = "$(lock quake3.downstreamCommit)"
  echo "QuakeJS source ready at $directory"
}

prepare_rtcw() {
  directory="$SOURCE_ROOT/iortcw"
  if [ -d "$directory/.git" ] &&
      [ -z "$(git -C "$directory" status --porcelain)" ] &&
      [ "$(git -C "$directory" rev-parse HEAD)" = "$(lock rtcw.downstreamCommit)" ] &&
      [ "$(git -C "$directory" rev-parse 'HEAD^{tree}')" = "$(lock rtcw.downstreamTree)" ]; then
    echo "iortcw browser source ready at $directory"
    return
  fi
  clone_pin "$(lock rtcw.repository)" "$(lock rtcw.commit)" "$directory"
  if git -C "$directory" apply --reverse --check "$ROOT/patches/rtcw/0001-Add-canonical-RTCW-browser-source-scaffold.patch" >/dev/null 2>&1; then
    :
  else
    for patch in "$ROOT"/patches/rtcw/*.patch; do
      # format-patch records the original author time. These downstream commits
      # used the same author and committer time, so preserve it explicitly;
      # otherwise git-am would produce a different locked commit on every run.
      committer_date="$(sed -n 's/^Date: //p' "$patch" | sed -n '1p')"
      test -n "$committer_date"
      GIT_COMMITTER_DATE="$committer_date" \
        GIT_COMMITTER_NAME="$(lock rtcw.downstreamCommitterName)" \
        GIT_COMMITTER_EMAIL="$(lock rtcw.downstreamCommitterEmail)" \
        git -C "$directory" am "$patch"
    done
  fi
  test "$(git -C "$directory" rev-parse HEAD)" = "$(lock rtcw.downstreamCommit)"
  test "$(git -C "$directory" rev-parse 'HEAD^{tree}')" = "$(lock rtcw.downstreamTree)"
  echo "iortcw browser source ready at $directory"
}

mkdir -p "$SOURCE_ROOT"
case "$TARGET" in
  quake3) prepare_quake3 ;;
  rtcw) prepare_rtcw ;;
  all) prepare_quake3; prepare_rtcw ;;
  *) echo "usage: $0 quake3|rtcw|all" >&2; exit 2 ;;
esac

find "$SOURCE_ROOT" -type f -name '*.md' -delete
