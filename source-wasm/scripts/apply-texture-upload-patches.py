#!/usr/bin/env python3
"""Preserve dynamic texture lock contents and mapped upload row layout."""
import json
import pathlib
import subprocess
import sys

arguments = sys.argv[1:]
check_only = arguments[:1] == ["--check"]
if check_only:
    arguments = arguments[1:]
if len(arguments) != 1:
    raise SystemExit("Usage: apply-texture-upload-patches.py [--check] PRIVATE_SOURCE_ROOT")
root = pathlib.Path(arguments[0]).resolve()
package = pathlib.Path(__file__).resolve().parent.parent
reference = json.loads((package / "side-module-reference.json").read_text())
commit = subprocess.check_output([
    "git", "-c", f"safe.directory={root}", "-C", str(root), "rev-parse", "HEAD"
], text=True).strip()
if commit != reference["sourceCommit"]:
    raise SystemExit(f"Wrong source pin: {commit}")
changes = {}


def patch(relative, original, replacement, label):
    file = root / relative
    text = changes.get(file, file.read_text())
    if replacement in text:
        if text.count(replacement) != 1 or text.count(original) != replacement.count(original):
            raise SystemExit(f"Ambiguous previously patched {label}")
    elif text.count(original) != 1:
        raise SystemExit(f"Expected one unmodified {label} anchor; refusing to patch")
    else:
        text = text.replace(original, replacement, 1)
    changes[file] = text


header = "public/togles/linuxwin/cglmtex.h"
source = "togles/linuxwin/cglmtex.cpp"
patch(header, '#include "tier1/utlmap.h"',
      '#include "tier1/utlmap.h"\n#ifdef __EMSCRIPTEN__\n#include "source_wasm_texture_upload.h"\n#endif',
      "texture shadow include")
patch(header, "\tGLubyte\t\t\t\t\t*m_mapped;",
      "\tGLubyte\t\t\t\t\t*m_mapped;\n#ifdef __EMSCRIPTEN__\n"
      "\tSourceWasmTextureShadow m_wasmTextureShadow;\n#endif", "texture shadow ownership")
mapping = "\t\t\tdata = (GLubyte*)gGL->glMapBufferRange(GL_PIXEL_UNPACK_BUFFER, 0, m_layout->m_slices[ desc->m_sliceIndex ].m_storageSize, GL_MAP_WRITE_BIT | GL_MAP_UNSYNCHRONIZED_BIT);"
patch(source, mapping, mapping + "\n#ifdef __EMSCRIPTEN__\n"
      "\t\t\t// Lightmap locks update only selected parts of an existing page.\n"
      "\t\t\tif ( !(m_layout->m_key.m_texFlags & kGLMTexRenderable) &&\n"
      "\t\t\t\t!m_wasmTextureShadow.Restore( data, m_layout->m_storageTotalSize,\n"
      "\t\t\t\t\tm_layout->m_slices[ desc->m_sliceIndex ].m_storageOffset,\n"
      "\t\t\t\t\tm_layout->m_slices[ desc->m_sliceIndex ].m_storageSize ) )\n"
      '\t\t\t\tError( "WebGL dynamic texture backing allocation or range failed\\n" );\n'
      "#endif", "mapped texture preservation")
patch(source, "\t\tif( params->m_readonly == false )\n\t\t\tm_mapped = (GLubyte*)*addressOut;",
      "\t\tif( params->m_readonly == false )\n\t\t\tm_mapped = (GLubyte*)*addressOut;\n"
      "#ifdef __EMSCRIPTEN__\n"
      "\t\t// Keep m_mapped at the slice base; the caller receives its rectangle.\n"
      "\t\tif ( *addressOut ) *addressOut += offsetInSlice;\n#endif", "mapped lock rectangle")
patch(source, "\t\t\t\t\tgGL->glUnmapBuffer(GL_PIXEL_UNPACK_BUFFER);",
      "#ifdef __EMSCRIPTEN__\n"
      "\t\t\t\t\t// Capture before Emscripten frees the transient mapped allocation.\n"
      "\t\t\t\t\tif ( !(m_layout->m_key.m_texFlags & kGLMTexRenderable) &&\n"
      "\t\t\t\t\t\t!m_wasmTextureShadow.Capture( m_mapped,\n"
      "\t\t\t\t\t\t\tm_layout->m_slices[ desc->m_sliceIndex ].m_storageOffset,\n"
      "\t\t\t\t\t\t\tm_layout->m_slices[ desc->m_sliceIndex ].m_storageSize ) )\n"
      '\t\t\t\t\t\tError( "WebGL dynamic texture backing capture failed\\n" );\n'
      "#endif\n\t\t\t\t\tgGL->glUnmapBuffer(GL_PIXEL_UNPACK_BUFFER);", "mapped texture capture")
mapped_convert = "\t\t\t\t\t\tconvert_texture(intformat, writeBox.xmax - writeBox.xmin, writeBox.ymax - writeBox.ymin, glDataFormat, glDataType, NULL);"
patch(source, mapped_convert,
      "#ifdef __EMSCRIPTEN__\n"
      "\t\t\t\t\t\tSourceWasmUnpackState<COpenGLEntryPoints> unpack( gGL, slice->m_xSize, writeBox.xmin, writeBox.ymin );\n"
      "#endif\n" + mapped_convert, "mapped upload rectangle stride")
full_convert = "\t\t\t\t\tconvert_texture(intformat, m_layout->m_slices[ desc->m_sliceIndex ].m_xSize, m_layout->m_slices[ desc->m_sliceIndex ].m_ySize, glDataFormat, glDataType, noDataWrite ? NULL : sliceAddress);"
patch(source, full_convert,
      "#ifdef __EMSCRIPTEN__\n"
      "\t\t\t\t\tSourceWasmUnpackState<COpenGLEntryPoints> unpack( gGL, slice->m_xSize, 0, 0, m_mapped != NULL );\n"
      "\t\t\t\t\t// With an unpack buffer bound, pixels is a byte offset, never a heap pointer.\n"
      "\t\t\t\t\tif ( m_mapped ) sliceAddress = NULL;\n"
      "#endif\n" + full_convert, "mapped initial upload address")
changes[root / "public/togles/linuxwin/source_wasm_texture_upload.h"] = (
    package / "patches/files/source_wasm_texture_upload.h"
).read_text()
missing = [file for file, text in changes.items() if not file.is_file() or file.read_text() != text]
if check_only:
    if missing:
        raise SystemExit("Texture upload patches missing or changed; run the full side-module build")
    print(f"Texture upload patches verified at {root}")
else:
    for file in missing:
        file.write_text(changes[file])
    print(f"Applied texture upload patches to {root} ({len(missing)} files changed)")
