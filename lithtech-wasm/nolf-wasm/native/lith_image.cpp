#include "lith_image.h"

#include <algorithm>
#include <cstring>

namespace {

uint32_t pack_rgba(int r, int g, int b, int a = 255) {
  return uint32_t(r) | (uint32_t(g) << 8) | (uint32_t(b) << 16) | (uint32_t(a) << 24);
}

}  // namespace

bool lith_decode_pcx(const std::string &bytes, LithImage *out) {
  if (!out || bytes.size() < 128 || static_cast<uint8_t>(bytes[0]) != 10) return false;
  uint16_t xmin = 0, ymin = 0, xmax = 0, ymax = 0, bpl = 0;
  std::memcpy(&xmin, bytes.data() + 4, 2);
  std::memcpy(&ymin, bytes.data() + 6, 2);
  std::memcpy(&xmax, bytes.data() + 8, 2);
  std::memcpy(&ymax, bytes.data() + 10, 2);
  std::memcpy(&bpl, bytes.data() + 66, 2);
  const int w = int(xmax) - int(xmin) + 1;
  const int h = int(ymax) - int(ymin) + 1;
  const int bpp = static_cast<uint8_t>(bytes[3]);
  const int nplanes = static_cast<uint8_t>(bytes[65]);
  if (w <= 0 || h <= 0 || w > 2048 || h > 2048 || bpp != 8 || bpl == 0) return false;

  const uint8_t *pal = nullptr;
  size_t body_end = bytes.size();
  if (bytes.size() > 769 && static_cast<uint8_t>(bytes[bytes.size() - 769]) == 12) {
    pal = reinterpret_cast<const uint8_t *>(bytes.data() + bytes.size() - 768);
    body_end = bytes.size() - 769;
  }

  const uint8_t *body = reinterpret_cast<const uint8_t *>(bytes.data() + 128);
  const size_t body_n = body_end > 128 ? body_end - 128 : 0;
  std::vector<uint8_t> raw;
  raw.reserve(size_t(bpl) * size_t(nplanes) * size_t(h));
  const size_t need = size_t(bpl) * size_t(nplanes) * size_t(h);
  for (size_t i = 0; i < body_n && raw.size() < need; ++i) {
    const uint8_t b = body[i];
    if (b >= 0xC0) {
      if (i + 1 >= body_n) break;
      const int cnt = b & 0x3F;
      const uint8_t val = body[++i];
      raw.insert(raw.end(), size_t(cnt), val);
    } else {
      raw.push_back(b);
    }
  }
  if (raw.size() < need) return false;

  out->w = w;
  out->h = h;
  out->rgba.assign(size_t(w) * size_t(h), pack_rgba(0, 0, 0));
  if (nplanes == 1) {
    if (!pal) return false;
    for (int y = 0; y < h; ++y) {
      const uint8_t *row = raw.data() + size_t(y) * bpl;
      for (int x = 0; x < w; ++x) {
        const int idx = row[x] * 3;
        out->rgba[size_t(y) * w + x] =
            pack_rgba(pal[idx], pal[idx + 1], pal[idx + 2]);
      }
    }
    return true;
  }
  if (nplanes == 3) {
    for (int y = 0; y < h; ++y) {
      const uint8_t *base = raw.data() + size_t(y) * bpl * 3;
      for (int x = 0; x < w; ++x) {
        out->rgba[size_t(y) * w + x] =
            pack_rgba(base[x], base[bpl + x], base[2 * bpl + x]);
      }
    }
    return true;
  }
  return false;
}

static uint32_t rgb565(uint16_t c) {
  const int r = ((c >> 11) & 31) * 255 / 31;
  const int g = ((c >> 5) & 63) * 255 / 63;
  const int b = (c & 31) * 255 / 31;
  return pack_rgba(r, g, b);
}

