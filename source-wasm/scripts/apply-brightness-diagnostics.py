#!/usr/bin/env python3
"""Install bounded gamma/HDR observations without altering rendering state."""
import json
import pathlib
import subprocess
import sys

PACKAGE = pathlib.Path(__file__).resolve().parent.parent
HELPERS = ["source_wasm_brightness_diagnostics.h", "source_wasm_brightness_draw.inl",
           "source_wasm_brightness_upload.inl", "source_wasm_brightness_mode.inl"]


def replacements():
    include = '#include "source_wasm_brightness_diagnostics.h"\n'
    draw_anchor = '\treturn;\n\nflush_error_exit:'
    upload_anchor = '\tm_ctx->BindTexToTMU( pPrevTex, 0 );\n}\n\t\n\nvoid CGLMTex::Lock('
    mode_anchor = '\t\tSetPixelShaderConstant( TONE_MAPPING_SCALE_PSH_CONSTANT, m_ToneMappingScale.Base() );'
    # Append the query to preserve COpenGLEntryPoints offsets used by frozen
    # modules (notably liblauncher); never insert into the existing field list.
    query_anchor = 'GL_FUNC_VOID(OpenGL,true,glGetFramebufferAttachmentParameteriv,(GLenum a,GLenum b,GLenum c,GLint *d),(a,b,c,d))'
    fallback_anchor = '\tgGL->glTexImage2D(target, level, intformat, width, height, border, format, type, pixels);'
    fallback = '''#ifdef __EMSCRIPTEN__
    static SourceWasmBrightnessGate diagnosticFallbacks;
    const unsigned signature[] = {unsigned(internalformat), unsigned(intformat), unsigned(format), unsigned(type)};
    if (diagnosticFallbacks.Accept(2, SourceWasmBrightnessHash(signature, sizeof(signature))))
        printf("[source-brightness] decompressed input=0x%x internal=0x%x dataFormat=0x%x dataType=0x%x size=%dx%d\\n",
            signature[0], signature[1], signature[2], signature[3], width, height);
#endif
'''
    return [
        ('public/togles/linuxwin/glmgr.h', '#include "glbase.h"', include + '#include "glbase.h"'),
        ('togles/linuxwin/glmgr.cpp', '#include "glmgr_flush.inl"', include + '#include "glmgr_flush.inl"'),
        ('togles/linuxwin/glmgr_flush.inl', draw_anchor, '#include "source_wasm_brightness_draw.inl"\n' + draw_anchor),
        ('togles/linuxwin/cglmtex.cpp', '#include "tier0/memdbgon.h"', include + '#include "tier0/memdbgon.h"'),
        ('togles/linuxwin/cglmtex.cpp', upload_anchor, '#include "source_wasm_brightness_upload.inl"\n' + upload_anchor),
        ('togles/linuxwin/cglmtex.cpp', fallback_anchor, fallback + fallback_anchor),
        ('materialsystem/shaderapidx9/shaderapidx8.cpp', '#include "tier0/memdbgon.h"', include + '#include "tier0/memdbgon.h"'),
        ('materialsystem/shaderapidx9/shaderapidx8.cpp', mode_anchor, mode_anchor + '\n#include "source_wasm_brightness_mode.inl"'),
        ('public/togles/linuxwin/glfuncs.h', query_anchor, query_anchor + '\nGL_FUNC_VOID(OpenGL,true,glGetUniformfv,(GLuint a,GLint b,GLfloat *c),(a,b,c))'),
    ]


def planned_changes(root):
    changes = {}
    for relative, original, replacement in replacements():
        file = root / relative
        text = changes.get(file, file.read_text())
        if relative == 'public/togles/linuxwin/glfuncs.h' and not text.rstrip().endswith((original, replacement)):
            raise ValueError('Expected final GL entry-point anchor; refusing to change existing field offsets')
        if replacement in text:
            if text.count(replacement) != 1 or text.count(original) != replacement.count(original):
                raise ValueError(f'Ambiguous patched brightness anchor: {relative}')
        elif text.count(original) != 1:
            raise ValueError(f'Expected one brightness anchor in {relative}; refusing to patch')
        else:
            text = text.replace(original, replacement, 1)
        changes[file] = text
    register = root / 'materialsystem/stdshaders/common_hlsl_cpp_consts.h'
    if '#define TONE_MAPPING_SCALE_PSH_CONSTANT 30' not in register.read_text():
        raise ValueError('Unexpected tone-map constant register; refusing diagnostic assumptions')
    for name in HELPERS:
        file = root / 'public' / name
        expected = (PACKAGE / 'patches/files' / name).read_text()
        if file.exists() and file.read_text() != expected:
            raise ValueError(f'Existing brightness helper differs: {file}')
        changes[file] = expected
    return changes


def main(arguments):
    check_only = arguments[:1] == ['--check']
    if check_only:
        arguments = arguments[1:]
    if len(arguments) != 1:
        raise SystemExit('Usage: apply-brightness-diagnostics.py [--check] PRIVATE_SOURCE_ROOT')
    root = pathlib.Path(arguments[0]).resolve()
    if root == PACKAGE.parent or PACKAGE.parent in root.parents:
        raise SystemExit('Native diagnostics must target a private source tree outside this checkout')
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
            raise SystemExit('Brightness diagnostics missing; run the full diagnostic build')
        print(f'Brightness diagnostics verified at {root}')
    else:
        # Resolve every anchor and helper before making the first mutation.
        for file in missing:
            file.write_text(changes[file])
        print(f'Applied brightness diagnostics to {root} ({len(missing)} files changed)')


if __name__ == '__main__':
    main(sys.argv[1:])
