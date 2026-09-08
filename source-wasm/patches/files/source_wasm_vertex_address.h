#ifndef SOURCE_WASM_VERTEX_ADDRESS_H
#define SOURCE_WASM_VERTEX_ADDRESS_H

#include <stdint.h>

// D3D applies the signed base to each stream's own stride. Check the final
// buffer address before narrowing; a negative base can be offset by the stream.
inline bool SourceWasm_AttributeOffset(uint32_t declarationOffset,
    uint32_t streamOffset, int32_t baseVertex, uint32_t stride,
    uint32_t bufferBytes, uint32_t *result)
{
    const int64_t fixed = int64_t(declarationOffset) + int64_t(streamOffset);
    const int64_t displacement = int64_t(baseVertex) * int64_t(stride);
    // Check before adding, including products near the limits of int64_t.
    if (displacement < -fixed || displacement >= int64_t(bufferBytes) - fixed)
        return false;
    *result = uint32_t(fixed + displacement);
    return true;
}

// Declaration elements may alias or contain gaps; their extent is not the sum
// of their sizes. D3D's declaration offset is a 16-bit byte offset.
struct SourceWasmVertexElementLayout
{
    uint32_t offset;
    uint32_t extent;
};

inline SourceWasmVertexElementLayout SourceWasm_DescribeElement(uint32_t previous,
    uint16_t declarationOffset, uint32_t elementBytes)
{
    const uint32_t end = uint32_t(declarationOffset) + elementBytes;
    const SourceWasmVertexElementLayout layout = {
        declarationOffset, previous > end ? previous : end
    };
    return layout;
}

#endif
