#!/usr/bin/env bash
# Extract the 2014 GOTY / Collectors Edition ISO into a private loose tree.
# The disc's HalfLife2.cab is a flat cabinet; msiextract is required because
# hl2.msi contains the authoritative directory map. The result is never
# committed or copied into the public image.
set -euo pipefail

iso="${HL2_GOTY_ISO:-${1:-}}"
dest="${HL2_GOTY_ROOT:-/home/ted/.local/share/source-wasm/hl2-dvd}"

if [[ -z "${iso}" ]]; then
  for candidate in \
    "/home/ted/Desktop/Half-Life 2 Collectors Edition (2153).iso" \
    /inputs/iso/*.iso \
    /inputs/iso
  do
    if [[ -f "${candidate}" ]]; then iso="${candidate}"; break; fi
    if [[ -d "${candidate}" && -f "${candidate}/hl2/gameinfo.txt" ]]; then
      iso="${candidate}"
      break
    fi
  done
fi

if [[ -f "${dest}/hl2/gameinfo.txt" ]]; then
  echo "GOTY extract already present at ${dest}"
  exit 0
fi

if [[ -z "${iso}" ]]; then
  echo "set HL2_GOTY_ISO to the 2014 GOTY / Collectors Edition ISO" >&2
  exit 2
fi

mkdir -p "$(dirname "${dest}")"
if [[ -L "${dest}" ]]; then
  echo "refusing to replace symlink GOTY destination ${dest}" >&2
  exit 1
fi

work="${dest}.extract-work"
rm -rf "${work}"
mkdir -p "${work}/stage"
trap 'rm -rf -- "${work}"' EXIT

write_runtime_metadata() {
  local stage="$1"
  mkdir -p "${stage}/hl2"
  printf '%s\n' \
    '"GameInfo"' \
    '{' \
    '    game        "HALF-LIFE 2"' \
    "    title       \"HALF-LIFE'\"" \
    '    type        singleplayer_only' \
    '' \
    '    FileSystem' \
    '    {' \
    '        SteamAppId                 220' \
    '' \
    '        SearchPaths' \
    '        {' \
    '            mod+mod_write+default_write_path    |gameinfo_path|.' \
    '            game+game_write                    hl2' \
    '            gamebin                             hl2/bin' \
    '            game                                |all_source_engine_paths|hl2' \
    '            platform                            |all_source_engine_paths|platform' \
    '        }' \
    '    }' \
    '}' > "${stage}/hl2/gameinfo.txt"
  printf '%s\n' \
    'PatchVersion=1' \
    'ClientVersion=1' \
    'ServerVersion=1' \
    'ProductName=hl2' \
    'appID=220' \
    'ServerAppID=0' > "${stage}/hl2/steam.inf"
}

publish_stage() {
  local stage="$1"
  if [[ ! -f "${stage}/hl2/gameinfo.txt" || ! -f "${stage}/hl2/steam.inf" ]]; then
    echo "GOTY extraction did not produce hl2/gameinfo.txt and hl2/steam.inf" >&2
    exit 1
  fi
  rm -f "${stage}/hl2/glshaders.cfg"
  local previous=''
  if [[ -e "${dest}" ]]; then
    previous="${dest}.incomplete-$(date +%s)"
    mv "${dest}" "${previous}"
  fi
  mv "${stage}" "${dest}"
  echo "extracted 2014 GOTY files to ${dest}"
  if [[ -n "${previous}" ]]; then
    echo "preserved previous incomplete extract at ${previous}"
  fi
}

if [[ -d "${iso}" && -f "${iso}/hl2/gameinfo.txt" ]]; then
  cp -a "${iso}/." "${work}/stage/"
  write_runtime_metadata "${work}/stage"
  publish_stage "${work}/stage"
  exit 0
fi

if [[ ! -f "${iso}" ]]; then
  echo "GOTY input is neither an ISO nor an extracted hl2 tree: ${iso}" >&2
  exit 2
fi

if ! command -v 7z >/dev/null; then
  echo "need 7z to open the 2014 GOTY / Collectors Edition ISO" >&2
  exit 1
fi
if ! command -v msiextract >/dev/null; then
  echo "need msiextract (from msitools): the HalfLife2.cab is flat and cannot be safely unpacked with cabextract/7z alone" >&2
  exit 1
fi

mkdir -p "${work}/iso" "${work}/msi"
7z x -y -o"${work}/iso" "${iso}" >/dev/null
msi="$(find "${work}/iso" -maxdepth 2 -type f -iname 'hl2.msi' -print -quit)"
if [[ -z "${msi}" ]]; then
  echo "2014 ISO did not contain hl2.msi; refusing to publish a flat cabinet extract" >&2
  exit 1
fi

msiextract -C "${work}/msi" "${msi}" >/dev/null
install_root="$(find "${work}/msi" -mindepth 1 -maxdepth 1 -type d -name 'APPDIR:*' -print -quit)"
if [[ -z "${install_root}" || ! -d "${install_root}/hl2" ]]; then
  echo "msiextract output did not contain the expected APPDIR/hl2 tree" >&2
  exit 1
fi

# The ISO installer contains several Source games. Only the HL2 and shared
# platform trees are in scope for this recipe; all native binaries are removed
# later by combine-owner-data.mjs before any owner data is served.
cp -a "${install_root}/hl2" "${work}/stage/hl2"
if [[ -d "${install_root}/platform" ]]; then
  cp -a "${install_root}/platform" "${work}/stage/platform"
fi
write_runtime_metadata "${work}/stage"
publish_stage "${work}/stage"
