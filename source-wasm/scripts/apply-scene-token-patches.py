#!/usr/bin/env python3
"""Keep tier3's larger scene parser private to its translation unit."""
import json
import pathlib
import subprocess
import sys


def patch_text(text):
    changes = [
        (
            "class CSceneTokenProcessor : public ISceneTokenProcessor",
            "namespace { // source-wasm: tier3 parser has a distinct private layout\n"
            "class CSceneTokenProcessor : public ISceneTokenProcessor",
        ),
        (
            "CSceneTokenProcessor g_TokenProcessor;\n\nISceneTokenProcessor *GetTokenProcessor()",
            "CSceneTokenProcessor g_TokenProcessor;\n"
            "} // namespace: keep both scene parser implementations independent\n\n"
            "ISceneTokenProcessor *GetTokenProcessor()",
        ),
    ]
    for original, replacement in changes:
        if replacement in text:
            if text.count(replacement) != 1:
                raise ValueError("Ambiguous scene parser patch")
        elif text.count(original) == 1:
            text = text.replace(original, replacement, 1)
        else:
            raise ValueError("Unknown scene parser context")
    return text


def main():
    args = sys.argv[1:]
    check = args[:1] == ["--check"]
    if check:
        args = args[1:]
    if len(args) != 1:
        raise SystemExit("Usage: apply-scene-token-patches.py [--check] PRIVATE_SOURCE_ROOT")
    root = pathlib.Path(args[0]).resolve()
    package = pathlib.Path(__file__).resolve().parent.parent
    expected = json.loads((package / "side-module-reference.json").read_text())["sourceCommit"]
    actual = subprocess.check_output([
        "git", "-c", f"safe.directory={root}", "-C", str(root), "rev-parse", "HEAD"
    ], text=True).strip()
    if actual != expected:
        raise SystemExit("Wrong private source pin")
    file = root / "tier3/scenetokenprocessor.cpp"
    original = file.read_text()
    replacement = patch_text(original)
    if check and original != replacement:
        raise SystemExit("Scene parser isolation patch is missing")
    if not check and original != replacement:
        file.write_text(replacement)
    print("Scene parser isolation verified" if check else "Scene parser isolation applied")


if __name__ == "__main__":
    main()
