#!/bin/sh
# Restore the source-only workspace's browser dependencies from immutable Git
# revisions. Never replace an existing vendor tree with different bytes.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$(mktemp -d -t wolfet-web-deps.XXXXXX)"
trap 'find "$STAGE" -mindepth 1 -depth -delete; rmdir "$STAGE"' EXIT HUP INT TERM

fetch_revision() {
  vendor_name="$1"
  vendor_url="$2"
  vendor_commit="$3"
  git init -q "$STAGE/$vendor_name"
  git -C "$STAGE/$vendor_name" fetch -q --depth=1 "$vendor_url" "$vendor_commit"
  git -C "$STAGE/$vendor_name" checkout -q --detach FETCH_HEAD
  test "$(git -C "$STAGE/$vendor_name" rev-parse HEAD)" = "$vendor_commit"
}

# zlib v1.3.1 (minizip) and cJSON v1.7.19, including upstream licenses.
fetch_revision zlib https://github.com/madler/zlib.git 51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf
fetch_revision cjson https://github.com/DaveGamble/cJSON.git c859b25da02955fef659d658b8f324b5cde87be3
mkdir -p "$STAGE/output/minizip" "$STAGE/output/cjson"
for file in unzip.c unzip.h ioapi.c ioapi.h; do
  cp "$STAGE/zlib/contrib/minizip/$file" "$STAGE/output/minizip/$file"
done
cp "$STAGE/zlib/LICENSE" "$STAGE/output/minizip/LICENSE"
for file in cJSON.c cJSON.h LICENSE; do
  cp "$STAGE/cjson/$file" "$STAGE/output/cjson/$file"
done
mkdir -p "$ROOT/third_party"
for vendor_name in minizip cjson; do
  if [ -e "$ROOT/third_party/$vendor_name" ]; then
    diff -r "$STAGE/output/$vendor_name" "$ROOT/third_party/$vendor_name"
  else
    mv "$STAGE/output/$vendor_name" "$ROOT/third_party/$vendor_name"
  fi
done
echo "Verified pinned WolfET browser dependencies in $ROOT/third_party"
