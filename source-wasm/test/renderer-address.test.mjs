import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('indexed geometry and flex streams preserve signed bases, aliases and gaps', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'source-renderer-address-'));
  try {
    const source = join(temporary, 'address-test.cpp');
    const executable = join(temporary, 'address-test');
    writeFileSync(source, String.raw`
#include "source_wasm_vertex_address.h"
#include <cassert>
#include <cstring>
#include <limits>
#include <vector>

static void writeFloat(std::vector<unsigned char> &bytes, uint32_t offset, float value) {
    std::memcpy(bytes.data() + offset, &value, sizeof(value));
}
static float readFloat(const std::vector<unsigned char> &bytes, uint32_t offset) {
    assert(offset + sizeof(float) <= bytes.size());
    float result;
    std::memcpy(&result, bytes.data() + offset, sizeof(result));
    return result;
}

int main() {
    // One indexed triangle uses geometry and facial-delta streams with
    // different strides and independent dynamic-buffer starting offsets.
    const uint16_t indices[] = {0, 2, 1};
    std::vector<unsigned char> geometry(12 * 24), flex(12 * 28);
    for (uint32_t vertex = 0; vertex < 12; ++vertex) {
        writeFloat(geometry, vertex * 24, float(vertex * 10));
        writeFloat(flex, vertex * 28, float(vertex) / 4);
        geometry[vertex * 24 + 12] = static_cast<unsigned char>(vertex + 100);
    }
    uint32_t positionOffset, flexOffset;
    assert(SourceWasm_AttributeOffset(0, 3 * 24, -2, 24, geometry.size(), &positionOffset));
    assert(SourceWasm_AttributeOffset(0, 3 * 28, -2, 28, flex.size(), &flexOffset));
    const float expected[] = {10.25f, 30.75f, 20.5f};
    for (uint32_t i = 0; i < 3; ++i) {
        const float deformed = readFloat(geometry, positionOffset + indices[i] * 24)
            + readFloat(flex, flexOffset + indices[i] * 28);
        assert(deformed == expected[i]);
    }

    // Same buffers and declaration, consecutive draws change only base vertex.
    // Each draw must select its own triangle, including a return to base zero.
    const int32_t bases[] = {0, 3, 5, 0};
    const float firstPositions[] = {0, 30, 50, 0};
    for (uint32_t i = 0; i < 4; ++i) {
        assert(SourceWasm_AttributeOffset(0, 0, bases[i], 24, geometry.size(), &positionOffset));
        assert(readFloat(geometry, positionOffset) == firstPositions[i]);
    }

    // Normal and tangent are the same packed UBYTE4. A later attribute can
    // contain a gap, and an out-of-order alias cannot increase stream extent.
    const uint16_t offsets[] = {0, 12, 16, 12, 32};
    const uint32_t widths[] = {12, 4, 8, 4, 8};
    uint32_t extent = 0;
    SourceWasmVertexElementLayout layouts[5];
    for (uint32_t i = 0; i < 5; ++i) {
        layouts[i] = SourceWasm_DescribeElement(extent, offsets[i], widths[i]);
        extent = layouts[i].extent;
        assert(layouts[i].offset == offsets[i]);
    }
    assert(layouts[1].offset == layouts[3].offset);
    assert(layouts[3].extent == 24);
    assert(extent == 40);
    uint32_t normalOffset, tangentOffset;
    assert(SourceWasm_AttributeOffset(layouts[1].offset, 0, 4, 24, geometry.size(), &normalOffset));
    assert(SourceWasm_AttributeOffset(layouts[3].offset, 0, 4, 24, geometry.size(), &tangentOffset));
    assert(geometry[normalOffset] == 104 && normalOffset == tangentOffset);

    // Check before narrowing or overflowing, while allowing compensated bases.
    uint32_t address = 1234;
    assert(SourceWasm_AttributeOffset(12, 128, -4, 32, 1024, &address) && address == 12);
    assert(SourceWasm_AttributeOffset(0, 0, 0, 24, 1, &address) && address == 0);
    assert(!SourceWasm_AttributeOffset(0, 0, -1, 24, 1024, &address));
    assert(!SourceWasm_AttributeOffset(0, 0, 4, 32, 128, &address));
    assert(!SourceWasm_AttributeOffset(0, 0, 0, 24, 0, &address));
    const uint32_t maxU = std::numeric_limits<uint32_t>::max();
    const int32_t maxI = std::numeric_limits<int32_t>::max();
    const int32_t minI = std::numeric_limits<int32_t>::min();
    assert(!SourceWasm_AttributeOffset(maxU, maxU, maxI, maxU, maxU, &address));
    assert(!SourceWasm_AttributeOffset(maxU, maxU, minI, maxU, maxU, &address));
    assert(SourceWasm_AttributeOffset(0, 0x80000000u, -1, 1, maxU, &address));
    assert(address == 0x7fffffffu);
    return 0;
}
`);
    execFileSync(process.env.SOURCE_WASM_HOST_CXX || 'c++', [
      '-std=c++11', '-Wall', '-Wextra', '-Werror', '-fsanitize=undefined', '-fno-sanitize-recover=undefined',
      '-I', join(packageRoot, 'patches/files'), source, '-o', executable,
    ]);
    execFileSync(executable);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
