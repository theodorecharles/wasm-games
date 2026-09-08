#ifndef SOURCE_WASM_MONITOR_DIAGNOSTICS_H
#define SOURCE_WASM_MONITOR_DIAGNOSTICS_H
#include <stdint.h>
#include <stddef.h>

inline uint64_t SourceWasmMonitorHash(const void *data, size_t size) {
    uint64_t hash = UINT64_C(14695981039346656037);
    const unsigned char *bytes = static_cast<const unsigned char *>(data);
    for (size_t i = 0; i < size; ++i) hash = (hash ^ bytes[i]) * UINT64_C(1099511628211);
    return hash;
}
inline bool SourceWasmIsCameraTarget(const char *name) {
    const char expected[] = "_rt_camera";
    if (!name) return false;
    for (size_t i = 0; i < sizeof(expected); ++i) {
        const char value = name[i];
        const char lower = value >= 'A' && value <= 'Z' ? char(value + 'a' - 'A') : value;
        if (lower != expected[i]) return false;
        if (!value) return true;
    }
    return false;
}
struct SourceWasmMonitorGate {
    uint64_t keys[32];
    unsigned count;
    SourceWasmMonitorGate() : keys(), count(0) {}
    bool Accept(uint64_t key) {
        for (unsigned i = 0; i < count; ++i) if (keys[i] == key) return false;
        if (count == 32) return false;
        keys[count++] = key;
        return true;
    }
};
#endif
