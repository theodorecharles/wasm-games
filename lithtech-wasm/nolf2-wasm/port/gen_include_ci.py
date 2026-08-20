#!/usr/bin/env python3
"""Generate case-insensitive include wrappers for NOLF2 ObjectDLL on Linux."""
from __future__ import print_function
import os
import re
import sys

def collect_headers(search_dirs):
    index = {}
    for d in search_dirs:
        if not os.path.isdir(d):
            continue
        for dirpath, _, files in os.walk(d):
            for f in files:
                ext = os.path.splitext(f)[1].lower()
                if ext not in ('.h', '.hpp', '.inl') and f.lower() not in ('hash_map', 'hash_set'):
                    continue
                key = f.lower()
                if key not in index:
                    index[key] = os.path.join(dirpath, f)
    return index


def existing_names(dirs):
    names = set()
    for d in dirs:
        if not os.path.isdir(d):
            continue
        for f in os.listdir(d):
            names.add(f)
            names.add(f.lower())
    return names


def scan_includes(scan_dirs):
    inc_re = re.compile(r'#\s*include\s*[<"]([^">]+)[">]')
    names = set()
    for d in scan_dirs:
        if not os.path.isdir(d):
            continue
        for dirpath, _, files in os.walk(d):
            for f in files:
                if not f.lower().endswith(('.cpp', '.h', '.hpp', '.c')):
                    continue
                path = os.path.join(dirpath, f)
                try:
                    text = open(path, 'r', errors='ignore').read()
                except OSError:
                    continue
                for m in inc_re.finditer(text):
                    names.add(m.group(1).replace('\\', '/'))
    return names


def main():
    if len(sys.argv) < 4:
        print('usage: gen_include_ci.py OUTDIR SKIPDIR SEARCHDIR [SEARCHDIR...]', file=sys.stderr)
        return 2
    outdir = sys.argv[1]
    skipdir = sys.argv[2]
    search_dirs = sys.argv[3:]
    skip_dirs = [skipdir]
    for d in search_dirs:
        base = os.path.basename(d.rstrip('/'))
        if base in ('compat', 'shims'):
            skip_dirs.append(d)
    skip_names = existing_names(skip_dirs)
    # Also skip names already present in the first search dirs that are port overlays.
    index = collect_headers(search_dirs)
    scan = []
    for d in search_dirs:
        if 'NOLF2' in d or d.endswith('ObjectDLL') or d.endswith('Shared') or d.endswith('TO2'):
            scan.append(d)
    includes = scan_includes(scan)
    # Always emit common Windows/Linux case aliases.
    extra = [
        'stdafx.h', 'StdAfx.h', 'Stdafx.h',
        'windows.h', 'Windows.h', 'winutil.h', 'WinUtil.h',
        'iserverdir.h', 'iserverdir_titan.h',
        'globals.h', 'Globals.h',
        'SFXMsgIDs.h', 'sfxmsgids.h', 'SfxMsgIds.h',
        'MsgIds.h', 'msgids.h',
        'ButeMgr.h', 'butemgr.h',
        'commonutilities.h', 'CommonUtilities.h',
        'LTObjRef.h', 'LtObjRef.h',
        'ILTCommon.h', 'ILTMessage.h', 'LTVector.h',
        'IObjectPlugin.h', 'iobjectplugin.h',
        'gameservershell.h', 'serverutilities.h',
        'clientservershared.h', 'parsedmsg.h',
        'CommandIds.h', 'FXFlags.h', 'FXDefs.h',
        'AIGOALTypeEnums.h', 'SoundbuteMgr.h',
        'DoomsdayDevice.h', 'DoomsdayPiece.h',
        'LinkList.h', 'resshared.h', 'clientresshared.h',
    ]
    includes.update(extra)

    if not os.path.isdir(outdir):
        os.makedirs(outdir)

    written = 0
    for inc in sorted(includes):
        base = os.path.basename(inc)
        if not base or '/' in inc and inc.startswith('sys/'):
            continue
        if base in skip_names or base.lower() in skip_names:
            # Only skip if the skip dir actually has this exact name.
            if base in skip_names:
                continue
        target = index.get(base.lower())
        if not target:
            continue
        # If the real file already has this exact basename and lives on the
        # search path, a wrapper is unnecessary unless the include uses a
        # different directory prefix.
        dest = os.path.join(outdir, inc)
        dest_dir = os.path.dirname(dest)
        if dest_dir and not os.path.isdir(dest_dir):
            os.makedirs(dest_dir)
        # Avoid wrapping over ourselves.
        if os.path.abspath(dest) == os.path.abspath(target):
            continue
        # Only write when the include name does not match the real basename
        # or the include has a path prefix.
        if os.path.basename(target) == base and '/' not in inc:
            continue
        body = '/* case-insensitive include wrapper */\n#include "%s"\n' % target
        if os.path.isfile(dest):
            try:
                if open(dest, 'r').read() == body:
                    continue
            except OSError:
                pass
        with open(dest, 'w') as fh:
            fh.write(body)
        written += 1
    print('include-ci: wrote %d wrappers to %s' % (written, outdir))
    return 0


if __name__ == '__main__':
    sys.exit(main())
