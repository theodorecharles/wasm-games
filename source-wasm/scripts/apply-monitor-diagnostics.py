#!/usr/bin/env python3
"""Observe native monitor cameras and their bound framebuffer without changing rendering."""
import json
import pathlib
import subprocess
import sys

PACKAGE = pathlib.Path(__file__).resolve().parent.parent
HELPERS = ["source_wasm_monitor_diagnostics.h", "source_wasm_monitor_entry.inl",
           "source_wasm_monitor_cameras.inl", "source_wasm_monitor_target.inl", "source_wasm_monitor_framebuffer.inl"]


def replacements():
    include = '#include "source_wasm_monitor_diagnostics.h"\n'
    entry = '\t#ifdef USE_MONITORS\n\t\tif ( cl_drawmonitors.GetBool() && '
    cameras = '\tC_PointCamera *pCameraEnt = GetPointCameraList();\n\tif ( !pCameraEnt )'
    target = '\tint height = pCameraTarget->GetActualHeight();'
    framebuffer = '\tm_ctx->BindFBOToCtx( m_ctx->m_drawingFBO, GL_FRAMEBUFFER );\n\n\tm_bFBODirty = false;'
    return [
        ('game/client/viewrender.cpp', '#include "c_point_camera.h"', include + '#include "c_point_camera.h"'),
        ('game/client/viewrender.cpp', entry, '\t#ifdef USE_MONITORS\n#include "source_wasm_monitor_entry.inl"\n\t\tif ( cl_drawmonitors.GetBool() && '),
        ('game/client/viewrender.cpp', cameras, '\tC_PointCamera *pCameraEnt = GetPointCameraList();\n#include "source_wasm_monitor_cameras.inl"\n\tif ( !pCameraEnt )'),
        ('game/client/viewrender.cpp', target, target + '\n#include "source_wasm_monitor_target.inl"'),
        ('togles/linuxwin/dxabstract.cpp', '#include "togles/rendermechanism.h"', include + '#include "togles/rendermechanism.h"'),
        ('togles/linuxwin/dxabstract.cpp', framebuffer, '\tm_ctx->BindFBOToCtx( m_ctx->m_drawingFBO, GL_FRAMEBUFFER );\n#include "source_wasm_monitor_framebuffer.inl"\n\n\tm_bFBODirty = false;'),
    ]


def planned_changes(root):
    changes = {}
    for relative, original, replacement in replacements():
        file = root / relative
        text = changes.get(file, file.read_text())
        if replacement in text:
            if text.count(replacement) != 1 or text.count(original) != replacement.count(original):
                raise ValueError(f'Ambiguous patched monitor anchor: {relative}')
        elif text.count(original) != 1:
            raise ValueError(f'Expected one monitor anchor in {relative}; refusing to patch')
        else:
            text = text.replace(original, replacement, 1)
        changes[file] = text
    for name in HELPERS:
        file = root / 'public' / name
        text = (PACKAGE / 'patches/files' / name).read_text()
        if file.exists() and file.read_text() != text:
            raise ValueError(f'Existing monitor helper differs: {file}')
        changes[file] = text
    return changes


def main(arguments):
    check_only = arguments[:1] == ['--check']
    if check_only:
        arguments = arguments[1:]
    if len(arguments) != 1:
        raise SystemExit('Usage: apply-monitor-diagnostics.py [--check] PRIVATE_SOURCE_ROOT')
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
            raise SystemExit('Monitor diagnostics missing; run the diagnostic patcher')
        print(f'Monitor diagnostics verified at {root}')
    else:
        for file in missing:
            file.write_text(changes[file])
        print(f'Applied monitor diagnostics to {root} ({len(missing)} files changed)')


if __name__ == '__main__':
    main(sys.argv[1:])
