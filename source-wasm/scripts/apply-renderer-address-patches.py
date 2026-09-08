#!/usr/bin/env python3
"""Correct active ToGLES vertex addressing in the pinned private source tree."""

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
    raise SystemExit("Usage: apply-renderer-address-patches.py [--check] PRIVATE_SOURCE_ROOT")
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
    changes[file] = replace_once(changes.get(file, file.read_text()), original, replacement, label)


header = "public/togles/linuxwin/glmgr.h"
flush = "togles/linuxwin/glmgr_flush.inl"
device = "togles/linuxwin/dxabstract.cpp"
patch(header, '#include "glbase.h"',
      '#include "glbase.h"\n#include "source_wasm_vertex_address.h"', "address helper include")
patch(header, "FlushDrawStates( uint nStartIndex, uint nEndIndex, uint nBaseVertex )",
      "FlushDrawStates( uint nStartIndex, uint nEndIndex, int nBaseVertex )", "signed base declaration")
patch(flush, "FlushDrawStates( uint nStartIndex, uint nEndIndex, uint nBaseVertex )",
      "FlushDrawStates( uint nStartIndex, uint nEndIndex, int nBaseVertex )", "signed base definition")
patch(header, "\t\t\tuint m_nTotalBufferRevision;",
      "\t\t\tuint m_nTotalBufferRevision;\n\t\t\tint m_nBaseVertex;", "base cache member")
patch(header, "\t\t\tm_CurAttribs.m_nTotalBufferRevision = 0;",
      "\t\t\tm_CurAttribs.m_nTotalBufferRevision = 0;\n\t\t\tm_CurAttribs.m_nBaseVertex = 0;", "base cache initialization")
patch(flush, "\tif ( ( nCurTotalBufferRevision != m_CurAttribs.m_nTotalBufferRevision ) ||",
      "\tif ( ( nCurTotalBufferRevision != m_CurAttribs.m_nTotalBufferRevision ) ||\n"
      "#ifdef __EMSCRIPTEN__\n\t\t( m_CurAttribs.m_nBaseVertex != nBaseVertex ) ||\n#endif", "base cache invalidation")
patch(flush, "\t\tm_CurAttribs.m_nTotalBufferRevision = nCurTotalBufferRevision;",
      "\t\tm_CurAttribs.m_nTotalBufferRevision = nCurTotalBufferRevision;\n"
      "\t\tm_CurAttribs.m_nBaseVertex = nBaseVertex;", "base cache update")
patch(flush,
      "\t\t\tint nBufOffset = pDeclElem->m_gldecl.m_offset + pStream->m_offset;\n"
      "\t\t\tAssert( nBufOffset >= 0 );\n\t\t\tAssert( nBufOffset < (int)pBuf->m_nSize );",
      "#ifdef __EMSCRIPTEN__\n"
      "\t\t\tuint32_t checkedOffset;\n"
      "\t\t\tif ( !SourceWasm_AttributeOffset( pDeclElem->m_gldecl.m_offset, pStream->m_offset,\n"
      "\t\t\t\tnBaseVertex, pStream->m_stride, pBuf->m_nSize, &checkedOffset ) )\n"
      "\t\t\t{\n"
      '\t\t\t\tError( "WebGL vertex address out of range: stream=%u decl=%u offset=%u base=%d stride=%u size=%u\\n",\n'
      "\t\t\t\t\tnStreamIndex, pDeclElem->m_gldecl.m_offset, pStream->m_offset, nBaseVertex, pStream->m_stride, pBuf->m_nSize );\n"
      "\t\t\t\treturn;\n\t\t\t}\n"
      "\t\t\tint64 nBufOffset = checkedOffset;\n"
      "#else\n"
      "\t\t\tint64 nBufOffset = int64(pDeclElem->m_gldecl.m_offset) + pStream->m_offset;\n"
      "\t\t\tAssert( nBufOffset >= 0 && nBufOffset < pBuf->m_nSize );\n"
      "#endif", "active attribute offset")
patch(device,
      "\tthis->FlushVertexBindings( BaseVertexIndex );\n"
      "\tm_ctx->FlushDrawStates( MinVertexIndex, MinVertexIndex + NumVertices - 1, 0 );",
      "\t// WebGL lacks base-vertex draws; the active attribute path applies it once.\n"
      "\tm_ctx->FlushDrawStates( MinVertexIndex, MinVertexIndex + NumVertices - 1, BaseVertexIndex );",
      "wasm indexed draw base handoff")
patch(device,
      "\t\t// latch current offset in this stream.\n"
      "\t\telem->m_gldecl.m_offset = streamOffsets[ elem->m_dxdecl.Stream ];",
      "\t\t// Preserve D3D byte offsets, including normal/tangent aliases.\n"
      "\t\telem->m_gldecl.m_offset = elem->m_dxdecl.Offset;", "declaration offset")
patch(device,
      "\t\t// write the offset and move the cursor\n"
      "\t\telem->m_gldecl.m_offset = streamOffsets[elem->m_dxdecl.Stream];\n"
      "\t\tstreamOffsets[ elem->m_dxdecl.Stream ] += bytes;",
      "\t\t// Aliased or padded elements contribute their furthest byte extent.\n"
      "\t\tconst SourceWasmVertexElementLayout layout = SourceWasm_DescribeElement(\n"
      "\t\t\tstreamOffsets[ elem->m_dxdecl.Stream ], elem->m_dxdecl.Offset, bytes );\n"
      "\t\telem->m_gldecl.m_offset = layout.offset;\n"
      "\t\tstreamOffsets[ elem->m_dxdecl.Stream ] = layout.extent;", "declaration extent")
changes[root / "public/togles/linuxwin/source_wasm_vertex_address.h"] = (
    package / "patches/files/source_wasm_vertex_address.h"
).read_text()

# Validate the complete pin and all anchors before changing private files.
missing = [file for file, text in changes.items() if not file.is_file() or file.read_text() != text]
if check_only:
    if missing:
        raise SystemExit("Renderer address patches are missing or changed; run the full side-module build")
    print(f"Renderer address patches verified at {root}")
else:
    for file in missing:
        file.write_text(changes[file])
    print(f"Applied renderer address patches to {root} ({len(missing)} files changed)")
