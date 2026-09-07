#!/usr/bin/env python3
"""Stage private, payload-identical owner archives and a separate candidate site.

Never edits the input data/site. The output must be an empty private directory;
only the generated site (not its sibling data/report) belongs in an image.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import zipfile

spec = importlib.util.spec_from_file_location("owner_packager", Path(__file__).with_name("package-owner-data.py"))
packager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packager)


def digest(path):
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def bounded_path(root, relative):
    result = (root / relative).resolve()
    if not result.is_relative_to(root) or result == root:
        raise ValueError(f"Path escapes its root: {relative}")
    return result


def compressed_digest(path, info):
    """Hash only a ZIP member's original stored/deflated byte stream."""
    result = hashlib.sha256()
    with path.open("rb") as handle:
        handle.seek(info.header_offset)
        header = handle.read(30)
        if len(header) != 30 or header[:4] != b"PK\x03\x04":
            raise ValueError("Invalid ZIP local header")
        handle.seek(int.from_bytes(header[26:28], "little") + int.from_bytes(header[28:30], "little"), 1)
        remaining = info.compress_size
        while remaining:
            chunk = handle.read(min(remaining, 1024 * 1024))
            if not chunk:
                raise ValueError("Truncated ZIP member")
            result.update(chunk)
            remaining -= len(chunk)
    return result.hexdigest()


def repack(source, target):
    before_hash = digest(source)
    wads = []
    payload_digest = hashlib.sha256()
    with zipfile.ZipFile(source) as original, zipfile.ZipFile(target, "x", compresslevel=9) as candidate:
        infos = original.infolist()
        if len({info.filename for info in infos}) != len(infos):
            raise ValueError("Duplicate archive members are not supported")
        for info in infos:
            if info.flag_bits & 1 or info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                raise ValueError(f"Unsupported/encrypted member: {info.filename}")
            updated = copy.copy(info)
            if Path(info.filename).suffix.lower() == ".wad":
                updated.compress_type = packager.archive_compression(info.filename)
                wads.append({"name": info.filename, "size": info.file_size,
                             "previousMethod": info.compress_type, "method": updated.compress_type})
            candidate.writestr(updated, original.read(info), compress_type=updated.compress_type, compresslevel=9)
        candidate.comment = original.comment
    # Re-read every member, verifying uncompressed payloads, names and order.
    # ZipFile also validates CRCs; the proof is not just a size/metadata check.
    with zipfile.ZipFile(source) as original, zipfile.ZipFile(target) as candidate:
        if original.namelist() != candidate.namelist():
            raise ValueError("Archive member names/order changed")
        for old_info, new_info in zip(original.infolist(), candidate.infolist()):
            with original.open(old_info) as old_file, candidate.open(new_info) as new_file:
                old_hash = hashlib.file_digest(old_file, "sha256").digest()
                new_hash = hashlib.file_digest(new_file, "sha256").digest()
            if old_hash != new_hash or old_info.file_size != new_info.file_size:
                raise ValueError(f"Payload changed: {old_info.filename}")
            if Path(old_info.filename).suffix.lower() != ".wad":
                if compressed_digest(source, old_info) != compressed_digest(target, new_info):
                    raise ValueError(f"Non-WAD compressed bytes changed: {old_info.filename}")
            payload_digest.update(old_info.filename.encode() + b"\0" + old_hash)
    if digest(source) != before_hash:
        raise ValueError("Original archive changed during staging")
    return {"previousSHA256": before_hash, "sha256": digest(target),
            "previousSize": source.stat().st_size, "size": target.stat().st_size,
            "members": len(infos), "payloadsIdentical": True,
            "nonWadCompressedBytesIdentical": True,
            "payloadIndexSHA256": payload_digest.hexdigest(), "wads": wads}


def stage(source_data, source_site, output, source_manifest=None):
    if output.exists() and any(output.iterdir()):
        raise ValueError("Output must be an empty private directory")
    if output == source_data or output == source_site or output.is_relative_to(source_data) or output.is_relative_to(source_site):
        raise ValueError("Output must be separate from both inputs")
    # A released site may already describe the replacement archives. An
    # explicitly retained original manifest permits migration from old data
    # without rolling back the current browser/native files.
    manifest_path = source_manifest or source_site / "wasm-game-data.json"
    manifest = json.loads(manifest_path.read_text())
    declarations = {}
    for variant in manifest["variants"].values():
        for entry in variant["files"]:
            prior = declarations.setdefault(entry["path"], entry)
            if (prior["size"], prior["sha256"]) != (entry["size"], entry["sha256"]):
                raise ValueError("Conflicting owner-file declarations")
    # Validate all originals before producing any candidate archive.
    for relative, entry in declarations.items():
        source = bounded_path(source_data, relative)
        if source.stat().st_size != entry["size"] or digest(source) != entry["sha256"]:
            raise ValueError(f"Original manifest mismatch: {relative}")
    output.mkdir(parents=True, exist_ok=True)
    site = output / "site"
    data = output / "data"
    shutil.copytree(source_site, site)
    data.mkdir()
    reports = {}
    for relative, entry in declarations.items():
        source = bounded_path(source_data, relative)
        target = bounded_path(data, relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        if source.suffix.lower() == ".pk3":
            reports[relative] = repack(source, target)
            print(f"Verified {relative}: {reports[relative]['members']} payload-identical members", flush=True)
        else:
            shutil.copy2(source, target)
            if digest(target) != entry["sha256"]:
                raise ValueError(f"Unchanged asset mismatch: {relative}")
    for variant in manifest["variants"].values():
        for entry in variant["files"]:
            if entry["path"] in reports:
                result = reports[entry["path"]]
                entry.update(size=result["size"], sha256=result["sha256"])
    manifest["version"] += "-stored-wad-v1"
    (site / "wasm-game-data.json").write_text(json.dumps(manifest, indent=2) + "\n")
    report = {"sourceData": str(source_data), "sourceSite": str(source_site),
              "output": str(output), "originalsUnchanged": True, "archives": reports}
    if source_manifest is not None:
        report["sourceManifest"] = str(source_manifest)
    (output / "owner-report.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_data", type=Path)
    parser.add_argument("source_site", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--source-manifest", type=Path,
                        help="Retained original manifest when the site already declares replacement data")
    args = parser.parse_args()
    stage(args.source_data.resolve(), args.source_site.resolve(), args.output.resolve(),
          args.source_manifest.resolve() if args.source_manifest else None)
