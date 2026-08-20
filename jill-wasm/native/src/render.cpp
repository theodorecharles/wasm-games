#include "jill/render.hpp"

#include <stdexcept>

namespace jill {

Assets Assets::load(const std::string& game_dir, const std::string& palette_path) {
    Assets a;
    a.palette = Palette::load_properties(palette_path);
    a.sha = ShaFile::load(game_dir + "/JILL1.SHA");
    a.dma = DmaFile::load(game_dir + "/JILL.DMA");
    return a;
}

Image Assets::tile_vga(int tileset, int tile) const {
    const ShaTile* t = sha.tile(tileset, tile);
    if (!t) return Image();
    return t->decode_vga(palette);
}

Image render_background(const Assets& assets, const JnFile& map) {
    Image out(kMapWidth * 16, kMapHeight * 16, 0);
    for (int x = 0; x < kMapWidth; ++x) {
        for (int y = 0; y < kMapHeight; ++y) {
            const int code = map.code(x, y);
            const DmaEntry* e = assets.dma.find(code);
            if (!e) continue;
            const Image tile = assets.tile_vga(e->tileset, e->tile);
            blit(out, x * 16, y * 16, tile);
        }
    }
    return out;
}

}  // namespace jill
