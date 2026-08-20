#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace jill {

// Packed 0xAARRGGBB, same as Java BufferedImage.TYPE_INT_ARGB getRGB().
using Argb = uint32_t;

inline uint8_t argb_a(Argb p) { return static_cast<uint8_t>(p >> 24); }
inline uint8_t argb_r(Argb p) { return static_cast<uint8_t>(p >> 16); }
inline uint8_t argb_g(Argb p) { return static_cast<uint8_t>(p >> 8); }
inline uint8_t argb_b(Argb p) { return static_cast<uint8_t>(p); }

inline Argb make_argb(uint8_t a, uint8_t r, uint8_t g, uint8_t b) {
    return (static_cast<Argb>(a) << 24) | (static_cast<Argb>(r) << 16) |
           (static_cast<Argb>(g) << 8) | static_cast<Argb>(b);
}

struct Image {
    int w = 0;
    int h = 0;
    std::vector<Argb> px;  // row-major, size w*h

    Image() = default;
    Image(int width, int height, Argb fill = 0)
        : w(width), h(height), px(static_cast<size_t>(width) * height, fill) {}

    Argb get(int x, int y) const { return px[static_cast<size_t>(y) * w + x]; }
    void set(int x, int y, Argb p) { px[static_cast<size_t>(y) * w + x] = p; }

    bool in_bounds(int x, int y) const { return x >= 0 && y >= 0 && x < w && y < h; }
};

// Raw dump: 8-byte header (uint32le w, uint32le h) then w*h big-endian ARGB bytes.
// Chosen so PNG/JPEG never enter the compare path.
void write_rgba(const std::string& path, const Image& img);
Image read_rgba(const std::string& path);

// Human-viewable RGB PPM (alpha discarded). Not used for compare.
void write_ppm(const std::string& path, const Image& img);

// Overwrite dst[dx,dy] with src, skipping fully-transparent src pixels
// (Java2D SrcOver with src A==0 is a no-op).
void blit(Image& dst, int dx, int dy, const Image& src);

}  // namespace jill
