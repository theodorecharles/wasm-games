#!/usr/bin/env bash
set -euo pipefail

lab_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
portfolio_dir="$(CDPATH= cd -- "$lab_dir/.." && pwd)"
steam_common="${STEAM_COMMON:-$HOME/.steam/debian-installation/steamapps/common}"
data_root="${WASM_DATA_ROOT:-$portfolio_dir/data}"
strict="${STRICT_DATA:-0}"
warnings=0

warn() {
  warnings=$((warnings + 1))
  printf 'warning: %s\n' "$*" >&2
}

copy_as() {
  local source_file=$1
  local destination_file=$2
  if [[ ! -f "$source_file" ]]; then
    warn "missing $source_file"
    return 1
  fi
  install -d -m 0755 "$(dirname -- "$destination_file")"
  cp --reflink=auto --preserve=mode,timestamps -- "$source_file" "$destination_file"
}

copy_pattern() {
  local source_dir=$1
  local pattern=$2
  local destination_dir=$3
  local found=0 source_file
  if [[ ! -d "$source_dir" ]]; then
    warn "missing directory $source_dir"
    return 1
  fi
  install -d -m 0755 "$destination_dir"
  while IFS= read -r -d '' source_file; do
    found=1
    cp --reflink=auto --preserve=mode,timestamps -- "$source_file" "$destination_dir/$(basename -- "$source_file")"
  done < <(find "$source_dir" -maxdepth 1 -type f -iname "$pattern" -print0)
  if [[ $found -eq 0 ]]; then
    warn "no $pattern files under $source_dir"
    return 1
  fi
}

copy_tree() {
  local source_dir=$1
  local destination_dir=$2
  if [[ ! -d "$source_dir" ]]; then
    warn "missing directory $source_dir"
    return 1
  fi
  install -d -m 0755 "$destination_dir"
  cp -a --reflink=auto -- "$source_dir/." "$destination_dir/"
}

printf 'Staging required game files under %s\n' "$data_root"
install -d -m 0755 "$data_root"

# id Tech 2 family.
copy_as "$steam_common/Quake/Id1/PAK0.PAK" "$data_root/quake1/id1/pak0.pak" || true
copy_as "$steam_common/Quake/Id1/PAK1.PAK" "$data_root/quake1/id1/pak1.pak" || true
for pak in pak0.pak pak1.pak pak2.pak; do
  copy_as "$steam_common/Quake 2/baseq2/$pak" "$data_root/quake2/$pak" || true
done

# id Tech 3 family. Enemy Territory provisions its own public runtime data.
for number in {0..8}; do
  copy_as "$steam_common/Quake 3 Arena/baseq3/pak${number}.pk3" "$data_root/quake3/pak${number}.pk3" || true
done
copy_pattern "$steam_common/Return to Castle Wolfenstein/Main" '*.pk3' "$data_root/rtcw/Main" || true
install -d -m 0755 "$data_root/wolfet"

# id Tech 4 family; the locked containers mount these three directories at a
# shared /data layout.
copy_pattern "$steam_common/Doom 3/base" '*.pk4' "$data_root/doom3/base" || true
copy_pattern "$steam_common/Doom 3/d3xp" '*.pk4' "$data_root/doom3/d3xp" || true
copy_pattern "$steam_common/Quake 4/q4base" '*.pk4' "$data_root/quake4/q4base" || true
prey_source="$steam_common/Prey 2006/base"
for package in game{00..03}.pk4 pak{000..006}.pk4 pak020.pk4 pak040.pk4; do
  copy_as "$prey_source/$package" "$data_root/prey/base/$package" || true
done

# Build family.
blood_source="$steam_common/One Unit Whole Blood"
for file in BLOOD.INI BLOOD.RFF GUI.RFF SOUNDS.RFF SURFACE.DAT VOXEL.DAT TILES{000..017}.ART; do
  copy_as "$blood_source/$file" "$data_root/blood/$file" || true
done
for pattern in '*.DEM' 'CP*.MAP' 'CP*.AR_' 'CRYPTIC.*' 'GTI.SMK' 'LOGO.SMK' 'blood*.ogg'; do
  copy_pattern "$blood_source" "$pattern" "$data_root/blood" || true
done
if [[ -n "${DUKE3D_SOURCE:-}" ]]; then
  copy_pattern "$DUKE3D_SOURCE" 'duke3d.grp' "$data_root/duke3d" || true
  copy_pattern "$DUKE3D_SOURCE" 'duke.rts' "$data_root/duke3d" || true
elif ! find "$data_root/duke3d" -maxdepth 1 -type f -iname 'duke3d.grp' -print -quit 2>/dev/null | grep -q .; then
  warn 'DUKE3D_SOURCE is unset; use the framework setup page or point it at the local Duke3D directory'
fi

# id Tech 1 family. The existing `crispy` directory is retained so the current
# workstation data does not need a second 100 MB copy.
copy_as "$steam_common/Ultimate Doom/base/DOOM.WAD" "$data_root/crispy/DOOM.WAD" || true
copy_as "$steam_common/Doom 2/base/DOOM2.WAD" "$data_root/crispy/DOOM2.WAD" || true
copy_as "$steam_common/Final Doom/base/TNT.WAD" "$data_root/crispy/TNT.WAD" || true
copy_as "$steam_common/Final Doom/base/PLUTONIA.WAD" "$data_root/crispy/PLUTONIA.WAD" || true
copy_as "$steam_common/Heretic Shadow of the Serpent Riders/base/HERETIC.WAD" "$data_root/crispy/HERETIC.WAD" || true
copy_as "$steam_common/Hexen/base/HEXEN.WAD" "$data_root/crispy/HEXEN.WAD" || true
if [[ -n "${CHEX_SOURCE:-}" ]]; then
  copy_as "$CHEX_SOURCE/CHEX.WAD" "$data_root/crispy/CHEX.WAD" || true
