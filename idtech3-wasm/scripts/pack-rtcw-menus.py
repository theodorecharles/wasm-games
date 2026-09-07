#!/usr/bin/env python3
"""Pack the authored RTCW browser menus into override pk3s."""

from __future__ import annotations

import argparse
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MENUS = ROOT / "games/rtcw/site/menus"


def collect(tree: Path) -> dict[str, bytes]:
    files: dict[str, bytes] = {}
    for path in sorted(tree.rglob("*")):
        if not path.is_file() or path.suffix not in {".menu", ".shader"}:
            continue
        relative = path.relative_to(tree).as_posix()
        files[relative] = path.read_bytes()
    if not files:
        raise SystemExit(f"no menu files under {tree}")
    return files


def pack(tree: Path, destination: Path) -> None:
    files = collect(tree)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in files.items():
            # String names make writestr stamp the current local build time.
            # Fixed ZIP metadata keeps identical authored menus byte-identical
            # across builds, independent of input mtimes and the build host.
            entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = 0o600 << 16
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, data)
    print(f"wrote {destination} ({len(files)} files, {destination.stat().st_size} bytes)")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args(argv)
    # iortcw temporarily rewrites mp_* -> zz_* for sort, then zz_* -> mp_*.
    # A pack named zz_*.pk3 is therefore opened as mp_*.pk3 and never loads.
    pack(MENUS / "src/mp", MENUS / "mp_wasm.pk3")
    # SP does the same rewrite with sp_* <-> zz_*.
    pack(MENUS / "src/sp", MENUS / "sp_wasm.pk3")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