static bool decode_dxt1(const uint8_t *src, int w, int h, std::vector<uint32_t> *out) {
  out->assign(size_t(w) * size_t(h), pack_rgba(0, 0, 0));
  const int bw = (w + 3) / 4, bh = (h + 3) / 4;
  for (int by = 0; by < bh; ++by) {
    for (int bx = 0; bx < bw; ++bx) {
      const uint8_t *block = src + (by * bw + bx) * 8;
      uint16_t c0 = 0, c1 = 0;
      std::memcpy(&c0, block, 2);
      std::memcpy(&c1, block + 2, 2);
      uint32_t cols[4] = {rgb565(c0), rgb565(c1), 0, 0};
      const int r0 = cols[0] & 255, g0 = (cols[0] >> 8) & 255, b0 = (cols[0] >> 16) & 255;
      const int r1 = cols[1] & 255, g1 = (cols[1] >> 8) & 255, b1 = (cols[1] >> 16) & 255;
      if (c0 > c1) {
        cols[2] = pack_rgba((2 * r0 + r1) / 3, (2 * g0 + g1) / 3, (2 * b0 + b1) / 3);
        cols[3] = pack_rgba((r0 + 2 * r1) / 3, (g0 + 2 * g1) / 3, (b0 + 2 * b1) / 3);
      } else {
        cols[2] = pack_rgba((r0 + r1) / 2, (g0 + g1) / 2, (b0 + b1) / 2);
        cols[3] = pack_rgba(0, 0, 0, 0);
      }
      uint32_t bits = 0;
      std::memcpy(&bits, block + 4, 4);
      for (int py = 0; py < 4; ++py) {
        for (int px = 0; px < 4; ++px) {
          const int x = bx * 4 + px, y = by * 4 + py;
          if (x >= w || y >= h) continue;
          (*out)[size_t(y) * w + x] = cols[bits & 3];
          bits >>= 2;
        }
      }
    }
  }
  return true;
}

bool lith_decode_dtx32(const std::string &bytes, LithImage *out) {
  if (!out || bytes.size() < 164) return false;
  int32_t ver = 0;
  uint16_t w = 0, h = 0, nmips = 0;
  std::memcpy(&ver, bytes.data() + 4, 4);
  std::memcpy(&w, bytes.data() + 8, 2);
  std::memcpy(&h, bytes.data() + 10, 2);
  std::memcpy(&nmips, bytes.data() + 12, 2);
  if (w == 0 || h == 0 || w > 1024 || h > 1024) return false;
  const uint8_t *pix = reinterpret_cast<const uint8_t *>(bytes.data() + 164);
  const size_t payload = bytes.size() - 164;
  const size_t raw32 = size_t(w) * size_t(h) * 4;
  const size_t dxt1 = size_t((w + 3) / 4) * size_t((h + 3) / 4) * 8;
  out->w = w;
  out->h = h;
  if (payload >= raw32) {
    out->rgba.resize(size_t(w) * size_t(h));
    for (size_t i = 0; i < raw32; i += 4) {
      out->rgba[i / 4] = pack_rgba(pix[i + 2], pix[i + 1], pix[i], pix[i + 3]);
    }
    (void)ver;
    (void)nmips;
    return true;
  }
  if (payload >= dxt1) {
    (void)ver;
    (void)nmips;
    return decode_dxt1(pix, w, h, &out->rgba);
  }
  return false;
}

void lith_blit(uint32_t *dst, int dw, int dh, const LithImage &src, int dx, int dy,
               bool chroma_blue) {
  if (!dst || src.rgba.empty()) return;
  for (int y = 0; y < src.h; ++y) {
    const int oy = y + dy;
    if (oy < 0 || oy >= dh) continue;
    for (int x = 0; x < src.w; ++x) {
      const int ox = x + dx;
      if (ox < 0 || ox >= dw) continue;
      const uint32_t p = src.rgba[size_t(y) * src.w + x];
      const int r = int(p & 255), g = int((p >> 8) & 255), b = int((p >> 16) & 255);
      const int a = int((p >> 24) & 255);
      if (a < 16) continue;
      if (chroma_blue && b > 160 && b > r + 40 && b > g + 20) continue;
      dst[oy * dw + ox] = p;
    }
  }
}

