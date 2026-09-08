#!/usr/bin/env python3
"""Remove duplicate software sRGB encoding while preserving attachment formats."""
import json
import pathlib
import subprocess
import sys

PACKAGE = pathlib.Path(__file__).resolve().parent.parent
HELPERS = ['source_wasm_srgb_write.h', 'source_wasm_srgb_write_draw.inl']


def replacements():
    fbo_end = '\tGLMFBOTexAttachParams\tm_attach[ kAttCount ];\t// indexed by EGLMFBOAttachment\n};'
    context_end = '\tCTSQueue<CGLMTex*> m_DeleteTextureQueue;\n};'
    detach = 'void\tCGLMFBO::TexDetach( EGLMFBOAttachment attachIndex, GLenum fboBindPoint )\n{'
    initial = ('\t\t\t#ifdef __EMSCRIPTEN__\n'
               '\t\t\t\tm_fakeSRGBEnableValue = 1.0f;\n'
               '\t\t\t\tgGL->glUniform1f(m_locFragmentFakeSRGBEnable, m_fakeSRGBEnableValue);\n'
               '\t\t\t#endif')
    reset = 'void GLMContext::Reset()\n{\n}'
    return [
        ('public/togles/linuxwin/cglmfbo.h', 'class CGLMFBO\n{',
         '#include "source_wasm_srgb_write.h"\n\nclass CGLMFBO\n{'),
        ('public/togles/linuxwin/cglmfbo.h', fbo_end,
         fbo_end[:-2] + '#ifdef __EMSCRIPTEN__\n\tSourceWasmSrgbTargetCache m_sourceSrgbTarget;\n#endif\n};'),
        ('public/togles/linuxwin/glmgr.h', context_end,
         context_end[:-2] + '#ifdef __EMSCRIPTEN__\n\tSourceWasmSrgbTargetCache m_sourceDefaultSrgbTarget;\n#endif\n};'),
        ('togles/linuxwin/cglmfbo.cpp', detach,
         detach + '\n#ifdef __EMSCRIPTEN__\n\tif (attachIndex == kAttColor0) m_sourceSrgbTarget.Invalidate();\n#endif'),
        ('togles/linuxwin/glmgr.cpp', reset,
         'void GLMContext::Reset()\n{\n#ifdef __EMSCRIPTEN__\n'
         '\tm_sourceDefaultSrgbTarget.Invalidate();\n'
         '\tfor (int i = 0; i < m_fboTable.Count(); ++i) m_fboTable[i]->m_sourceSrgbTarget.Invalidate();\n'
         '#endif\n}'),
        ('togles/linuxwin/cglmprogram.cpp', initial,
         '\t\t\t// The first draw resolves software sRGB against the actual target encoding.'),
        ('togles/linuxwin/glmgr_flush.inl', '\t// fragment stage --------------------------------------------------------------------',
         '#include "source_wasm_srgb_write_draw.inl"\n\t// fragment stage --------------------------------------------------------------------'),
    ]


def planned_changes(root):
    changes = {}
    for relative, original, replacement in replacements():
        file = root / relative
        text = changes.get(file, file.read_text())
        if replacement in text:
            if text.count(replacement) != 1 or text.count(original) != replacement.count(original):
                raise ValueError(f'Ambiguous patched sRGB anchor: {relative}')
        elif text.count(original) != 1:
            raise ValueError(f'Expected one sRGB anchor in {relative}; refusing to patch')
        else:
            text = text.replace(original, replacement, 1)
        changes[file] = text
    for name in HELPERS:
        file = root / 'public' / name
        expected = (PACKAGE / 'patches/files' / name).read_text()
        if file.exists() and file.read_text() != expected:
            raise ValueError(f'Existing sRGB helper differs: {file}')
        changes[file] = expected
    return changes


def main(arguments):
    check_only = arguments[:1] == ['--check']
    if check_only:
        arguments = arguments[1:]
    if len(arguments) != 1:
        raise SystemExit('Usage: apply-srgb-write-patches.py [--check] PRIVATE_SOURCE_ROOT')
    root = pathlib.Path(arguments[0]).resolve()
    if root == PACKAGE.parent or PACKAGE.parent in root.parents:
        raise SystemExit('Native patches must target a private source tree outside this checkout')
    reference = json.loads((PACKAGE / 'side-module-reference.json').read_text())
    commit = subprocess.check_output(['git', '-c', f'safe.directory={root}', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
    if commit != reference['sourceCommit']:
        raise SystemExit(f'Wrong source pin: {commit}')
    try:
        changes = planned_changes(root)
    except ValueError as error:
        raise SystemExit(str(error)) from error
    missing = [file for file, text in changes.items() if not file.is_file() or file.read_text() != text]
    if check_only:
        if missing:
            raise SystemExit('sRGB write patches missing; run the sRGB patcher')
        print(f'sRGB write patches verified at {root}')
    else:
        for file in missing:
            file.write_text(changes[file])
        print(f'Applied sRGB write patches to {root} ({len(missing)} files changed)')


if __name__ == '__main__':
    main(sys.argv[1:])
