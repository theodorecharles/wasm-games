#!/usr/bin/env python3
"""Apply the authored worker bridge to the pinned private Source baseline."""
import json
import pathlib
import subprocess
import sys


def replace_once(text, original, replacement, label):
    if replacement in text:
        if text.count(replacement) != 1 or text.count(original) != replacement.count(original):
            raise SystemExit(f"Ambiguous previously patched {label}")
        return text
    if text.count(original) != 1:
        raise SystemExit(f"Expected one unmodified {label} anchor; refusing to patch")
    return text.replace(original, replacement, 1)


arguments = sys.argv[1:]
check_only = arguments[:1] == ["--check"]
if check_only:
    arguments = arguments[1:]
if len(arguments) != 1:
    raise SystemExit("Usage: apply-thread-bridge.py [--check] PRIVATE_SOURCE_ROOT")
root = pathlib.Path(arguments[0]).resolve()
package = pathlib.Path(__file__).resolve().parent.parent
reference = json.loads((package / "side-module-reference.json").read_text())
commit = subprocess.check_output(["git", "-c", f"safe.directory={root}", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
if commit != reference["sourceCommit"]:
    raise SystemExit(f"Wrong source pin: {commit}")
changes = {}


def patch(relative, original, replacement, label):
    file = root / relative
    changes[file] = replace_once(changes.get(file, file.read_text()), original, replacement, label)


patch("engine/sys_dll2.cpp", "#include <emscripten.h>",
      '#include <emscripten.h>\n#include "source_wasm_thread_bridge.h"', "engine bridge include")
patch("engine/sys_dll2.cpp", "bool CEngineAPI::MainLoop()\n{\n\temscripten_set_main_loop",
      "bool CEngineAPI::MainLoop()\n{\n\tSourceWasmBridge_Init();\n\temscripten_set_main_loop", "bridge initialization")
patch("engine/sys_dll2.cpp", "\tActivateEditModeShaders( false );\n\n\teng->Frame();",
      "\tActivateEditModeShaders( false );\n\n#ifdef __EMSCRIPTEN__\n\tSourceWasmBridge_BeforeFrame();\n#endif\n\teng->Frame();\n#ifdef __EMSCRIPTEN__\n\tSourceWasmBridge_AfterFrame();\n#endif", "engine frame hooks")
patch("engine/gl_screen.cpp", '#include "sys_dll.h"',
      '#include "sys_dll.h"\n#ifdef __EMSCRIPTEN__\n#include "source_wasm_thread_bridge.h"\n#endif', "loading bridge include")
patch("engine/gl_screen.cpp", "\t\tscr_drawloading = true;",
      "\t\tscr_drawloading = true;\n#ifdef __EMSCRIPTEN__\n\t\tSourceWasmBridge_PublishState();\n#endif", "loading state before blocking work")
patch("engine/wscript", "\tsource = [", "\tsource = [\n\t\t'source_wasm_thread_bridge.cpp',", "engine bridge source list")
patch("engine/host_saverestore.cpp", '#include "host.h"',
      '#include "host.h"\n#ifdef __EMSCRIPTEN__\n#include "source_wasm_thread_bridge.h"\n#endif', "save bridge include")
patch("engine/host_saverestore.cpp", '\tg_bSaveInProgress = false;\n}',
      '#ifdef __EMSCRIPTEN__\n\tif (g_bSaveInProgress)\n\t{\n\t\t// Includes save_async=0, where CallQueued may already be empty.\n\t\tg_pFileSystem->AsyncFinishAllWrites();\n\t\tSourceWasmBridge_SaveCoreComplete();\n\t}\n#endif\n\tg_bSaveInProgress = false;\n}', "finished native save writes")
patch("engine/host_saverestore.cpp", 'void DispatchAsyncSave()\n{',
      '#ifdef __EMSCRIPTEN__\nstatic void FinishSourceWasmSaveScreenshot(uint32_t sequence)\n{\n\tg_pFileSystem->AsyncFinishAllWrites();\n\tSourceWasmBridge_SaveScreenshotComplete(sequence);\n}\n#endif\n\nvoid DispatchAsyncSave()\n{', "finished screenshot write helper")
patch("engine/host_saverestore.cpp", '\t// queue up to save a matching screenshot',
      '#ifdef __EMSCRIPTEN__\n\tbool sourceWasmWantsScreenshot = false;\n#endif\n\t// queue up to save a matching screenshot', "optional save thumbnail")
patch("engine/host_saverestore.cpp",
      '\t\t\tQ_snprintf( m_szSaveGameScreenshotFile, sizeof( m_szSaveGameScreenshotFile ), "%s%s%s.tga", GetSaveDir(), pSaveName, GetPlatformExt() );',
      '\t\t\tQ_snprintf( m_szSaveGameScreenshotFile, sizeof( m_szSaveGameScreenshotFile ), "%s%s%s.tga", GetSaveDir(), pSaveName, GetPlatformExt() );\n#ifdef __EMSCRIPTEN__\n\t\t\tsourceWasmWantsScreenshot = true;\n#endif', "native thumbnail generation")
patch("engine/host_saverestore.cpp", '\tDispatchAsyncSave();',
      '#ifdef __EMSCRIPTEN__\n\t// All validation/cancellation returns precede this accepted save.\n\tSourceWasmBridge_SaveBegin(name, sourceWasmWantsScreenshot);\n#endif\n\tDispatchAsyncSave();', "accepted native save generation")
patch("engine/host_saverestore.cpp", '\t\tg_ClientDLL->WriteSaveGameScreenshot( m_szSaveGameScreenshotFile );',
      '\t\tg_ClientDLL->WriteSaveGameScreenshot( m_szSaveGameScreenshotFile );\n#ifdef __EMSCRIPTEN__\n\t\tconst uint32_t sourceWasmScreenshot = SourceWasmBridge_TakeScreenshotSequence();\n\t\tif (g_pSaveThread)\n\t\t\tg_pSaveThread->QueueCall(&FinishSourceWasmSaveScreenshot, sourceWasmScreenshot);\n\t\telse\n\t\t\tFinishSourceWasmSaveScreenshot(sourceWasmScreenshot);\n#endif', "queued screenshot completion")
patch("appframework/sdlmgr.cpp",
      '\t\tSDL_SetWindowGrab( m_Window, bWindowGrab );\n\t\tSDL_SetRelativeMouseMode( bRelativeMouseMode );\n#ifdef __EMSCRIPTEN__\n\t\tif (bWindowGrab)\n\t\t\temscripten_request_pointerlock("canvas", true);\n\t\telse\n\t\t\temscripten_exit_pointerlock();\n#endif',
      '\t\t// Browser capture is owned by the framework. SDL still observes\n\t\t// pointerlockchange and delivers actual relative/absolute mouse events.\n#ifndef __EMSCRIPTEN__\n\t\tSDL_SetWindowGrab( m_Window, bWindowGrab );\n\t\tSDL_SetRelativeMouseMode( bRelativeMouseMode );\n#endif', "framework pointer capture ownership")
for name in ("source_wasm_thread_bridge.h", "source_wasm_thread_bridge.cpp"):
    changes[root / "engine" / name] = (package / "patches/files" / name).read_text()

# All anchors and the pin are checked before any private file is changed.
missing = [file for file, text in changes.items() if not file.is_file() or file.read_text() != text]
if check_only:
    if missing:
        raise SystemExit("Worker bridge is missing or changed; run the full side-module build")
    print(f"Worker bridge verified at {root}")
else:
    for file in missing:
        file.write_text(changes[file])
    print(f"Applied worker bridge to {root} ({len(missing)} files changed)")
