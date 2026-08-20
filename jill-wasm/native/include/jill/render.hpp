#pragma once

#include "jill/dma.hpp"
#include "jill/jn.hpp"
#include "jill/palette.hpp"
#include "jill/rgba.hpp"
#include "jill/sha.hpp"

namespace jill {

struct Assets {
    Palette palette;
    ShaFile sha;
    DmaFile dma;

    static Assets load(const std::string& game_dir, const std::string& palette_path);
    Image tile_vga(int tileset, int tile) const;
};

// Full 2048x1024 background, OpenJill DMA lookup + VGA decode.
Image render_background(const Assets& assets, const JnFile& map);

}  // namespace jill
