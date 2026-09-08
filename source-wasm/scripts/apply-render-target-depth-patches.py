#!/usr/bin/env python3
"""Use Source's matching-depth path for WebGL render targets."""
import json
import pathlib
import subprocess
import sys

PACKAGE = pathlib.Path(__file__).resolve().parent.parent
ORIGINAL = """bool CHardwareConfig::SupportsGLMixedSizeTargets() const
{
\treturn m_Caps.m_bSupportsGLMixedSizeTargets;
}"""
REPLACEMENT = """bool CHardwareConfig::SupportsGLMixedSizeTargets() const
{
#ifdef __EMSCRIPTEN__
\t// WebGL rejects differently sized color/depth attachments. This enables
\t// the existing render-target allocator's matching separate-depth path.
\treturn false;
#else
\treturn m_Caps.m_bSupportsGLMixedSizeTargets;
#endif
}"""
SEPARATE_GUARD = 'if ( (!gl_canMixTargetSizes && IsPosix()) || IsEmulatingGL() )'
DEPTH_ALLOCATION = """m_pTextureHandles[1] = g_pShaderAPI->CreateDepthTexture(\x20
\t\t\t\tm_ImageFormat,\x20
\t\t\t\tm_dimsAllocated.m_nWidth,\x20
\t\t\t\tm_dimsAllocated.m_nHeight,"""


def planned_changes(root):
    # Refuse a source where the existing fallback or matching actual allocation
    # no longer exists. This patch does not implement a second allocator.
    material = (root / 'materialsystem/cmaterialsystem.cpp').read_text()
    texture = (root / 'materialsystem/ctexture.cpp').read_text()
    if material.count(SEPARATE_GUARD) != 1 or texture.count(DEPTH_ALLOCATION) != 1:
        raise ValueError('Matching separate-depth allocation changed; refusing capability assumption')
    file = root / 'materialsystem/shaderapidx9/hardwareconfig.cpp'
    text = file.read_text()
    if REPLACEMENT in text:
        if text.count(REPLACEMENT) != 1 or ORIGINAL in text:
            raise ValueError('Ambiguous patched mixed-size target capability')
    elif text.count(ORIGINAL) != 1:
        raise ValueError('Unknown mixed-size target capability context')
    else:
        text = text.replace(ORIGINAL, REPLACEMENT, 1)
    return {file: text}


def main(arguments):
    check_only = arguments[:1] == ['--check']
    if check_only:
        arguments = arguments[1:]
    if len(arguments) != 1:
        raise SystemExit('Usage: apply-render-target-depth-patches.py [--check] PRIVATE_SOURCE_ROOT')
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
    missing = [file for file, text in changes.items() if file.read_text() != text]
    if check_only:
        if missing:
            raise SystemExit('WebGL matching-depth capability patch missing')
        print('WebGL matching-depth capability verified')
    else:
        for file in missing:
            file.write_text(changes[file])
        print(f'Applied WebGL matching-depth capability ({len(missing)} files changed)')


if __name__ == '__main__':
    main(sys.argv[1:])
