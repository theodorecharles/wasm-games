#include "jill/palette.hpp"

#include <cctype>
#include <fstream>
#include <stdexcept>

namespace jill {

static std::string trim(std::string s) {
    size_t a = 0;
    while (a < s.size() && std::isspace(static_cast<unsigned char>(s[a]))) ++a;
    size_t b = s.size();
    while (b > a && std::isspace(static_cast<unsigned char>(s[b - 1]))) --b;
    return s.substr(a, b - a);
}

Palette Palette::load_properties(const std::string& path) {
    std::ifstream in(path);
    if (!in) throw std::runtime_error("cannot open palette " + path);
    Palette pal;
    std::string line;
    int n = 0;
    while (std::getline(in, line)) {
        line = trim(line);
        if (line.empty() || line[0] == '#') continue;
        if (n >= 256) break;
        if (line[0] == '!') {
            // Java: new Color(Integer.parseInt(hex, 16), true) → ARGB
            const unsigned long v = std::stoul(line.substr(1), nullptr, 16);
            pal.colors[static_cast<size_t>(n++)] = static_cast<Argb>(v);
        } else {
            // Java: new Color(rgb) → opaque 0xFFRRGGBB
            const unsigned long v = std::stoul(line, nullptr, 16);
            pal.colors[static_cast<size_t>(n++)] =
                static_cast<Argb>(0xFF000000u | (v & 0x00FFFFFFu));
        }
    }
    if (n != 256) {
        throw std::runtime_error("palette expected 256 colors, got " + std::to_string(n));
    }
    return pal;
}

}  // namespace jill
