#!/usr/bin/env python3
import argparse
import contextlib
import importlib.util
import io
import json
import re
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('stage_objects', Path(__file__).with_name('stage-installation-objects.py'))
stage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage)


class StageObjectsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='openrct2-object-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.entry = self.root / 'entry'
        (self.entry / 'files/Data').mkdir(parents=True)
        (self.entry / 'files/Data/original.dat').write_bytes(b'original owner bytes')
        self.metadata = {'id': 'fixture', 'files': [{'id': 'original', 'name': 'Data/original.dat', 'size': 20}],
                         'publicMetadata': {'fileCount': 1}, 'totalSize': 20}
        self.write_entry()
        identifiers = [f'rct2.scenery_small.fixture{i}' for i in range(101)]
        (self.root / 'tables').write_text('GetSceneryObjects(uint8_t sceneryType) {' +
            ','.join(json.dumps(identifier) for identifier in identifiers) + '; return map[sceneryType]; }')
        payload = bytearray()
        descriptors = []
        for identifier in identifiers[:100]:
            start = len(payload)
            payload.extend(json.dumps({'id': identifier}).encode())
            descriptors.append('{filename:"/OpenRCT2/object/' + identifier + '.json",start:' + str(start) + ',end:' + str(len(payload)) + '}')
        (self.root / 'data').write_bytes(payload)
        (self.root / 'javascript').write_text(','.join(descriptors))
        with zipfile.ZipFile(self.root / 'archive', 'w') as archive:
            archive.writestr('official/scenery_small/' + identifiers[-1] + '.json',
                             json.dumps({'id': identifiers[-1], 'images': ['$RCT2:OBJDATA/OWNER.DAT[0]', '']}))
        self.previous_hash = stage.ARCHIVE_SHA256
        stage.ARCHIVE_SHA256 = stage.digest((self.root / 'archive').read_bytes())
        self.addCleanup(setattr, stage, 'ARCHIVE_SHA256', self.previous_hash)
        self.args = argparse.Namespace(entry=str(self.entry), output=str(self.root / 'new'),
            **{name: str(self.root / name) for name in ['tables', 'javascript', 'data', 'archive']})

    def write_entry(self):
        (self.entry / '.media-entry.json').write_text(json.dumps(self.metadata))

    def run_stage(self):
        with contextlib.redirect_stdout(io.StringIO()):
            return stage.stage(self.args)

    def test_preserves_original_adds_missing_and_wraps_metadata(self):
        before = (self.entry / '.media-entry.json').read_bytes()
        report = self.run_stage()
        self.assertEqual(report['originalFilesPreserved'], 1)
        self.assertEqual(report['requiredSceneryObjects'], 101)
        self.assertEqual(report['packagedObjects'], 100)
        self.assertEqual(report['fileCount'], 2)
        target = Path(self.args.output) / 'media/openrct2-installation/entries' / report['entryId']
        self.assertEqual((target / 'files/Data/original.dat').read_bytes(), b'original owner bytes')
        self.assertEqual((self.entry / '.media-entry.json').read_bytes(), before)
        obj = target / 'files' / report['added'][0]['name']
        with zipfile.ZipFile(obj) as archive:
            self.assertEqual(json.loads(archive.read('object.json'))['id'], 'rct2.scenery_small.fixture100')
        self.assertEqual(Path(self.args.output).stat().st_mode & 0o777, 0o700)

    def test_refuses_existing_output(self):
        Path(self.args.output).mkdir()
        with self.assertRaisesRegex(ValueError, 'must not exist'):
            self.run_stage()

    def test_minified_preload_scientific_notation_offsets(self):
        script = (self.root / 'javascript').read_text()
        script = re.sub(r'(start:|end:)(\d+)', lambda match: match[1] + match[2] + 'e0', script)
        self.assertEqual(len(stage.packaged_ids(script, (self.root / 'data').read_bytes())), 100)

    def test_refuses_release_hash_mismatch(self):
        stage.ARCHIVE_SHA256 = '0' * 64
        with self.assertRaisesRegex(ValueError, 'hash mismatch'):
            self.run_stage()
        self.assertFalse(Path(self.args.output).exists())

    def test_refuses_changed_owner_size(self):
        self.metadata['files'][0]['size'] = 999
        self.write_entry()
        with self.assertRaisesRegex(ValueError, 'size mismatch'):
            self.run_stage()

    def test_refuses_source_symlink(self):
        (self.entry / 'files/Data/link.dat').symlink_to('original.dat')
        self.metadata['files'].append({'id': 'link', 'name': 'Data/link.dat', 'size': 20})
        self.write_entry()
        with self.assertRaisesRegex(ValueError, 'Invalid source'):
            self.run_stage()

    def test_metadata_wrapper_does_not_drop_required_images(self):
        with self.assertRaisesRegex(ValueError, 'additional local image'):
            stage.wrap_metadata(json.dumps({'images': [{'path': 'missing.png'}]}).encode())

    def test_rejects_paths_and_unknown_table_format(self):
        for name in ['../outside', '/absolute', 'Data/../../escape', 'Data\\escape']:
            with self.assertRaises(ValueError):
                stage.safe_name(name)
        with self.assertRaises(ValueError):
            stage.required_ids('not a native table')


if __name__ == '__main__':
    unittest.main()
