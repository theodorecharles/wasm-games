import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('transient texture maps preserve pages, rect strides, slices and GL state', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'source-texture-upload-'));
  try {
    const source = join(temporary, 'texture-test.cpp');
    const executable = join(temporary, 'texture-test');
    writeFileSync(source, String.raw`
#include "source_wasm_texture_upload.h"
#include <array>
#include <cassert>
#include <map>
#include <vector>

struct MockGL {
    std::map<unsigned int, int> state;
    MockGL() : state{{0x0CF2, 19}, {0x0CF3, 2}, {0x0CF4, 3}, {0x0CF5, 8}} {}
    void glGetIntegerv(unsigned int key, int *value) { *value = state.at(key); }
    void glPixelStorei(unsigned int key, int value) { state[key] = value; }
    // Consume the same row/skip state as a PBO texSubImage2D upload.
    void Upload(std::vector<unsigned char> &texture, const std::vector<unsigned char> &pbo,
                unsigned int width, unsigned int x, unsigned int y,
                unsigned int rectWidth, unsigned int rectHeight, unsigned int bpp) {
        const unsigned int sourceWidth = state[0x0CF2] ? state[0x0CF2] : rectWidth;
        const unsigned int alignment = state[0x0CF5];
        const unsigned int pitch = ((sourceWidth*bpp + alignment-1)/alignment)*alignment;
        for (unsigned int row=0; row<rectHeight; ++row) {
            // GLES3: 0x0CF3 is SKIP_ROWS, 0x0CF4 is SKIP_PIXELS.
            const unsigned int src = (row+state[0x0CF3])*pitch + state[0x0CF4]*bpp;
            const unsigned int dst = ((y+row)*width+x)*bpp;
            assert(src+rectWidth*bpp <= pbo.size());
            assert(dst+rectWidth*bpp <= texture.size());
            memcpy(texture.data()+dst, pbo.data()+src, rectWidth*bpp);
        }
    }
};

int main() {
    // Eight-pixel RGBA rows make a 2x2 update's row pitch differ from its width.
    const unsigned int width=8, height=4, bpp=4, bytes=width*height*bpp;
    SourceWasmTextureShadow shadow;
    std::vector<unsigned char> stage(bytes, 0xCD), gpu(bytes, 0x37), texture(bytes, 0x37);
    assert(shadow.Restore(stage.data(), bytes, 0, bytes));
    for (auto b: stage) assert(b == 0); // first allocation is deterministic
    stage.assign(bytes, 0x37);
    assert(shadow.Capture(stage.data(), 0, bytes));
    MockGL gl;
    const auto prior = gl.state;

    // Successive malloc maps are poisoned. Only the source shadow preserves
    // pixels not rewritten by a full-page lightmap lock.
    stage.assign(bytes, 0xCD);
    assert(shadow.Restore(stage.data(), bytes, 0, bytes));
    for (unsigned int y=1; y<3; ++y)
        memset(stage.data()+(y*width+3)*bpp, 0xAB, 2*bpp);
    assert(shadow.Capture(stage.data(), 0, bytes));
    gpu = stage; // SDK unmap uploads every byte then frees the stage allocation
    {
        SourceWasmUnpackState<MockGL> unpack(&gl, width, 0, 0);
        gl.Upload(texture, gpu, width, 0, 0, width, height, bpp);
    }
    assert(gl.state == prior);
    for (unsigned int y=0; y<height; ++y)
        for (unsigned int x=0; x<width; ++x)
            assert(texture[(y*width+x)*bpp] == ((y>=1&&y<3&&x>=3&&x<5)?0xAB:0x37));

    // Nonzero-origin subrect pBits points inside the full page; both rows and
    // unrelated previously updated texels survive later full-page locks.
    stage.assign(bytes, 0xEE);
    assert(shadow.Restore(stage.data(), bytes, 0, bytes));
    auto *rect = stage.data()+(2*width+1)*bpp;
    memset(rect, 0x11, 2*bpp);
    memset(rect+width*bpp, 0x22, 2*bpp);
    assert(shadow.Capture(stage.data(), 0, bytes));
    gpu=stage;
    {
        SourceWasmUnpackState<MockGL> unpack(&gl, width, 1, 2);
        assert(gl.state[0x0CF3] == 2 && gl.state[0x0CF4] == 1);
        gl.Upload(texture, gpu, width, 1, 2, 2, 2, bpp);
    }
    assert(gl.state == prior);
    assert(texture[(2*width+1)*bpp] == 0x11);
    assert(texture[(3*width+1)*bpp] == 0x22);
    assert(texture[(1*width+3)*bpp] == 0xAB);
    stage.assign(bytes, 0xCC);
    assert(shadow.Restore(stage.data(), bytes, 0, bytes));
    assert(stage == texture);

    // Complete overwrite (including D3D discard callers) remains exact.
    stage.assign(bytes, 0x55);
    assert(shadow.Capture(stage.data(), 0, bytes));
    stage.assign(bytes, 0xEE);
    assert(shadow.Restore(stage.data(), bytes, 0, bytes));
    for (auto b: stage) assert(b == 0x55);

    // Redefinition cannot retain the previous allocation or stale bytes.
    assert(shadow.Restore(stage.data(), bytes*2, bytes, bytes));
    assert(shadow.Size() == bytes*2);
    for (auto b: stage) assert(b == 0);
    stage.assign(bytes, 0x66);
    assert(shadow.Capture(stage.data(), bytes, bytes));
    assert(shadow.Restore(stage.data(), bytes*2, 0, bytes));
    for (auto b: stage) assert(b == 0); // other mip/slice remains separate
    assert(shadow.Restore(stage.data(), bytes*2, bytes, bytes));
    for (auto b: stage) assert(b == 0x66);
    assert(!shadow.Capture(stage.data(), 0xFFFFFFFFu, 4));
    assert(!shadow.Restore(stage.data(), bytes*2, bytes*2-1, 4));
    assert(!shadow.Restore(nullptr, bytes, 0, bytes));
    shadow.Reset();
    assert(shadow.Size() == 0);
    assert(!shadow.Capture(stage.data(), 0, bytes));

    // RGB rows need alignment 1, with all previous pixel-store state restored.
    gpu.assign(5*3*3, 0x77); texture.assign(gpu.size(), 0);
    {
        SourceWasmUnpackState<MockGL> unpack(&gl, 5, 1, 1);
        gl.Upload(texture, gpu, 5, 1, 1, 3, 2, 3);
    }
    assert(gl.state == prior);
    assert(texture[(2*5+3)*3] == 0x77);
    { SourceWasmUnpackState<MockGL> disabled(&gl, 5, 0, 0, false); assert(gl.state == prior); }
    // Destruct repeatedly under ASan/LSan to catch retained per-texture storage.
    for (int i=0; i<100; ++i) {
        SourceWasmTextureShadow owned;
        assert(owned.Restore(stage.data(), bytes, 0, bytes));
    }
}
`);
    execFileSync(process.env.SOURCE_WASM_HOST_CXX || 'c++', [
      '-std=c++11', '-Wall', '-Wextra', '-Werror', '-fsanitize=address,undefined',
      '-fno-sanitize-recover=undefined', '-I', join(packageRoot, 'patches/files'), source, '-o', executable,
    ]);
    execFileSync(executable, { env: { ...process.env, ASAN_OPTIONS: 'detect_leaks=1' } });
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
