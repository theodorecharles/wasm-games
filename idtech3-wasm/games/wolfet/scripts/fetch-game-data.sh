#!/bin/sh
# Fetch proprietary Wolf: ET assets from Splash Damage and compatible ETL data
# from either a bundled seed or the pinned dedicated-server image. Downloaded
# files are gitignored.
set -eu

DEFAULT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="${ETJS_DATA_ROOT:-$DEFAULT_ROOT}"
CACHE_DIR="${ETJS_CACHE_DIR:-$ROOT/.cache/etjs}"
OFFICIAL_URL="https://cdn.splashdamage.com/downloads/games/wet/et260b.x86_full.zip"
OFFICIAL_ARCHIVE="$CACHE_DIR/et260b.x86_full.zip"
OFFICIAL_SHA256="2a8fef8e8558efffcad658bb9a8b12df8740418b3514142350eba3b7641eb3e0"
INSTALLER_NAME="et260b.x86_keygen_V03.run"
INSTALLER_SHA256="5b6bd440470f211d4c60ec23249739741362baec3a9b52091bbbb4b670a4af41"
LEGACY_IMAGE="${ETJS_DED_IMAGE:-etlegacy/server@sha256:e8810511b59a70cd66ddf36951cbb873333c4081d236241343e19ee4a0a30d63}"
LEGACY_PAK_SOURCE="${ETJS_LEGACY_PAK_SOURCE:-}"
LEGACY_PAK_SHA256="d1abab70f6e3e3af8f34dfb4d94542c8bd592b0a1a582f0107d2162ee23c679b"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 is required" >&2
    exit 1
  fi
}

file_matches() {
  expected="$1"
  file="$2"
  [ -f "$file" ] && [ "$(sha256sum "$file" | awk '{print $1}')" = "$expected" ]
}

require_command curl
require_command node
require_command sha256sum
require_command unzip

mkdir -p "$CACHE_DIR" "$ROOT/runtime/etmain" "$ROOT/runtime/legacy" \
  "$ROOT/web/sound/music"

NEED_INSTALLER=0
file_matches "712966b20e06523fe81419516500e499c86b2b4fec823856ddbd333fcb3d26e5" "$ROOT/runtime/etmain/pak0.pk3" || NEED_INSTALLER=1
file_matches "5610fd749024405b4425a7ce6397e58187b941d22092ef11d4844b427df53e5d" "$ROOT/runtime/etmain/pak1.pk3" || NEED_INSTALLER=1
file_matches "a48ab749a1a12ab4d9137286b1f23d642c29da59845b2bafc8f64e052cf06f3e" "$ROOT/runtime/etmain/pak2.pk3" || NEED_INSTALLER=1
file_matches "cf0a7ce662421c766f93cc196841849eb66905b047d209dd5f3ed0b1396cd42e" "$ROOT/runtime/etmain/mp_bin.pk3" || NEED_INSTALLER=1
file_matches "4c61a3723f200a0e51681e55c6822d5886e48fa4247459834b239910570f191b" "$ROOT/web/sound/music/menu_server.wav" || NEED_INSTALLER=1

TMP_DIR=""
CONTAINER_ID=""
cleanup() {
  if [ -n "$CONTAINER_ID" ]; then
    docker rm "$CONTAINER_ID" >/dev/null 2>&1 || true
  fi
  if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi
}
trap cleanup EXIT INT TERM

