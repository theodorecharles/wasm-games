#include "jill/sha.hpp"

#include "jill/bytes.hpp"

#include <stdexcept>

namespace jill {

namespace {
constexpr int kShaEntries = 128;
constexpr int kVgaColorOffset = 2;
constexpr uint16_t kFontFlag = 0x0001;
constexpr uint16_t kTilesetFlag = 0x0004;
}  // namespace

Image ShaTile::decode_vga(const Palette& pal) const {
    Image img(width, height, 0);
    if (width <= 0 || height <= 0) return img;
    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            const int color_byte = raw[static_cast<size_t>(x) + static_cast<size_t>(y) * width];
            int pal_index = color_byte;
            if (color_map.has_value()) {
                const auto& cm = *color_map;
                const int offset_map = color_byte * 4 + kVgaColorOffset;
                if (offset_map < static_cast<int>(cm.size())) {
                    pal_index = cm[static_cast<size_t>(offset_map)];
                }
            }
            img.set(x, y, pal[pal_index]);
        }
    }
    return img;
}

ShaFile ShaFile::load(const std::string& path) {
    ByteReader r = ByteReader::load_file(path);
    ShaFile sha;
    sha.offsets.resize(kShaEntries);
    sha.sizes.resize(kShaEntries);
    for (int i = 0; i < kShaEntries; ++i) sha.offsets[static_cast<size_t>(i)] = r.read_u32le();
    for (int i = 0; i < kShaEntries; ++i) sha.sizes[static_cast<size_t>(i)] = r.read_u16le();

    for (int index = 0; index < kShaEntries; ++index) {
        const uint32_t off = sha.offsets[static_cast<size_t>(index)];
        const uint16_t sz = sha.sizes[static_cast<size_t>(index)];
        if (off == 0 || sz == 0) continue;

        r.seek(off);
        ShaTileset ts;
        ts.header_index = index;
        ts.number_tile = r.read_u8();
        (void)r.read_u16le();  // numRots
        (void)r.read_u16le();  // lenCGA
        (void)r.read_u16le();  // lenEGA
        (void)r.read_u16le();  // lenVGA
        ts.bit_color = r.read_u8();
        ts.flags = r.read_u16le();
        ts.font = (ts.flags & kFontFlag) != 0;
        ts.tileset_flag = (ts.flags & kTilesetFlag) != 0;

        std::optional<std::vector<uint8_t>> cmap;
        if (!ts.font && ts.bit_color < 8) {
            const int nbytes = (1 << ts.bit_color) * 4;
            std::vector<uint8_t> raw(static_cast<size_t>(nbytes));
            for (int i = 0; i < nbytes; ++i) raw[static_cast<size_t>(i)] = r.read_u8();
            cmap = std::move(raw);
        }

        ts.tiles.reserve(static_cast<size_t>(ts.number_tile));
        for (int t = 0; t < ts.number_tile; ++t) {
            ShaTile tile;
            tile.tileset_index = index;
            tile.tile_index = t;
            tile.width = r.read_u8();
            tile.height = r.read_u8();
            tile.data_format = r.read_u8();
            tile.bit_color = ts.bit_color;
            tile.color_map = cmap;
            const int n = tile.width * tile.height;
            tile.raw.resize(static_cast<size_t>(n));
            for (int i = 0; i < n; ++i) tile.raw[static_cast<size_t>(i)] = r.read_u8();
            ts.tiles.push_back(std::move(tile));
        }
        sha.tilesets.push_back(std::move(ts));
    }
    return sha;
}

const ShaTileset* ShaFile::tileset_by_header(int header_index) const {
    for (const auto& ts : tilesets) {
        if (ts.header_index == header_index) return &ts;
    }
    return nullptr;
}

const ShaTile* ShaFile::tile(int tileset_header, int tile_index) const {
    const ShaTileset* ts = tileset_by_header(tileset_header);
    if (!ts || tile_index < 0 || tile_index >= static_cast<int>(ts->tiles.size())) {
        return nullptr;
    }
    return &ts->tiles[static_cast<size_t>(tile_index)];
}

}  // namespace jill
