#!/usr/bin/env python3
"""Restore sRGB display encoding only at the final WebGL presentation transfer."""
import json
import pathlib
import subprocess
import sys

PACKAGE = pathlib.Path(__file__).resolve().parent.parent
HELPERS = ['source_wasm_present_transfer.h', 'source_wasm_present_transfer.inl']


def replacements():
    include = '#include "appframework/ilaunchermgr.h"'
    plan = '\tbool blitTwoStep = false;\t\t// think positive'
    final = '\t// this is blit #1 or #2 depending on what took place above.\n\tif (yflip)'
    destructor = 'GLMContext::~GLMContext\t()\n{'
    return [
        (include, include + '\n#ifdef __EMSCRIPTEN__\n#include "source_wasm_present_transfer.h"\n#endif'),
        (plan, plan + '''
#ifdef __EMSCRIPTEN__
    // Sampling the final transfer requires the existing resolve-to-texture
    // stage when the presentation surface is multisampled.
    if (blitToBack && blitResolves && formatClass == eColor) blitTwoStep = true;
#endif'''),
        (final, '#include "source_wasm_present_transfer.inl"\n\t// this is blit #1 or #2 depending on what took place above.\n\tif (sourceEncodedPresent)\n\t{\n\t\t// The conditional fullscreen transfer already presented this frame.\n\t}\n\telse if (yflip)'),
        (destructor, destructor + '\n#ifdef __EMSCRIPTEN__\n    SourceWasmPresent::Contexts<COpenGLEntryPoints>().Destroy(gGL, this);\n#endif'),
    ]


def planned_changes(root):
    file = root / 'togles/linuxwin/glmgr.cpp'
    text = file.read_text()
    for original, replacement in replacements():
        if replacement in text:
            if text.count(replacement) != 1 or text.count(original) != replacement.count(original):
                raise ValueError('Ambiguous final-transfer anchor')
        elif text.count(original) != 1:
            raise ValueError('Unknown final-transfer source context')
        else:
            text = text.replace(original, replacement, 1)
    changes = {file: text}
    for name in HELPERS:
        helper = root / 'public' / name
        expected = (PACKAGE / 'patches/files' / name).read_text()
        if helper.exists() and helper.read_text() != expected:
            raise ValueError(f'Existing final-transfer helper differs: {helper}')
        changes[helper] = expected
    return changes


def main(arguments):
    check_only = arguments[:1] == ['--check']
    if check_only:
        arguments = arguments[1:]
    if len(arguments) != 1:
        raise SystemExit('Usage: apply-present-transfer-patches.py [--check] PRIVATE_SOURCE_ROOT')
    root = pathlib.Path(arguments[0]).resolve()
    if root == PACKAGE.parent or PACKAGE.parent in root.parents:
        raise SystemExit('Native patches require a private source tree outside this checkout')
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
            raise SystemExit('Conditional final presentation patch missing')
        print('Conditional final presentation verified')
    else:
        for file in missing:
            file.write_text(changes[file])
        print(f'Applied conditional final presentation ({len(missing)} files changed)')


if __name__ == '__main__':
    main(sys.argv[1:])
