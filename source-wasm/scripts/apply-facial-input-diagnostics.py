#!/usr/bin/env python3
"""Install bounded mouth/audio clocks and sampler-input observations; no behavior changes."""
import json
import pathlib
import subprocess
import sys

PACKAGE = pathlib.Path(__file__).resolve().parent.parent
HELPERS = ['source_wasm_facial_timing.h', 'source_wasm_facial_audio.inl',
           'source_wasm_facial_mouth.inl', 'source_wasm_facial_frame.inl',
           'source_wasm_input_gamma_draw.inl']


def replacements():
    include = '#include "source_wasm_facial_timing.h"\n'
    memory = '#include "tier0/memdbgon.h"'
    return [
        *[(name, memory, include + memory) for name in
          ['engine/audio/snd_dev_sdl.cpp', 'engine/audio/snd_mix.cpp', 'game/client/c_baseflex.cpp']],
        ('engine/audio/snd_dev_sdl.cpp', 'static CAudioDeviceSDLAudio *g_wave = NULL;',
         'static CAudioDeviceSDLAudio *g_wave = NULL;\n#include "source_wasm_facial_audio.inl"'),
        ('engine/audio/snd_dev_sdl.cpp', '\tm_partialWrite %= WAV_BUFFER_SIZE;',
         '\tm_partialWrite %= WAV_BUFFER_SIZE;\n#ifdef __EMSCRIPTEN__\n'
         '\tSourceWasmFacialAudioConsumed(totalWriteable / (DeviceSampleBytes() * DeviceChannels()), GetOutputPosition());\n#endif'),
        ('engine/audio/snd_mix.cpp', '\t\t\t\tvd->SetElapsedTime( elapsed );',
         '\t\t\t\tvd->SetElapsedTime( elapsed );\n#include "source_wasm_facial_mouth.inl"'),
        ('game/client/c_baseflex.cpp', '\t\tfloat\ttimesincestart = vd->GetElapsedTime();',
         '\t\tfloat\ttimesincestart = vd->GetElapsedTime();\n#include "source_wasm_facial_frame.inl"'),
        ('togles/linuxwin/glmgr_flush.inl', '#include "source_wasm_brightness_draw.inl"',
         '#include "source_wasm_input_gamma_draw.inl"\n#include "source_wasm_brightness_draw.inl"'),
    ]


def planned_changes(root):
    changes = {}
    for relative, original, replacement in replacements():
        file = root / relative
        text = changes.get(file, file.read_text())
        if replacement in text:
            if text.count(replacement) != 1 or text.count(original) != replacement.count(original):
                raise ValueError(f'Ambiguous patched facial/input anchor: {relative}')
        elif text.count(original) != 1:
            raise ValueError(f'Expected one facial/input anchor in {relative}; refusing to patch')
        else:
            text = text.replace(original, replacement, 1)
        changes[file] = text
    for name in HELPERS:
        file = root / 'public' / name
        expected = (PACKAGE / 'patches/files' / name).read_text()
        if file.exists() and file.read_text() != expected:
            raise ValueError(f'Existing diagnostic helper differs: {file}')
        changes[file] = expected
    return changes


def main(arguments):
    check_only = arguments[:1] == ['--check']
    if check_only:
        arguments = arguments[1:]
    if len(arguments) != 1:
        raise SystemExit('Usage: apply-facial-input-diagnostics.py [--check] PRIVATE_SOURCE_ROOT')
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
            raise SystemExit('Facial/input diagnostics missing; apply the diagnostic patcher')
        print(f'Facial/input diagnostics verified at {root}')
    else:
        for file in missing:
            file.write_text(changes[file])
        print(f'Applied facial/input diagnostics to {root} ({len(missing)} files changed)')


if __name__ == '__main__':
    main(sys.argv[1:])
