#ifndef SOURCE_WASM_SRGB_WRITE_H
#define SOURCE_WASM_SRGB_WRITE_H

enum { SourceWasmLinearEncoding = 0x2601, SourceWasmSrgbEncoding = 0x8c40 };

struct SourceWasmSrgbTargetKey {
    const void *texture;
    unsigned name, format, flags;
    int mip, face, slice;
    SourceWasmSrgbTargetKey() : texture(0), name(0), format(0), flags(0), mip(0), face(0), slice(0) {}
    bool operator==(const SourceWasmSrgbTargetKey &other) const {
        return texture == other.texture && name == other.name && format == other.format &&
            flags == other.flags && mip == other.mip && face == other.face && slice == other.slice;
    }
};

// Owned by the FBO, so deletion/name reuse cannot reuse a previous observation.
// Reattachment invalidates explicitly; the key also detects layout changes.
struct SourceWasmSrgbTargetCache {
    SourceWasmSrgbTargetKey key;
    int encoding;
    bool valid;
    SourceWasmSrgbTargetCache() : key(), encoding(0), valid(false) {}
    void Invalidate() { valid = false; }
    template<class Query> int Resolve(const SourceWasmSrgbTargetKey &current, Query query) {
        if (!valid || !(key == current)) {
            encoding = query();
            key = current;
            valid = encoding == SourceWasmLinearEncoding || encoding == SourceWasmSrgbEncoding;
        }
        return encoding;
    }
};

// The attachment performs the conversion for sRGB storage. Software encoding
// is needed only for requested sRGB writes into a linear attachment. WebGL's
// hardware conversion on sRGB attachments cannot be toggled off by this helper.
template<class WriteUniform>
bool SourceWasmApplySrgbWrite(int location, bool requested, int encoding,
                            float &previous, WriteUniform writeUniform) {
    if (location < 0) return true; // engine_post and other shaders without the suffix
    if (encoding != SourceWasmLinearEncoding && encoding != SourceWasmSrgbEncoding) return false;
    const float desired = requested && encoding == SourceWasmLinearEncoding ? 1.0f : 0.0f;
    if (previous != desired) {
        writeUniform(location, desired);
        previous = desired;
    }
    return true;
}
#endif
