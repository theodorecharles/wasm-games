#pragma once

#include "jill/palette.hpp"
#include "jill/rgba.hpp"

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace jill {

struct ShaTile {
    int tileset_index = 0;
    int tile_index = 0;
    int width = 0;
    int height = 0;
    int data_format = 0;
    int bit_color = 0;
    std::vector<uint8_t> raw;               // width*height indices
    std::optional<std::vector<uint8_t>> color_map;  // CGA,EGA,VGA,0 per entry

    Image decode_vga(const Palette& pal) const;
};

struct ShaTileset {
    int header_index = 0;
    int number_tile = 0;
    int bit_color = 0;
    int flags = 0;
    bool font = false;
    bool tileset_flag = false;
    std::vector<ShaTile> tiles;
};

struct ShaFile {
    std::vector<uint32_t> offsets;  // 128
    std::vector<uint16_t> sizes;    // 128
    std::vector<ShaTileset> tilesets;

    static ShaFile load(const std::string& path);
    const ShaTileset* tileset_by_header(int header_index) const;
    const ShaTile* tile(int tileset_header, int tile_index) const;
};

}  // namespace jill