if [ "$NEED_INSTALLER" -eq 1 ]; then
  if ! file_matches "$OFFICIAL_SHA256" "$OFFICIAL_ARCHIVE"; then
    if [ -e "$OFFICIAL_ARCHIVE" ]; then
      echo "cached archive has the wrong checksum: $OFFICIAL_ARCHIVE" >&2
      exit 1
    fi
    echo "downloading the official Wolfenstein: Enemy Territory Linux installer"
    curl --fail --location --progress-bar --output "$OFFICIAL_ARCHIVE.part" "$OFFICIAL_URL"
    if ! file_matches "$OFFICIAL_SHA256" "$OFFICIAL_ARCHIVE.part"; then
      echo "Splash Damage archive checksum mismatch" >&2
      exit 1
    fi
    mv "$OFFICIAL_ARCHIVE.part" "$OFFICIAL_ARCHIVE"
  fi

  TMP_DIR="$(mktemp -d /tmp/etjs-data.XXXXXX)"
  unzip -q "$OFFICIAL_ARCHIVE" "$INSTALLER_NAME" -d "$TMP_DIR"
  if ! file_matches "$INSTALLER_SHA256" "$TMP_DIR/$INSTALLER_NAME"; then
    echo "official installer checksum mismatch" >&2
    exit 1
  fi
  mkdir -p "$TMP_DIR/game"
  sh "$TMP_DIR/$INSTALLER_NAME" --noexec --target "$TMP_DIR/game" >/dev/null

  for spec in \
    "712966b20e06523fe81419516500e499c86b2b4fec823856ddbd333fcb3d26e5 pak0.pk3" \
    "5610fd749024405b4425a7ce6397e58187b941d22092ef11d4844b427df53e5d pak1.pk3" \
    "a48ab749a1a12ab4d9137286b1f23d642c29da59845b2bafc8f64e052cf06f3e pak2.pk3" \
    "cf0a7ce662421c766f93cc196841849eb66905b047d209dd5f3ed0b1396cd42e mp_bin.pk3"
  do
    expected="${spec%% *}"
    name="${spec#* }"
    source_file="$TMP_DIR/game/etmain/$name"
    if ! file_matches "$expected" "$source_file"; then
      echo "$name checksum mismatch" >&2
      exit 1
    fi
    install -m 0644 "$source_file" "$ROOT/runtime/etmain/$name"
  done

  unzip -p "$ROOT/runtime/etmain/pak0.pk3" sound/music/menu_server.wav \
    > "$ROOT/web/sound/music/menu_server.wav"
  if ! file_matches "4c61a3723f200a0e51681e55c6822d5886e48fa4247459834b239910570f191b" "$ROOT/web/sound/music/menu_server.wav"; then
    echo "menu music checksum mismatch" >&2
    exit 1
  fi
  echo "installed official game data from Splash Damage"
else
  echo "official game data already matches the pinned checksums"
fi

LEGACY_PAK="$ROOT/runtime/legacy/legacy_v2.84.0.pk3"
if ! file_matches "$LEGACY_PAK_SHA256" "$LEGACY_PAK"; then
  if [ -n "$LEGACY_PAK_SOURCE" ]; then
    if ! file_matches "$LEGACY_PAK_SHA256" "$LEGACY_PAK_SOURCE"; then
      echo "bundled ET: Legacy data checksum mismatch: $LEGACY_PAK_SOURCE" >&2
      exit 1
    fi
    install -m 0644 "$LEGACY_PAK_SOURCE" "$LEGACY_PAK"
    echo "installed ET: Legacy v2.84.0 data from the bundled seed"
  else
    require_command docker
    if [ -z "$TMP_DIR" ]; then
      TMP_DIR="$(mktemp -d /tmp/etjs-data.XXXXXX)"
    fi
    docker image inspect "$LEGACY_IMAGE" >/dev/null 2>&1 || docker pull "$LEGACY_IMAGE"
    CONTAINER_ID="$(docker create "$LEGACY_IMAGE")"
    docker cp "$CONTAINER_ID:/legacy/server/legacy/legacy_v2.84.0.pk3" "$TMP_DIR/legacy_v2.84.0.pk3"
    docker rm "$CONTAINER_ID" >/dev/null
    CONTAINER_ID=""
    if ! file_matches "$LEGACY_PAK_SHA256" "$TMP_DIR/legacy_v2.84.0.pk3"; then
      echo "ET: Legacy data checksum mismatch" >&2
      exit 1
    fi
    install -m 0644 "$TMP_DIR/legacy_v2.84.0.pk3" "$LEGACY_PAK"
    echo "installed ET: Legacy v2.84.0 data from the pinned server image"
  fi
  if ! file_matches "$LEGACY_PAK_SHA256" "$LEGACY_PAK"; then
    echo "ET: Legacy data checksum mismatch" >&2
    exit 1
  fi
else
  echo "ET: Legacy data already matches the pinned checksum"
fi

echo "game data is ready under $ROOT/runtime"
