#!/usr/bin/env python3
"""Exercise the real owner packager using generated, non-retail fixtures."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("owner_packager", Path(__file__).with_name("package-owner-data.py"))
packager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packager)
stage_spec = importlib.util.spec_from_file_location("wad_stager", Path(__file__).with_name("stage-stored-wad-candidate.py"))
stager = importlib.util.module_from_spec(stage_spec)
stage_spec.loader.exec_module(stager)


class OwnerPackagingTests(unittest.TestCase):
    def test_random_access_archives_are_stored(self):
        with tempfile.TemporaryDirectory(prefix="goldsource-owner-test-") as root:
            root = Path(root)
            source = root / "source"
            source.mkdir()
            names = ["halflife.wad", "DECALS.WAD", "nested/OpFor.WaD", "sound/test.wav", "maps/test.bsp"]
            payloads = {name: (name.encode() + b"\0") * 1000 for name in names}
            for name, payload in payloads.items():
                target = source / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(payload)
            first = root / "first.pk3"
            second = root / "second.pk3"
            first_report = packager.build_archive(source, first)
            second_report = packager.build_archive(source, second)
            self.assertEqual(first_report["sha256"], second_report["sha256"], "builds remain deterministic")
            self.assertEqual(first.read_bytes(), second.read_bytes())
            with zipfile.ZipFile(first) as archive:
                self.assertEqual(set(archive.namelist()), set(names))
                for name, payload in payloads.items():
                    info = archive.getinfo(name)
                    expected = zipfile.ZIP_STORED if name.lower().endswith(".wad") else zipfile.ZIP_DEFLATED
                    self.assertEqual(info.compress_type, expected, name)
                    self.assertEqual(archive.read(name), payload, "only storage, never payload bytes, may change")
                    self.assertEqual(info.date_time, packager.FIXED_TIME)

    def test_existing_privacy_filter_is_preserved(self):
        for name in ["config.cfg", "cached.wad", "save/test.sav", "logs/game.log", "dlls/server.so", "client.dll"]:
            self.assertFalse(packager.include(Path(name)), name)
        for name in ["halflife.wad", "DECALS.WAD", "maps/test.bsp", "liblist.gam"]:
            self.assertTrue(packager.include(Path(name)), name)

    def test_candidate_repack_preserves_all_payloads_and_non_wad_streams(self):
        with tempfile.TemporaryDirectory(prefix="goldsource-repack-test-") as root:
            root = Path(root)
            source, target = root / "old.pk3", root / "new.pk3"
            with zipfile.ZipFile(source, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
                for name in ["halflife.wad", "DECALS.WAD", "maps/test.bsp", "sound/test.wav"]:
                    archive.writestr(name, name.encode() * 1000)
            before = source.read_bytes()
            report = stager.repack(source, target)
            self.assertTrue(report["payloadsIdentical"])
            self.assertTrue(report["nonWadCompressedBytesIdentical"])
            self.assertEqual(len(report["wads"]), 2)
            self.assertEqual(source.read_bytes(), before)
            with zipfile.ZipFile(target) as archive:
                self.assertEqual(archive.getinfo("DECALS.WAD").compress_type, zipfile.ZIP_STORED)
            with self.assertRaises(FileExistsError):
                stager.repack(source, target)

    def test_staging_rejects_path_escape_and_nonempty_output(self):
        with tempfile.TemporaryDirectory(prefix="goldsource-stage-test-") as root:
            root = Path(root)
            with self.assertRaises(ValueError):
                stager.bounded_path(root, "../outside")
            (root / "keep.txt").write_text("user content")
            with self.assertRaisesRegex(ValueError, "empty"):
                stager.stage(root / "data", root / "site", root)
            self.assertEqual((root / "keep.txt").read_text(), "user content")

    def test_full_stage_keeps_inputs_and_pairs_manifest_with_new_data(self):
        with tempfile.TemporaryDirectory(prefix="goldsource-stage-full-test-") as root:
            root = Path(root)
            data, site, output = root / "data", root / "site", root / "candidate"
            data.mkdir()
            site.mkdir()
            archive = data / "owner.pk3"
            with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as original:
                original.writestr("test.WAD", b"texture fixture" * 1000)
                original.writestr("maps/test.bsp", b"map fixture" * 1000)
            descriptor = data / "liblist.gam"
            descriptor.write_text("fixture game descriptor")
            entries = [{"path": file.name, "size": file.stat().st_size, "sha256": stager.digest(file)}
                       for file in [archive, descriptor]]
            manifest = {"version": "fixture-v1", "namespace": "fixture", "variants": {
                "first": {"files": entries}, "second": {"files": entries}}}
            original_manifest = json.dumps(manifest)
            (site / "wasm-game-data.json").write_text(original_manifest)
            (site / "game-adapter.js").write_text("fixture adapter bytes")
            report = stager.stage(data, site, output)
            self.assertTrue(report["originalsUnchanged"])
            generated = json.loads((output / "site/wasm-game-data.json").read_text())
            self.assertEqual(generated["version"], "fixture-v1-stored-wad-v1")
            for definition in generated["variants"].values():
                for entry in definition["files"]:
                    copied = output / "data" / entry["path"]
                    self.assertEqual(entry["sha256"], stager.digest(copied))
                    self.assertEqual(entry["size"], copied.stat().st_size)
            self.assertEqual((site / "wasm-game-data.json").read_text(), original_manifest)
            self.assertEqual((output / "site/game-adapter.js").read_text(), "fixture adapter bytes")
            self.assertFalse((output / "site/owner-report.json").exists())
            self.assertFalse((output / "site/data").exists())

            # Upgrading the site's manifest must not make old installations
            # impossible to migrate with their retained exact declarations.
            retained = root / "original-manifest.json"
            retained.write_text(original_manifest)
            (site / "wasm-game-data.json").write_text(json.dumps(generated))
            with self.assertRaisesRegex(ValueError, "Original manifest mismatch"):
                stager.stage(data, site, root / "wrong-manifest")
            migrated = root / "migrated"
            migrated_report = stager.stage(data, site, migrated, retained)
            self.assertEqual(migrated_report["sourceManifest"], str(retained))
            self.assertEqual(migrated_report["archives"], report["archives"])
            self.assertEqual(json.loads((migrated / "site/wasm-game-data.json").read_text()), generated)
            self.assertEqual(retained.read_text(), original_manifest)
            self.assertEqual(json.loads((site / "wasm-game-data.json").read_text()), generated)


if __name__ == "__main__":
    unittest.main()
