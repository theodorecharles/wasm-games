#include "decode.h"
#include <cassert>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <iterator>
#include <vector>

int main(int argc, char **argv) {
    assert(argc > 1);
    BrowserPCM pcm;
    const unsigned char invalid[128] = {};
    const unsigned char midpoint[] = {128, 0, 0, 0};
    const unsigned char minimum16[] = {0, 128};
    const unsigned char maximum16[] = {255, 127};
    const unsigned char minimum32[] = {0, 0, 0, 128};
    assert(BrowserReadIntegerPCM(invalid, BrowserIntegerPCM::Unsigned8) == -1);
    assert(BrowserReadIntegerPCM(midpoint, BrowserIntegerPCM::Unsigned8) == 0);
    assert(BrowserReadIntegerPCM(midpoint, BrowserIntegerPCM::Signed8) == -1);
    assert(BrowserReadIntegerPCM(invalid, BrowserIntegerPCM::Signed8) == 0);
    assert(BrowserReadIntegerPCM(minimum16, BrowserIntegerPCM::Signed16LE) == -1);
    assert(BrowserReadIntegerPCM(maximum16, BrowserIntegerPCM::Signed16LE) == 32767 / 32768.f);
    assert(BrowserReadIntegerPCM(minimum32, BrowserIntegerPCM::Signed32LE) == -1);
    assert(!BrowserDecodePCM(nullptr, 0, pcm));
    assert(!BrowserDecodePCM(invalid, sizeof(invalid), pcm));
    for (int i = 1; i < argc; ++i) {
        std::ifstream input(argv[i], std::ios::binary);
        assert(input.good());
        std::vector<unsigned char> data((std::istreambuf_iterator<char>(input)), std::istreambuf_iterator<char>());
        assert(BrowserDecodePCM(data.data(), data.size(), pcm));
        assert(pcm.channels >= 1 && pcm.channels <= 2);
        double energy = 0;
        for (float value : pcm.samples) {
            assert(std::isfinite(value) && std::abs(value) <= 1);
            energy += value * value;
        }
        assert(energy > 0 && pcm.Frames() > 100);
        printf("%s: %u Hz, %u channels, %zu frames, energy %.3f\n", argv[i], pcm.rate, pcm.channels, pcm.Frames(), energy);
        const size_t completeFrames = pcm.Frames();
        assert(!BrowserDecodePCM(data.data(), 11, pcm));
        // Some containers permit a valid shorter stream after truncation.
        // Either reject it cleanly or return bounded, finite partial PCM.
        if (BrowserDecodePCM(data.data(), data.size() / 2, pcm)) {
            assert(pcm.Frames() < completeFrames);
            for (float value : pcm.samples) assert(std::isfinite(value) && std::abs(value) <= 1);
        }
    }
    puts("Native codec tests passed: real WAV/FLAC/Ogg samples, truncation and invalid headers.");
}
