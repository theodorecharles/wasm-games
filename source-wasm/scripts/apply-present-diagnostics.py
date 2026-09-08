#!/usr/bin/env python3
"""Observe final WebGL presentation encodings without changing the blit."""
import json
import pathlib
import subprocess
import sys

PACKAGE = pathlib.Path(__file__).resolve().parent.parent
HELPERS = ['source_wasm_present_diagnostics.h', 'source_wasm_present_blit.inl']


def replacements():
    anchor = '\t// this is blit #1 or #2 depending on what took place above.\n\tif (yflip)'
    return [
        ('#include "convar.h"', '#include "convar.h"\n#include "source_wasm_present_diagnostics.h"'),
        (anchor, '#include "source_wasm_present_blit.inl"\n' + anchor),
    ]


def planned_changes(root):
    file = root / 'togles/linuxwin/glmgr.cpp'
    text = file.read_text()
    for original, replacement in replacements():
        # The separately verified production transfer inserts its conditional
        # draw after this observation while retaining the native blit fallback.
        combined = '#include "source_wasm_present_blit.inl"\n#include "source_wasm_present_transfer.inl"\n\t// this is blit #1 or #2 depending on what took place above.\n\tif (sourceEncodedPresent)'
        if original.startswith('\t// this is blit #1') and combined in text:
            if text.count(combined) != 1 or text.count('#include "source_wasm_present_blit.inl"') != 1:
                raise ValueError('Ambiguous combined final presentation diagnostics')
            continue
        if replacement in text:
            if text.count(replacement) != 1 or text.count(original) != replacement.count(original):
                raise ValueError('Ambiguous patched presentation anchor')
        elif text.count(original) != 1:
            raise ValueError('Expected one final presentation anchor; refusing to patch')
        else:
            text = text.replace(original, replacement, 1)
    changes = {file: text}
    for name in HELPERS:
        helper = root / 'public' / name
        expected = (PACKAGE / 'patches/files' / name).read_text()
        if helper.exists() and helper.read_text() != expected:
            raise ValueError(f'Existing presentation helper differs: {helper}')
        changes[helper] = expected
    return changes


def main(arguments):
    check_only = arguments[:1] == ['--check']
    if check_only:
        arguments = arguments[1:]
    if len(arguments) != 1:
        raise SystemExit('Usage: apply-present-diagnostics.py [--check] PRIVATE_SOURCE_ROOT')
    root = pathlib.Path(arguments[0]).resolve()
    if root == PACKAGE.parent or PACKAGE.parent in root.parents:
        raise SystemExit('Native diagnostics must target a private source tree outside this checkout')
    pin = json.loads((PACKAGE / 'side-module-reference.json').read_text())['sourceCommit']
    actual = subprocess.check_output(['git', '-c', f'safe.directory={root}', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
    if actual != pin:
        raise SystemExit('Wrong private source pin')
    try:
        changes = planned_changes(root)
    except ValueError as error:
        raise SystemExit(str(error)) from error
    missing = [file for file, text in changes.items() if not file.is_file() or file.read_text() != text]
    if check_only:
        if missing:
            raise SystemExit('Final presentation diagnostics missing')
        print('Final presentation diagnostics verified')
    else:
        for file in missing:
            file.write_text(changes[file])
        print(f'Applied final presentation diagnostics ({len(missing)} files changed)')


if __name__ == '__main__':
    main(sys.argv[1:])
