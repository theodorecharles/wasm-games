#pragma once
#include <vector>
#include <stddef.h>
#include <stdint.h>

enum class BrowserIntegerPCM { Unsigned8, Signed8, Signed16LE, Signed32LE };
inline float BrowserReadIntegerPCM(const unsigned char *data, BrowserIntegerPCM format) {
    switch (format) {
    case BrowserIntegerPCM::Unsigned8: return (int(data[0]) - 128) / 128.f;
    case BrowserIntegerPCM::Signed8: return int8_t(data[0]) / 128.f;
    case BrowserIntegerPCM::Signed16LE:
        return int16_t(uint16_t(data[0]) | uint16_t(data[1]) << 8) / 32768.f;
    case BrowserIntegerPCM::Signed32LE:
        return int32_t(uint32_t(data[0]) | uint32_t(data[1]) << 8 |
            uint32_t(data[2]) << 16 | uint32_t(data[3]) << 24) / 2147483648.f;
    }
    return 0;
}

struct BrowserPCM {
    std::vector<float> samples;
    unsigned rate = 0;
    unsigned channels = 0;
    size_t Frames() const { return channels ? samples.size() / channels : 0; }
};

// Decode the codecs used by the engine support pack without asynchronous DOM
// decoders. The input and total decoded sample count are explicitly bounded.
bool BrowserDecodePCM(const void *bytes, size_t length, BrowserPCM &pcm);
