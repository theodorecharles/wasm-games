#ifndef SOURCE_WASM_TEXTURE_UPLOAD_H
#define SOURCE_WASM_TEXTURE_UPLOAD_H

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

// Emscripten write mappings are transient malloc allocations, not persistent
// GPU memory. Keep the last uploaded bytes for non-discard texture locks.
class SourceWasmTextureShadow
{
    uint8_t *m_bytes;
    uint32_t m_size;
    SourceWasmTextureShadow(const SourceWasmTextureShadow &);
    SourceWasmTextureShadow &operator=(const SourceWasmTextureShadow &);
public:
    SourceWasmTextureShadow() : m_bytes(NULL), m_size(0) {}
    ~SourceWasmTextureShadow() { Reset(); }
    void Reset() { free(m_bytes); m_bytes = NULL; m_size = 0; }
    uint32_t Size() const { return m_size; }

    bool Restore(void *mapping, uint32_t total, uint32_t offset, uint32_t length)
    {
        if (!mapping || !total || offset > total || length > total - offset)
            return false;
        if (total != m_size)
        {
            uint8_t *replacement = static_cast<uint8_t *>(calloc(total, 1));
            if (!replacement) return false;
            free(m_bytes);
            m_bytes = replacement;
            m_size = total;
        }
        memcpy(mapping, m_bytes + offset, length);
        return true;
    }

    bool Capture(const void *mapping, uint32_t offset, uint32_t length)
    {
        if (!mapping || !m_bytes || offset > m_size || length > m_size - offset)
            return false;
        memcpy(m_bytes + offset, mapping, length);
        return true;
    }
};

// Pixel-store values are global context state. Restore them even if an upload
// exits early. Constants are GLES values, allowing the same helper to be tested
// with a small GL mock without linking the engine or distributing its source.
template <class GLApi> class SourceWasmUnpackState
{
    GLApi *m_gl;
    int m_previous[4];
    static unsigned int Parameter(unsigned int index)
    {
        const unsigned int parameters[] = {0x0CF2, 0x0CF4, 0x0CF3, 0x0CF5};
        return parameters[index]; // row length, skip pixels, skip rows, alignment
    }
    SourceWasmUnpackState(const SourceWasmUnpackState &);
    SourceWasmUnpackState &operator=(const SourceWasmUnpackState &);
public:
    SourceWasmUnpackState(GLApi *gl, int rowLength, int x, int y, bool enabled = true)
        : m_gl(enabled ? gl : NULL)
    {
        if (!m_gl) return;
        const int desired[] = {rowLength, x, y, 1};
        for (unsigned int i = 0; i < 4; ++i)
        {
            m_gl->glGetIntegerv(Parameter(i), &m_previous[i]);
            m_gl->glPixelStorei(Parameter(i), desired[i]);
        }
    }
    ~SourceWasmUnpackState()
    {
        if (m_gl)
            for (unsigned int i = 0; i < 4; ++i)
                m_gl->glPixelStorei(Parameter(i), m_previous[i]);
    }
};

#endif