void lith_fill(uint32_t *dst, int dw, int dh, int x, int y, int w, int h,
               uint32_t rgba) {
  if (!dst) return;
  for (int yy = y; yy < y + h; ++yy) {
    if (yy < 0 || yy >= dh) continue;
    for (int xx = x; xx < x + w; ++xx) {
      if (xx < 0 || xx >= dw) continue;
      dst[yy * dw + xx] = rgba;
    }
  }
}

// 8x8 ASCII 32-90 (space through Z). Enough for official menu strings.
static const uint8_t kFont8[59][8] = {
    {0,0,0,0,0,0,0,0}, // space
    {0x18,0x18,0x18,0x18,0x18,0x00,0x18,0x00}, // !
    {0x6c,0x6c,0x24,0x00,0x00,0x00,0x00,0x00},
    {0x6c,0xfe,0x6c,0x6c,0xfe,0x6c,0x00,0x00},
    {0x18,0x3e,0x60,0x3c,0x06,0x7c,0x18,0x00},
    {0x62,0x66,0x0c,0x18,0x30,0x66,0x46,0x00},
    {0x38,0x6c,0x38,0x70,0xde,0xcc,0x76,0x00},
    {0x18,0x18,0x10,0x00,0x00,0x00,0x00,0x00},
    {0x0c,0x18,0x30,0x30,0x30,0x18,0x0c,0x00},
    {0x30,0x18,0x0c,0x0c,0x0c,0x18,0x30,0x00},
    {0x00,0x66,0x3c,0xff,0x3c,0x66,0x00,0x00},
    {0x00,0x18,0x18,0x7e,0x18,0x18,0x00,0x00},
    {0x00,0x00,0x00,0x00,0x00,0x18,0x18,0x30},
    {0x00,0x00,0x00,0x7e,0x00,0x00,0x00,0x00},
    {0x00,0x00,0x00,0x00,0x00,0x18,0x18,0x00},
    {0x02,0x06,0x0c,0x18,0x30,0x60,0x40,0x00},
    {0x3c,0x66,0x6e,0x76,0x66,0x66,0x3c,0x00}, // 0
    {0x18,0x38,0x18,0x18,0x18,0x18,0x7e,0x00},
    {0x3c,0x66,0x06,0x1c,0x30,0x66,0x7e,0x00},
    {0x3c,0x66,0x06,0x1c,0x06,0x66,0x3c,0x00},
    {0x0c,0x1c,0x3c,0x6c,0x7e,0x0c,0x0c,0x00},
    {0x7e,0x60,0x7c,0x06,0x06,0x66,0x3c,0x00},
    {0x1c,0x30,0x60,0x7c,0x66,0x66,0x3c,0x00},
    {0x7e,0x66,0x0c,0x18,0x18,0x18,0x18,0x00},
    {0x3c,0x66,0x66,0x3c,0x66,0x66,0x3c,0x00},
    {0x3c,0x66,0x66,0x3e,0x06,0x0c,0x38,0x00},
    {0x00,0x18,0x18,0x00,0x00,0x18,0x18,0x00},
    {0x00,0x18,0x18,0x00,0x00,0x18,0x18,0x30},
    {0x0c,0x18,0x30,0x60,0x30,0x18,0x0c,0x00},
    {0x00,0x00,0x7e,0x00,0x7e,0x00,0x00,0x00},
    {0x30,0x18,0x0c,0x06,0x0c,0x18,0x30,0x00},
    {0x3c,0x66,0x06,0x0c,0x18,0x00,0x18,0x00},
    {0x3c,0x66,0x6e,0x6e,0x60,0x62,0x3c,0x00},
    {0x18,0x3c,0x66,0x66,0x7e,0x66,0x66,0x00}, // A
    {0x7c,0x66,0x66,0x7c,0x66,0x66,0x7c,0x00},
    {0x3c,0x66,0x60,0x60,0x60,0x66,0x3c,0x00},
    {0x78,0x6c,0x66,0x66,0x66,0x6c,0x78,0x00},
    {0x7e,0x60,0x60,0x7c,0x60,0x60,0x7e,0x00},
    {0x7e,0x60,0x60,0x7c,0x60,0x60,0x60,0x00},
    {0x3c,0x66,0x60,0x6e,0x66,0x66,0x3c,0x00},
    {0x66,0x66,0x66,0x7e,0x66,0x66,0x66,0x00},
    {0x7e,0x18,0x18,0x18,0x18,0x18,0x7e,0x00},
    {0x06,0x06,0x06,0x06,0x66,0x66,0x3c,0x00},
    {0x66,0x6c,0x78,0x70,0x78,0x6c,0x66,0x00},
    {0x60,0x60,0x60,0x60,0x60,0x60,0x7e,0x00},
    {0x63,0x77,0x7f,0x6b,0x63,0x63,0x63,0x00},
    {0x66,0x76,0x7e,0x7e,0x6e,0x66,0x66,0x00},
    {0x3c,0x66,0x66,0x66,0x66,0x66,0x3c,0x00},
    {0x7c,0x66,0x66,0x7c,0x60,0x60,0x60,0x00},
    {0x3c,0x66,0x66,0x66,0x6a,0x6c,0x36,0x00},
    {0x7c,0x66,0x66,0x7c,0x6c,0x66,0x66,0x00},
    {0x3c,0x66,0x60,0x3c,0x06,0x66,0x3c,0x00},
    {0x7e,0x18,0x18,0x18,0x18,0x18,0x18,0x00},
    {0x66,0x66,0x66,0x66,0x66,0x66,0x3c,0x00},
    {0x66,0x66,0x66,0x66,0x66,0x3c,0x18,0x00},
    {0x63,0x63,0x63,0x6b,0x7f,0x77,0x63,0x00},
    {0x66,0x66,0x3c,0x18,0x3c,0x66,0x66,0x00},
    {0x66,0x66,0x66,0x3c,0x18,0x18,0x18,0x00},
};

