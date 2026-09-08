#ifndef SOURCE_WASM_PRESENT_DIAGNOSTICS_H
#define SOURCE_WASM_PRESENT_DIAGNOSTICS_H
#include <stddef.h>
#include <stdint.h>

// Presentation has a separate finite budget, unaffected by offscreen blits.
struct SourceWasmPresentGate {
    unsigned count;
    uint64_t keys[8];
    SourceWasmPresentGate() : count(0), keys() {}
    bool Accept(const unsigned *values, size_t countValues) {
        uint64_t hash = UINT64_C(14695981039346656037);
        for (size_t i = 0; i < countValues; ++i)
            hash = (hash ^ values[i]) * UINT64_C(1099511628211);
        for (unsigned i = 0; i < count; ++i) if (keys[i] == hash) return false;
        if (count == 8) return false;
        keys[count++] = hash;
        return true;
    }
};
#endif
