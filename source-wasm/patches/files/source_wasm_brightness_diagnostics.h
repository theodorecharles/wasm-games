#ifndef SOURCE_WASM_BRIGHTNESS_DIAGNOSTICS_H
#define SOURCE_WASM_BRIGHTNESS_DIAGNOSTICS_H
#include <stdint.h>
#include <stddef.h>

// Separate quotas reserve observations for G-Man even after a long menu run.
inline bool SourceWasmBrightnessContains(const char *text, const char *needle) {
    if (!text || !needle || !*needle) return false;
    for (const char *start = text; *start; ++start) {
        const char *a = start, *b = needle;
        while (*a && *b) {
            const char lower = (*a >= 'A' && *a <= 'Z') ? char(*a + ('a' - 'A')) : *a;
            if (lower != *b) break;
            ++a; ++b;
        }
        if (!*b) return true;
    }
    return false;
}
inline int SourceWasmBrightnessBucket(const char *shader, const char *texture) {
    if (SourceWasmBrightnessContains(texture, "gman")) return 0;
    if (SourceWasmBrightnessContains(shader, "lightmapped") ||
        SourceWasmBrightnessContains(texture, "lightmap")) return 1;
    if (SourceWasmBrightnessContains(shader, "engine_post") ||
        SourceWasmBrightnessContains(texture, "_rt_")) return 2;
    if (SourceWasmBrightnessContains(texture, "models/")) return 3;
    return -1;
}
inline uint64_t SourceWasmBrightnessHash(const void *data, size_t size,
                                       uint64_t hash = UINT64_C(14695981039346656037)) {
    const unsigned char *bytes = static_cast<const unsigned char *>(data);
    for (size_t i = 0; i < size; ++i) hash = (hash ^ bytes[i]) * UINT64_C(1099511628211);
    return hash;
}
inline uint64_t SourceWasmBrightnessText(const char *text, uint64_t hash = UINT64_C(14695981039346656037)) {
    if (!text) return hash;
    while (*text) { hash = (hash ^ static_cast<unsigned char>(*text++)) * UINT64_C(1099511628211); }
    return hash;
}
struct SourceWasmBrightnessGate {
    unsigned count[4];
    uint64_t keys[4][6];
    SourceWasmBrightnessGate() : count(), keys() {}
    bool Accept(int bucket, uint64_t key) {
        static const unsigned limits[4] = {6, 6, 2, 2};
        if (bucket < 0 || bucket >= 4) return false;
        for (unsigned i = 0; i < count[bucket]; ++i) if (keys[bucket][i] == key) return false;
        if (count[bucket] >= limits[bucket]) return false;
        keys[bucket][count[bucket]++] = key;
        return true;
    }
};
#endif
