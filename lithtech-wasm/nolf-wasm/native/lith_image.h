#pragma once

#include <cstdint>
#include <string>
#include <vector>

struct LithImage {
  int w = 0;
  int h = 0;
  std::vector<uint32_t> rgba;
};

bool lith_decode_pcx(const std::string &bytes, LithImage *out);
bool lith_decode_dtx32(const std::string &bytes, LithImage *out);
void lith_blit(uint32_t *dst, int dw, int dh, const LithImage &src, int dx,
               int dy, bool chroma_blue);
void lith_scale_blit(uint32_t *dst, int dw, int dh, const LithImage &src);
void lith_fill(uint32_t *dst, int dw, int dh, int x, int y, int w, int h,
               uint32_t rgba);
void lith_draw_text(uint32_t *dst, int dw, int dh, const LithImage &font,
                    const char *text, int x, int y, uint32_t rgba);
