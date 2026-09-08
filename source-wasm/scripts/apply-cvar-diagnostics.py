#!/usr/bin/env python3
"""Temporarily trace server registration entries without bypassing failures."""
import json
import pathlib
import subprocess
import sys

args = sys.argv[1:]
check = args[:1] == ["--check"]
if check:
    args = args[1:]
if len(args) != 1:
    raise SystemExit("Usage: apply-cvar-diagnostics.py [--check] PRIVATE_SOURCE_ROOT")
root = pathlib.Path(args[0]).resolve()
package = pathlib.Path(__file__).resolve().parent.parent
expected = json.loads((package / "side-module-reference.json").read_text())["sourceCommit"]
actual = subprocess.check_output(["git", "-c", f"safe.directory={root}", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
if actual != expected:
    raise SystemExit("Wrong private source pin")
file = root / "tier1/convar.cpp"
anchor = "\tpCur = ConCommandBase::s_pConCommandBases;\n\twhile ( pCur )\n\t{\n\t\tpNext = pCur->m_pNext;"
replacement = """\tpCur = ConCommandBase::s_pConCommandBases;
#ifdef __EMSCRIPTEN__
\tunsigned int sourceWasmCvarIndex = 0;
#endif
\twhile ( pCur )
\t{
#ifdef __EMSCRIPTEN__
\t\tif ( nCVarFlag & FCVAR_GAMEDLL )
\t\t{
\t\t\tconst unsigned int *vtable = *reinterpret_cast<const unsigned int *const *>(pCur);
\t\t\tconst unsigned int addFlags = vtable ? vtable[4] : 0;
\t\t\tif ( sourceWasmCvarIndex < 32 || !addFlags || (pCur->m_pNext && !pCur->m_pNext->m_pszName) )
\t\t\t\tprintf( "[source-cvar] entry=%u object=%p next=%p name=%.96s vtable=%p addFlags=%u init=%u\\n",
\t\t\t\t\tsourceWasmCvarIndex, (void *)pCur, (void *)pCur->m_pNext,
\t\t\t\t\tpCur->m_pszName ? pCur->m_pszName : "(null)", (const void *)vtable,
\t\t\t\t\taddFlags, vtable ? vtable[10] : 0 );
\t\t\t++sourceWasmCvarIndex;
\t\t}
#endif
\t\tpNext = pCur->m_pNext;"""
changes = {}


def patch(file, original, replacement):
    text = changes.get(file, file.read_text())
    if replacement not in text:
        if text.count(original) != 1:
            raise SystemExit(f"Unknown diagnostic context: {file}")
        text = text.replace(original, replacement, 1)
    elif text.count(replacement) != 1:
        raise SystemExit(f"Ambiguous diagnostic context: {file}")
    changes[file] = text


old_trace = replacement.replace(" || (pCur->m_pNext && !pCur->m_pNext->m_pszName)", "")
if old_trace in file.read_text():
    patch(file, old_trace, replacement)
else:
    patch(file, anchor, replacement)
helper_anchor = '#include "icvar.h"'
patch(file, helper_anchor, helper_anchor + """
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
static const unsigned int *sourceWasmCvarWatchObject = NULL;
static bool sourceWasmCvarWatchReported = false;
extern "C" EMSCRIPTEN_KEEPALIVE void SourceWasmTraceCtorBoundary(unsigned int functionIndex)
{
\tif (sourceWasmCvarWatchObject && !sourceWasmCvarWatchReported && !sourceWasmCvarWatchObject[0])
\t{
\t\tsourceWasmCvarWatchReported = true;
\t\tprintf("[source-cvar] first-invalid-after-ctor=%u object=%p raw=%x,%x,%x,%x,%x,%x\\n",
\t\t\tfunctionIndex, (const void *)sourceWasmCvarWatchObject,
\t\t\tsourceWasmCvarWatchObject[0], sourceWasmCvarWatchObject[1], sourceWasmCvarWatchObject[2],
\t\t\tsourceWasmCvarWatchObject[3], sourceWasmCvarWatchObject[4], sourceWasmCvarWatchObject[5]);
\t}
}
#endif""")
create_anchor = "\tAssert( !m_bHasMax || m_fValue <= m_fMaxVal );\n\n\tBaseClass::CreateBase( pName, pHelpString, flags );"
create_trace = create_anchor + """
#ifdef __EMSCRIPTEN__
\tif ( !strcmp(pName, "ai_task_pre_script") )
\t{
\t\tconst unsigned int *raw = reinterpret_cast<const unsigned int *>(this);
\t\tsourceWasmCvarWatchObject = raw;
\t\tprintf("[source-cvar] ai_task constructed object=%p raw=%x,%x,%x,%x,%x,%x parent=%p\\n",
\t\t\t(void *)this, raw[0], raw[1], raw[2], raw[3], raw[4], raw[5], (void *)m_pParent);
\t}
#endif"""
old_create_trace = create_trace.replace('\n\t\tsourceWasmCvarWatchObject = raw;', '')
patch(file, old_create_trace if old_create_trace in file.read_text() else create_anchor, create_trace)
dll = root / "game/server/gameinterface.cpp"
dll_anchor = "\tConnectTier1Libraries( &appSystemFactory, 1 );"
patch(dll, dll_anchor, """#ifdef __EMSCRIPTEN__
\textern ConVar ai_task_pre_script;
\tconst unsigned int *sourceWasmCvarRaw = reinterpret_cast<const unsigned int *>(&ai_task_pre_script);
\tprintf("[source-cvar] DLLInit ai_task object=%p raw=%x,%x,%x,%x,%x,%x\\n",
\t\t(void *)&ai_task_pre_script, sourceWasmCvarRaw[0], sourceWasmCvarRaw[1], sourceWasmCvarRaw[2],
\t\tsourceWasmCvarRaw[3], sourceWasmCvarRaw[4], sourceWasmCvarRaw[5]);
#endif
""" + dll_anchor)
missing = [f for f, text in changes.items() if f.read_text() != text]
if check:
    if missing:
        raise SystemExit("Server ConVar diagnostic not applied")
    print("Server ConVar diagnostic verified")
else:
    for f in missing:
        f.write_text(changes[f])
    print(f"Applied bounded server ConVar diagnostic ({len(missing)} files changed)")
