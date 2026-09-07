#!/usr/bin/env python3
"""Exercise the real menu packer without modifying generated site artifacts."""

import contextlib
import hashlib
import importlib.util
import io
import os
from pathlib import Path
import shutil
import struct
import tempfile
import unittest
from unittest import mock
import zipfile


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("rtcw_menu_packer", ROOT / "scripts/pack-rtcw-menus.py")
PACKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PACKER)
CLOCKS = ((2024, 2, 3, 4, 5, 6, 5, 34, -1), (2030, 8, 9, 10, 11, 12, 4, 221, -1))


def build(tree, destination, clock, epoch=None, legacy=False):
    with mock.patch.dict(os.environ, {}, clear=False):
        os.environ.pop("SOURCE_DATE_EPOCH", None)
        if epoch is not None:
            os.environ["SOURCE_DATE_EPOCH"] = epoch
        with mock.patch("zipfile.time.localtime", return_value=clock):
            with contextlib.redirect_stdout(io.StringIO()):
                if legacy:
                    # The original packing policy, retained as a negative control.
                    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                        for name, data in PACKER.collect(tree).items():
                            archive.writestr(name, data)
                else:
                    PACKER.pack(tree, destination)
    return destination.read_bytes()


def compressed_members(payload):
    result = {}
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        for entry in archive.infolist():
            # Local file header: fixed 30-byte prefix, then name and extra data.
            name_size, extra_size = struct.unpack_from("<HH", payload, entry.header_offset + 26)
            start = entry.header_offset + 30 + name_size + extra_size
            result[entry.filename] = payload[start:start + entry.compress_size]
    return result


class MenuPackTests(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory(prefix="rtcw-menu-pack-")
        self.addCleanup(self.scratch.cleanup)
        self.root = Path(self.scratch.name)

    def test_real_mp_and_sp_payloads_and_compression_unchanged(self):
        for variant in ("mp", "sp"):
            with self.subTest(variant=variant):
                tree = PACKER.MENUS / "src" / variant
                before = build(tree, self.root / "old.pk3", CLOCKS[0], legacy=True)
                after = build(tree, self.root / "new.pk3", CLOCKS[1])
                expected = PACKER.collect(tree)
                with zipfile.ZipFile(io.BytesIO(after)) as archive:
                    self.assertEqual(archive.namelist(), sorted(expected))
                    self.assertEqual({name: archive.read(name) for name in archive.namelist()}, expected)
                    self.assertIsNone(archive.testzip())
                    for entry in archive.infolist():
                        self.assertEqual(entry.date_time, (1980, 1, 1, 0, 0, 0))
                        self.assertEqual(entry.compress_type, zipfile.ZIP_DEFLATED)
                        self.assertEqual(entry.create_system, 3)
                        self.assertEqual(entry.external_attr, 0o600 << 16)
                        self.assertEqual(entry.extra, b"")
                        self.assertEqual(entry.comment, b"")
                self.assertEqual(compressed_members(before), compressed_members(after))

    def test_repeated_real_builds_ignore_clock_and_source_date_epoch(self):
        for variant in ("mp", "sp"):
            with self.subTest(variant=variant):
                tree = PACKER.MENUS / "src" / variant
                first = build(tree, self.root / "one.pk3", CLOCKS[0])
                second = build(tree, self.root / "two.pk3", CLOCKS[1])
                third = build(tree, self.root / "three.pk3", CLOCKS[1], epoch="1893456000")
                self.assertEqual(first, second)
                self.assertEqual(first, third)

    def test_old_policy_is_rejected_by_same_byte_equality(self):
        for variant in ("mp", "sp"):
            with self.subTest(variant=variant):
                tree = PACKER.MENUS / "src" / variant
                first = build(tree, self.root / "one.pk3", CLOCKS[0], legacy=True)
                second = build(tree, self.root / "two.pk3", CLOCKS[1], legacy=True)
                self.assertNotEqual(first, second)
                self.assertEqual(compressed_members(first), compressed_members(second))

    def test_input_metadata_and_creation_order_do_not_affect_output(self):
        tree = self.root / "tree"
        tree.mkdir()
        files = {"ui/z.menu": b"last menu\n", "ui/a.menu": b"first menu\n", "scripts/ui.shader": b"shader\n"}
        for name, data in files.items():
            target = tree / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        first = build(tree, self.root / "one.pk3", CLOCKS[0])
        clone = self.root / "clone"
        for name, data in reversed(list(files.items())):
            target = clone / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            target.chmod(0o400)
            os.utime(target, (1893456000, 1893456000))
        (clone / "ignored.txt").write_text("not an authored menu")
        second = build(clone, self.root / "two.pk3", CLOCKS[1])
        self.assertEqual(first, second)

    def test_explicit_host_metadata_overrides_zipinfo_platform_default(self):
        original = zipfile.ZipInfo

        class WindowsDefaultInfo(original):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                self.create_system = 0

        tree = PACKER.MENUS / "src/mp"
        first = build(tree, self.root / "one.pk3", CLOCKS[0])
        with mock.patch.object(zipfile, "ZipInfo", WindowsDefaultInfo):
            second = build(tree, self.root / "two.pk3", CLOCKS[1])
        self.assertEqual(first, second)

    def test_payload_change_still_changes_archive(self):
        tree = self.root / "mp"
        shutil.copytree(PACKER.MENUS / "src/mp", tree)
        first = build(tree, self.root / "one.pk3", CLOCKS[0])
        entry = next(iter(PACKER.collect(tree)))
        target = tree / entry
        target.write_bytes(target.read_bytes() + b"\n// packaging regression test\n")
        second = build(tree, self.root / "two.pk3", CLOCKS[0])
        self.assertNotEqual(hashlib.sha256(first).digest(), hashlib.sha256(second).digest())
        with zipfile.ZipFile(io.BytesIO(second)) as archive:
            self.assertEqual(archive.read(entry), target.read_bytes())

    def test_empty_tree_fails_before_replacing_destination(self):
        tree = self.root / "empty"
        tree.mkdir()
        destination = self.root / "existing.pk3"
        destination.write_bytes(b"existing archive sentinel")
        with self.assertRaisesRegex(SystemExit, "no menu files"):
            PACKER.pack(tree, destination)
        self.assertEqual(destination.read_bytes(), b"existing archive sentinel")


if __name__ == "__main__":
    unittest.main(verbosity=2)
