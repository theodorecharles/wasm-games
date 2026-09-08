#!/usr/bin/env python3
"""Apply only the authored dynamic-module loader fix to a private reference tree."""

import pathlib
import sys


def replace_once(text, original, replacement, label):
    if replacement in text:
        if text.count(replacement) != 1 or text.count(original) != replacement.count(original):
            raise SystemExit(f"Ambiguous previously patched {label}; refusing to patch")
        return text
    if text.count(original) != 1:
        raise SystemExit(f"Expected one unmodified {label} anchor; refusing to patch")
    return text.replace(original, replacement, 1)


arguments = sys.argv[1:]
check_only = arguments[:1] == ["--check"]
if check_only:
    arguments = arguments[1:]
if len(arguments) != 1:
    raise SystemExit("Usage: apply-side-module-patches.py [--check] PRIVATE_SOURCE_ROOT")

root = pathlib.Path(arguments[0]).resolve()
interface_file = root / "tier1/interface.cpp"
original_text = interface_file.read_text()
text = original_text
text = replace_once(
    text,
    '#include "tier1/strtools.h"',
    '#include "tier1/strtools.h"\n#ifdef __EMSCRIPTEN__\n#include "source_wasm_side_module_name.h"\n#endif',
    "module helper include",
)
text = replace_once(
    text,
    '#define EAT(prefix) if(strncmp(pModuleName, prefix, strlen(prefix)) == 0) pModuleName += strlen(prefix)\n'
    '\tEAT("/"); EAT("bin"); EAT("/"); EAT("lib");\n#undef EAT',
    '\tpModuleName = SourceWasm_ModuleName(pModuleName);',
    "module basename",
)
helper = pathlib.Path(__file__).resolve().parent.parent / "patches/files/source_wasm_side_module_name.h"
helper_text = helper.read_text()
destination = root / "tier1/source_wasm_side_module_name.h"
helper_changed = not destination.is_file() or destination.read_text() != helper_text
if check_only:
    if text != original_text or helper_changed:
        raise SystemExit("Native loader patch is missing or changed; run the full side-module build")
    print(f"Dynamic-module basename patch verified at {root}")
    raise SystemExit(0)
# Validate every context before changing either private source file.
if text != original_text:
    interface_file.write_text(text)
if helper_changed:
    destination.write_text(helper_text)
print(f"Applied dynamic-module basename fix to {root}")