void lith_draw_text(uint32_t *dst, int dw, int dh, const LithImage &,
                    const char *text, int x, int y, uint32_t rgba) {
  if (!dst || !text) return;
  const int s = 2;
  for (const char *p = text; *p; ++p) {
    char ch = *p;
    if (ch >= 'a' && ch <= 'z') ch = static_cast<char>(ch - 32);
    int idx = -1;
    if (ch >= 32 && ch <= 90) idx = ch - 32;
    if (idx < 0 || idx >= 59) idx = '?' - 32;
    for (int gy = 0; gy < 8; ++gy) {
      const uint8_t bits = kFont8[idx][gy];
      for (int gx = 0; gx < 8; ++gx) {
        if (!(bits & (0x80 >> gx))) continue;
        for (int oy = 0; oy < s; ++oy) {
          for (int ox = 0; ox < s; ++ox) {
            const int px = x + gx * s + ox;
            const int py = y + gy * s + oy;
            if (px >= 0 && px < dw && py >= 0 && py < dh) dst[py * dw + px] = rgba;
          }
        }
      }
    }
    x += 8 * s + 2;
  }
}

void lith_scale_blit(uint32_t *dst, int dw, int dh, const LithImage &src) {
  if (!dst || src.rgba.empty() || src.w <= 0 || src.h <= 0) return;
  for (int y = 0; y < dh; ++y) {
    const int sy = y * src.h / dh;
    for (int x = 0; x < dw; ++x) {
      const int sx = x * src.w / dw;
      dst[y * dw + x] = src.rgba[size_t(sy) * src.w + sx];
    }
  }
}
