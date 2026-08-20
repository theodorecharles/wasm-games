#include "jill/rgba.hpp"

#include <fstream>
#include <stdexcept>

namespace jill {

void write_rgba(const std::string& path, const Image& img) {
    std::ofstream out(path, std::ios::binary);
    if (!out) throw std::runtime_error("cannot write " + path);
    const uint32_t w = static_cast<uint32_t>(img.w);
    const uint32_t h = static_cast<uint32_t>(img.h);
    out.write(reinterpret_cast<const char*>(&w), 4);
    out.write(reinterpret_cast<const char*>(&h), 4);
    for (Argb p : img.px) {
        const uint8_t bytes[4] = {argb_a(p), argb_r(p), argb_g(p), argb_b(p)};
        out.write(reinterpret_cast<const char*>(bytes), 4);
    }
}

Image read_rgba(const std::string& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) throw std::runtime_error("cannot read " + path);
    uint32_t w = 0, h = 0;
    in.read(reinterpret_cast<char*>(&w), 4);
    in.read(reinterpret_cast<char*>(&h), 4);
    Image img(static_cast<int>(w), static_cast<int>(h));
    for (size_t i = 0; i < img.px.size(); ++i) {
        uint8_t b[4];
        if (!in.read(reinterpret_cast<char*>(b), 4)) {
            throw std::runtime_error("short rgba " + path);
        }
        img.px[i] = make_argb(b[0], b[1], b[2], b[3]);
    }
    return img;
}

void write_ppm(const std::string& path, const Image& img) {
    std::ofstream out(path, std::ios::binary);
    if (!out) throw std::runtime_error("cannot write " + path);
    out << "P6\n" << img.w << " " << img.h << "\n255\n";
    for (Argb p : img.px) {
        const uint8_t rgb[3] = {argb_r(p), argb_g(p), argb_b(p)};
        out.write(reinterpret_cast<const char*>(rgb), 3);
    }
}

void blit(Image& dst, int dx, int dy, const Image& src) {
    for (int y = 0; y < src.h; ++y) {
        for (int x = 0; x < src.w; ++x) {
            const int tx = dx + x;
            const int ty = dy + y;
            if (!dst.in_bounds(tx, ty)) continue;
            const Argb p = src.get(x, y);
            if (argb_a(p) == 0) continue;
            dst.set(tx, ty, p);
        }
    }
}

}  // namespace jill
