#!/usr/bin/env python3
"""Stage missing importer scenery as private installation files, never public assets.

Reads exact Emscripten preload bytes and the pinned native scenery table. Copies
an existing private media entry into a NEW data root, preserving every payload.
Requires the official v1.7.11 objects.zip; performs no network operations.
"""
import argparse
from decimal import Decimal
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import uuid
import zipfile

ARCHIVE_SHA256 = '74e73bbd012339511bb359dd0fbb148fda899790ae37d7d69861d88183b19452'
ARCHIVE_URL = 'https://github.com/OpenRCT2/objects/releases/download/v1.7.11/objects.zip'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def object_id(name, data):
    if name.lower().endswith('.parkobj'):
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            return json.loads(archive.read('object.json'))['id']
    return json.loads(data)['id']


def required_ids(tables):
    begin = tables.index('GetSceneryObjects(uint8_t sceneryType)')
    end = tables.index('return map[sceneryType];', begin)
    result = set(re.findall(r'"([a-z0-9_]+\.[a-z0-9_]+\.[a-z0-9_-]+)"', tables[begin:end]))
    if len(result) < 100:
        raise ValueError('Native scenery table is incomplete or its format changed')
    return result


def packaged_ids(script, data):
    # Parse data descriptors, never execute generated JavaScript.
    number = r'\d+(?:\.\d+)?(?:[eE][+-]?\d+)?'
    entries = re.findall(r'\{filename:"([^"]+)",start:(' + number + r'),end:(' + number + r')\}', script)
    if len(entries) < 100 or len(entries) != script.count('{filename:'):
        raise ValueError('Preload descriptor format is not recognized')
    objects = set()
    for name, start, end in entries:
        start, end = Decimal(start), Decimal(end)
        if start != int(start) or end != int(end):
            raise ValueError('Non-integral preload offset')
        start, end = int(start), int(end)
        if not 0 <= start <= end <= len(data):
            raise ValueError('Preload offset outside the data package')
        if name.startswith('/OpenRCT2/object/') and name.endswith(('.json', '.parkobj')):
            objects.add(object_id(name, data[start:end]))
    if len(objects) < 100:
        raise ValueError('No complete object inventory in preload package')
    return objects


def safe_name(name):
    path = PurePosixPath(name)
    if path.is_absolute() or '..' in path.parts or '\\' in name or not path.parts:
        raise ValueError(f'Unsafe media filename: {name}')
    return path


