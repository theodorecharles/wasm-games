#pragma once

#include "jill/rgba.hpp"

#include <array>
#include <string>

namespace jill {

// OpenJill VGA table from jill_color_map.properties (not the EXE 6-bit palette).
struct Palette {
    std::array<Argb, 256> colors{};

    static Palette load_properties(const std::string& path);
    Argb operator[](int index) const {
        if (index < 0 || index > 255) return 0;
        return colors[static_cast<size_t>(index)];
    }
};

}  // namespace jill
