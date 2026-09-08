#!/usr/bin/env python3
"""Restore the normal server ConVar registration before skill.cfg executes."""
import json
import pathlib
import subprocess
import sys

arguments = sys.argv[1:]
check_only = arguments[:1] == ["--check"]
if check_only:
    arguments = arguments[1:]
if len(arguments) != 1:
    raise SystemExit("Usage: apply-server-cvar-patches.py [--check] PRIVATE_SOURCE_ROOT")
root = pathlib.Path(arguments[0]).resolve()
package = pathlib.Path(__file__).resolve().parent.parent
reference = json.loads((package / "side-module-reference.json").read_text())
commit = subprocess.check_output([
    "git", "-c", f"safe.directory={root}", "-C", str(root), "rev-parse", "HEAD"
], text=True).strip()
if commit != reference["sourceCommit"]:
    raise SystemExit(f"Wrong source pin: {commit}")
file = root / "game/server/game.cpp"
original = (
    "void InitializeCvars( void )\n{\n#ifndef __EMSCRIPTEN__ // FIXME\n"
    "\t// Register cvars here:\n\tConVar_Register( FCVAR_GAMEDLL, &g_ConVarAccessor ); \n\n"
    '\tg_pDeveloper\t= cvar->FindVar( "developer" );\n#endif\n}'
)
replacement = original.replace("#ifndef __EMSCRIPTEN__ // FIXME\n", "").replace("\n#endif\n}", "\n}")
text = file.read_text()
if text.count(replacement) == 1 and original not in text:
    print(f"Server ConVar registration verified at {root}")
elif text.count(original) != 1 or replacement in text:
    raise SystemExit("Unknown server InitializeCvars context; refusing to patch")
elif check_only:
    raise SystemExit("Server ConVar registration patch missing; run the full side-module build")
else:
    file.write_text(text.replace(original, replacement, 1))
    print(f"Restored server ConVar registration at {root}")