def wrap_metadata(payload):
    # Some official objects contain only metadata referencing original owner
    # sprites. A normal parkobj can carry that same object.json unchanged.
    document = json.loads(payload)
    if not all(isinstance(image, str) and (image == '' or image.startswith('$RCT2:'))
               for image in document.get('images', [])):
        raise ValueError('Loose object metadata needs additional local image files')
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w') as archive:
        info = zipfile.ZipInfo('object.json', (1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_STORED
        archive.writestr(info, payload)
    return stream.getvalue()


def stage(args):
    output = Path(args.output).resolve()
    source = Path(args.entry).resolve()
    if output.exists():
        raise ValueError('Output must not exist; original data and previous candidates are never overwritten')
    if output == source or source in output.parents or output in source.parents:
        raise ValueError('Source and output must be separate trees')
    archive_bytes = Path(args.archive).read_bytes()
    if digest(archive_bytes) != ARCHIVE_SHA256:
        raise ValueError('Official object release archive hash mismatch')
    script = Path(args.javascript).read_text()
    data = Path(args.data).read_bytes()
    tables = Path(args.tables).read_text()
    required = required_ids(tables)
    available = packaged_ids(script, data)
    entry = json.loads((source / '.media-entry.json').read_text())
    originals = []
    names = set()
    original_objects = set()
    for item in entry['files']:
        name = item['name']
        safe_name(name)
        if name in names:
            raise ValueError(f'Duplicate source file: {name}')
        names.add(name)
        source_file = source / 'files' / name
        if source_file.is_symlink() or not source_file.is_file() or not source_file.resolve().is_relative_to(source / 'files'):
            raise ValueError(f'Invalid source file: {name}')
        payload = source_file.read_bytes()
        if len(payload) != item['size']:
            raise ValueError(f'Source media size mismatch: {name}')
        originals.append({'name': name, 'sha256': digest(payload)})
        if name.startswith('ObjData/') and name.lower().endswith('.parkobj'):
            original_objects.add(object_id(name, payload))
    missing = sorted(required - available - original_objects)
    additions = []
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        candidates = {Path(name).name: name for name in archive.namelist() if name.endswith(('.parkobj', '.json'))}
        for identifier in missing:
            basename = identifier + '.parkobj'
            member = candidates.get(basename) or candidates.get(identifier + '.json')
            if not member:
                raise ValueError(f'Official release cannot supply required object: {identifier}')
            payload = archive.read(member)
            if object_id(member, payload) != identifier:
                raise ValueError(f'Object identity mismatch: {member}')
            if member.endswith('.json'):
                payload = wrap_metadata(payload)
            name = 'ObjData/' + basename
            if name in names:
                raise ValueError(f'Supplement would overwrite source content: {name}')
            additions.append((name, payload, member))
    if not additions:
        raise ValueError('No missing scenery objects: no copy needed')
    new_id = uuid.uuid5(uuid.NAMESPACE_URL, entry['id'] + ARCHIVE_SHA256 + '|'.join(missing)).hex
    target = output / 'media/openrct2-installation/entries' / new_id
    output.mkdir(mode=0o700)
    target.mkdir(parents=True, mode=0o700)
    (output / 'media/openrct2-installation/.incoming').mkdir(mode=0o700)
    for item in entry['files']:
        destination = target / 'files' / item['name']
        destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        shutil.copy2(source / 'files' / item['name'], destination)
    added = []
    used_ids = {item['id'] for item in entry['files']}
    for name, payload, member in additions:
        destination = target / 'files' / name
        destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with destination.open('xb') as handle:
            handle.write(payload)
        file_id = 'object-' + digest(payload)[:24]
        if file_id in used_ids:
            raise ValueError('Supplement file ID collision')
        used_ids.add(file_id)
        entry['files'].append({'id': file_id, 'name': name, 'size': len(payload)})
        added.append({'name': name, 'member': member, 'size': len(payload), 'sha256': digest(payload)})
    for original in originals:
        if digest((target / 'files' / original['name']).read_bytes()) != original['sha256']:
            raise ValueError('Original payload changed during copy')
    staged_objects = {object_id(item['name'], (target / 'files' / item['name']).read_bytes()) for item in added}
    missing_after = sorted(required - available - original_objects - staged_objects)
    if missing_after:
        raise ValueError(f'Staged object inventory is incomplete: {missing_after}')
    entry['id'] = new_id
    entry['totalSize'] = sum(item['size'] for item in entry['files'])
    entry['publicMetadata']['fileCount'] = len(entry['files'])
    (target / '.media-entry.json').write_text(json.dumps(entry, indent=2) + '\n')
    report = {'archive': {'url': ARCHIVE_URL, 'sha256': ARCHIVE_SHA256},
              'nativeJavascriptSha256': digest(script.encode()), 'nativeDataSha256': digest(data),
              'nativeTablesSha256': digest(tables.encode()), 'requiredSceneryObjects': len(required),
              'packagedObjects': len(available), 'missingBefore': missing, 'missingAfter': missing_after,
              'originalFilesPreserved': len(originals),
              'originalInventorySha256': digest(json.dumps(originals, sort_keys=True).encode()),
              'entryId': new_id, 'fileCount': len(entry['files']), 'totalSize': entry['totalSize'], 'added': added}
    (output / 'installation-objects-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ['requiredSceneryObjects', 'packagedObjects', 'originalFilesPreserved', 'fileCount', 'entryId']}))
    print(f'Added {len(added)} private objects; original tree unchanged; staged at {output}')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['entry', 'javascript', 'data', 'tables', 'archive', 'output']:
        parser.add_argument('--' + name, required=True)
    stage(parser.parse_args())
