#!/usr/bin/env bash
# Apply engine patches and build the 2014 + steam_legacy-shader owner tree.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

source_tree="${SOURCE_ENGINE_ROOT:-/inputs/source}"
if [[ ! -f "${source_tree}/wscript" ]]; then
  source_tree="${SOURCE_ENGINE_ROOT:-/home/ted/Desktop/source-engine-master}"
fi

if [[ -f "${source_tree}/wscript" ]]; then
  node "${root}/scripts/apply-source-patches.mjs" "${source_tree}"
else
  echo "no leaked source tree at SOURCE_ENGINE_ROOT=${SOURCE_ENGINE_ROOT:-} (skipping patches)" >&2
fi

if [[ -n "${HL2_GOTY_ISO:-}" || -f /inputs/iso/*.iso || -d /inputs/iso ]]; then
  bash "${root}/scripts/extract-goty-iso.sh"
fi

node "${root}/scripts/combine-owner-data.mjs"
node "${root}/scripts/generate-game-data.mjs"
