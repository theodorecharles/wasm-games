#!/bin/sh
# Prepare the pinned ET: Legacy source tree and apply the ETJS WebAssembly port.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ETLEGACY_DIR="${ETJS_ETLEGACY_DIR:-$ROOT/etlegacy}"
UPSTREAM_URL="https://github.com/etlegacy/etlegacy.git"
UPSTREAM_REF="a44ab4f396370a694109da33df901d85f6fe9626"
ETJS_PATCH="$ROOT/patches/etlegacy-wasm.patch"
ETJS_MODES_PATCH="$ROOT/patches/etlegacy-modes.patch"
ETJS_ETH32_PATCH="$ROOT/patches/etlegacy-eth32nix.patch"
ETJS_SLOT_PATCH="$ROOT/patches/etlegacy-human-slot.patch"
ETJS_UI_PATCH="$ROOT/patches/etlegacy-etjs-ui.patch"
ETH32_SRC="$ROOT/eth32nix"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required" >&2
  exit 1
fi
if [ ! -f "$ETJS_PATCH" ] || [ ! -f "$ETJS_MODES_PATCH" ] || [ ! -f "$ETJS_ETH32_PATCH" ] || [ ! -f "$ETJS_SLOT_PATCH" ] || [ ! -f "$ETJS_UI_PATCH" ]; then
  echo "missing ETJS engine patch" >&2
  exit 1
fi

apply_named_patch() {
  patch_file="$1"
  if git -C "$ETLEGACY_DIR" apply --reverse --check "$patch_file" >/dev/null 2>&1; then
    return 0
  fi
  git -C "$ETLEGACY_DIR" apply --check "$patch_file"
  git -C "$ETLEGACY_DIR" apply "$patch_file"
}

apply_followup_patches() {
  apply_named_patch "$ETJS_SLOT_PATCH"
  apply_named_patch "$ETJS_UI_PATCH"
}

install_eth32nix() {
  for f in eth32nix.h eth32nix.c eth32nix_aim.c eth32nix_vis.c eth32nix_gui.c eth32nix_luts.h; do
    if [ ! -f "$ETH32_SRC/$f" ]; then
      echo "missing ETH32NIX source $ETH32_SRC/$f" >&2
      exit 1
    fi
    install -m 0644 "$ETH32_SRC/$f" "$ETLEGACY_DIR/src/cgame/$f"
  done
}

if [ ! -d "$ETLEGACY_DIR/.git" ]; then
  if [ -e "$ETLEGACY_DIR" ]; then
    echo "$ETLEGACY_DIR exists but is not a Git checkout" >&2
    exit 1
  fi
  git clone --filter=blob:none "$UPSTREAM_URL" "$ETLEGACY_DIR"
  git -C "$ETLEGACY_DIR" checkout --detach "$UPSTREAM_REF"
fi

ACTUAL_REF="$(git -C "$ETLEGACY_DIR" rev-parse HEAD)"
if [ "$ACTUAL_REF" != "$UPSTREAM_REF" ]; then
  echo "ET: Legacy is at $ACTUAL_REF; ETJS requires $UPSTREAM_REF" >&2
  exit 1
fi

if git -C "$ETLEGACY_DIR" apply --reverse --check "$ETJS_ETH32_PATCH" >/dev/null 2>&1; then
  install_eth32nix
  apply_followup_patches
  echo "ETJS engine patches are already applied at $ETLEGACY_DIR"
  exit 0
fi

# Upgrade a checkout that has modes but not the compiled-in ETH32NIX layer.
if git -C "$ETLEGACY_DIR" apply --reverse --check "$ETJS_MODES_PATCH" >/dev/null 2>&1; then
  install_eth32nix
  git -C "$ETLEGACY_DIR" apply --check "$ETJS_ETH32_PATCH"
  git -C "$ETLEGACY_DIR" apply "$ETJS_ETH32_PATCH"
  apply_followup_patches
  echo "applied ETH32NIX aimbot to ET: Legacy $UPSTREAM_REF"
  exit 0
fi

# Upgrade a checkout prepared by an earlier revision that has the main browser
# patch but not the deployment-mode patch yet.
if git -C "$ETLEGACY_DIR" apply --reverse --check "$ETJS_PATCH" >/dev/null 2>&1; then
  git -C "$ETLEGACY_DIR" apply --check "$ETJS_MODES_PATCH"
  git -C "$ETLEGACY_DIR" apply "$ETJS_MODES_PATCH"
  install_eth32nix
  git -C "$ETLEGACY_DIR" apply --check "$ETJS_ETH32_PATCH"
  git -C "$ETLEGACY_DIR" apply "$ETJS_ETH32_PATCH"
  apply_followup_patches
  echo "applied ETJS deployment modes and ETH32NIX to ET: Legacy $UPSTREAM_REF"
  exit 0
fi

if [ -n "$(git -C "$ETLEGACY_DIR" status --porcelain)" ]; then
  echo "ET: Legacy checkout has unrelated changes; refusing to overwrite them" >&2
  exit 1
fi

git -C "$ETLEGACY_DIR" apply --check "$ETJS_PATCH"
git -C "$ETLEGACY_DIR" apply "$ETJS_PATCH"
git -C "$ETLEGACY_DIR" apply --check "$ETJS_MODES_PATCH"
git -C "$ETLEGACY_DIR" apply "$ETJS_MODES_PATCH"
install_eth32nix
git -C "$ETLEGACY_DIR" apply --check "$ETJS_ETH32_PATCH"
git -C "$ETLEGACY_DIR" apply "$ETJS_ETH32_PATCH"
apply_followup_patches
echo "applied ETJS engine patch to ET: Legacy $UPSTREAM_REF"
