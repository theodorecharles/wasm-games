#!/usr/bin/env python3
"""Build deterministic PK3s from an installed Half-Life tree."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import zipfile

from PIL import Image

GAME_DIRS = ("valve", "bshift", "gearbox", "cstrike")
NATIVE_SUFFIXES = {".dll", ".dylib", ".so", ".exe"}
USER_FILES = {
    "autoexec.cfg", "cached.wad", "config.cfg", "custom.hpk",
    "gameserverconfig.vdf", "steam_autocloud.vdf", "userconfig.cfg",
}
USER_DIRS = {"download", "downloads", "logs", "save", "screenshots"}
FIXED_TIME = (1980, 1, 1, 0, 0, 0)


def include(relative: Path) -> bool:
    lowered = [part.lower() for part in relative.parts]
    if any(part in USER_DIRS for part in lowered[:-1]):
        return False
    if lowered[-1] in USER_FILES or relative.suffix.lower() in NATIVE_SUFFIXES:
        return False
    if relative.suffix.lower() in {".dem", ".log", ".sav"}:
        return False
    return True


def candidates(root: Path):
    values = []
    for directory, names, files in os.walk(root):
        names[:] = sorted(name for name in names if not (Path(directory) / name).is_symlink())
        for name in files:
            source = Path(directory) / name
            if source.is_symlink() or not source.is_file():
                continue
            relative = source.relative_to(root)
            if include(relative):
                values.append((relative.as_posix(), source))
    return sorted(values, key=lambda value: (value[0].lower(), value[0]))


def build_archive(source: Path, target: Path):
    files = candidates(source)
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, path in files:
            info = zipfile.ZipInfo(name, FIXED_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o444) << 16
            with path.open("rb") as handle:
                archive.writestr(info, handle.read(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    return {"file": target.name, "files": len(files), "size": target.stat().st_size, "sha256": digest}


def build_icons(source: Path, output: Path, game: str):
    icon = source / ("cstrike.ico" if game == "cstrike" and not (source / "game.ico").is_file() else "game.ico")
    if not icon.is_file():
        raise FileNotFoundError(f"Required icon is missing: {icon}")
    with Image.open(icon) as image:
        frames = []
        for index in range(getattr(image, "n_frames", 1)):
            image.seek(index)
            frames.append(image.convert("RGBA"))
        largest = max(frames, key=lambda frame: frame.width * frame.height)
        result = {}
        for size in (192, 512):
            target = output / f"{game}-icon-{size}.png"
            resized = largest.resize((size, size), Image.Resampling.NEAREST)
            resized.save(target, format="PNG", optimize=False, compress_level=9)
            result[str(size)] = {
                "file": target.name,
                "size": target.stat().st_size,
                "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
            }
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("install", type=Path, help="Half-Life install containing valve/bshift/gearbox/cstrike")
    parser.add_argument("output", type=Path, help="output directory kept outside the repository")
    args = parser.parse_args()
    install = args.install.resolve()
    output = args.output.resolve()
    if not all((install / game).is_dir() for game in GAME_DIRS):
        parser.error(f"{install} must contain: {', '.join(GAME_DIRS)}")

    report = {}
    for game in GAME_DIRS:
        target = output / f"{game}-owner.pk3"
        report[game] = build_archive(install / game, target)
        descriptor = install / game / "liblist.gam"
        if not descriptor.is_file():
            raise FileNotFoundError(f"Required game descriptor is missing: {descriptor}")
        descriptor_target = output / f"{game}-liblist.gam"
        shutil.copyfile(descriptor, descriptor_target)
        report[game]["descriptor"] = {
            "file": descriptor_target.name,
            "size": descriptor_target.stat().st_size,
            "sha256": hashlib.sha256(descriptor_target.read_bytes()).hexdigest(),
        }
        icon = install / game / ("cstrike.ico" if game == "cstrike" and not (install / game / "game.ico").is_file() else "game.ico")
        icon_target = output / "owner-icons" / f"{game}.ico"
        icon_target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(icon, icon_target)
        report[game]["icons"] = build_icons(install / game, output, game)
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