elif [[ ! -f "$data_root/crispy/CHEX.WAD" ]]; then
  warn 'CHEX_SOURCE is unset and CHEX.WAD is not staged'
fi

# Wolf4SDL and CoD2 diagnostic data contracts.
copy_pattern "$steam_common/Wolfenstein 3D/base" '*.WL6' "$data_root/wolf3d" || true
copy_pattern "$steam_common/Wolfenstein 3D/base/m1" '*.SOD' "$data_root/wolf3d/spear" || true
copy_pattern "$steam_common/Call of Duty 2/main" '*.iwd' "$data_root/cod2/main" || true

# GoldSource uses deterministic filtered PK3s instead of exposing the entire
# installation. Enable packaging explicitly after its Python requirements are
# installed; existing packages are preserved otherwise.
if [[ "${PACKAGE_GOLDSOURCE:-0}" == 1 ]]; then
  output_dir="$(mktemp -d -t wasm-game-lab-goldsource.XXXXXX)"
  cleanup_output() { find "$output_dir" -mindepth 1 -depth -delete 2>/dev/null || true; rmdir "$output_dir" 2>/dev/null || true; }
  trap cleanup_output EXIT INT TERM
  python3 "$portfolio_dir/goldsource-wasm/scripts/package-owner-data.py" "$steam_common/Half-Life" "$output_dir"
  install -d -m 0755 "$data_root/goldsource/goldsource/icons"
  find "$output_dir" -maxdepth 1 -type f -name '*-owner.pk3' -exec cp --reflink=auto --preserve=mode,timestamps {} "$data_root/goldsource/goldsource/" \;
  find "$output_dir" -maxdepth 1 -type f -name '*-liblist.gam' -exec cp --reflink=auto --preserve=mode,timestamps {} "$data_root/goldsource/goldsource/" \;
  find "$output_dir" -maxdepth 1 -type f -name '*-icon-*.png' -exec cp --reflink=auto --preserve=mode,timestamps {} "$data_root/goldsource/goldsource/icons/" \;
  cleanup_output
  trap - EXIT INT TERM
elif [[ ! -d "$data_root/goldsource/goldsource" ]]; then
  warn 'GoldSource packs are not staged; run with PACKAGE_GOLDSOURCE=1 or use the framework setup page'
fi

# Source-family diagnostic checkpoint: exact files only.
hl2_source="$steam_common/Half-Life 2"
for relative in \
  hl2/gameinfo.txt hl2/steam.inf hl2/hl2_pak_dir.vpk hl2/hl2_pak_000.vpk \
  hl2/hl2_misc_dir.vpk hl2/hl2_textures_dir.vpk hl2/hl2_sound_misc_dir.vpk \
  hl2/hl2_sound_vo_english_dir.vpk platform/platform_misc_dir.vpk; do
  copy_as "$hl2_source/$relative" "$data_root/source/$relative" || true
done

# DOSBox owner data stays under the sibling data root. DOS_GAMES_ROOT may contain
# JILL, JILL2, JILL3, JAZZ, DUKE1, DUKE2, and GTA (lowercase variant directory
# names are accepted too). NFS_DATA_ROOT and SC2000_DATA_ROOT must point to the
# prepared directories described by dosbox-wasm/RUNBOOK.md. Remote hosts and
# proprietary archives are never queried or copied.
if [[ -n "${DOS_GAMES_ROOT:-}" ]]; then
  for specification in 'jill1 JILL' 'jill2 JILL2' 'jill3 JILL3' 'jazz JAZZ' 'duke1 DUKE1' 'duke2 DUKE2' 'gta GTA'; do
    variant="${specification%% *}"
    source_name="${specification#* }"
    source_dir="$DOS_GAMES_ROOT/$source_name"
    [[ -d "$source_dir" ]] || source_dir="$DOS_GAMES_ROOT/$variant"
    copy_tree "$source_dir" "$data_root/dosbox/$variant" || true
  done
else
  for variant in jill1 jill2 jill3 jazz duke1 duke2 gta; do
    [[ -d "$data_root/dosbox/$variant" ]] || warn "DOS_GAMES_ROOT is unset and $variant data is not staged"
  done
fi
if [[ -n "${NFS_DATA_ROOT:-}" ]]; then
  copy_tree "$NFS_DATA_ROOT" "$data_root/dosbox/nfs" || true
elif [[ ! -d "$data_root/dosbox/nfs" ]]; then
  warn 'NFS_DATA_ROOT is unset and prepared nfs data is not staged'
fi
if [[ -n "${SC2000_DATA_ROOT:-}" ]]; then
  copy_tree "$SC2000_DATA_ROOT" "$data_root/dosbox/simcity2000" || true
elif [[ ! -d "$data_root/dosbox/simcity2000" ]]; then
  warn 'SC2000_DATA_ROOT is unset and prepared simcity2000 data is not staged'
fi

find "$data_root" -type d -exec chmod 0755 {} +
find "$data_root" -type f -exec chmod a+r {} +

printf '\nPersistent data directories:\n'
du -sh "$data_root"/* 2>/dev/null | sort || true
if [[ $warnings -gt 0 ]]; then
  printf '\nCompleted with %d warning(s).\n' "$warnings" >&2
  [[ "$strict" != 1 ]] || exit 1
fi
