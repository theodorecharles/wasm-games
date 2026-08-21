// NOLF2 Linux boot: official CRezMgr + retail REZ splash, then the official
// main-menu art/strings so you can leave the splash and drive the frontend.
// CShell is not linked yet; New Game lists official WORLDS names only.

#include <SDL.h>
#include <ft2build.h>
#include FT_FREETYPE_H

#include <ctype.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <algorithm>
#include <string>
#include <vector>

#ifdef __LINUX
#ifndef _LINUX
#define _LINUX
#endif
#endif

#include "rezmgr.h"

namespace {

const char *kDefaultData = "/home/ted/wasm-game-data/nolf2/game";

enum { kWinW = 1024, kWinH = 768 };

const char *kSplashPaths[] = {
    "INTERFACE\\MENU\\ART\\SPLASH.PCX",
    "Interface\\Menu\\Art\\splash.pcx",
};

const char *kFontPaths[] = {
    "INTERFACE\\FONTS\\SQR721B.TTF",
    "INTERFACE\\FONTS\\SQR721KN.TTF",
    "INTERFACE\\FONTS\\TYPIST.TTF",
};

enum Screen {
    kSplash,
    kMain,
    kSingle,
    kOptions,
    kWorlds,
    kNotice
};

struct RgbaImage {
    int w = 0;
    int h = 0;
    std::vector<uint8_t> rgba;
};

uint32_t ru16(const uint8_t *p) { return (uint32_t)p[0] | ((uint32_t)p[1] << 8); }
uint32_t ru32(const uint8_t *p)
{
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

CRezItm *FindItem(CRezMgr *mgr, const char *dosPath)
{
    if (!mgr || !dosPath) return NULL;
    CRezItm *it = mgr->GetRezFromDosPath(dosPath);
    if (it) return it;
    std::string flipped = dosPath;
    for (char &c : flipped) {
        if (c == '\\') c = '/';
    }
    return mgr->GetRezFromDosPath(flipped.c_str());
}

bool LoadBytes(CRezMgr *mgr, const char *path, std::vector<uint8_t> *out)
{
    CRezItm *it = FindItem(mgr, path);
    if (!it) return false;
    const DWORD n = it->GetSize();
    if (n == 0 || n > 64u * 1024u * 1024u) return false;
    out->assign(n, 0);
    if (!it->Get(out->data())) return false;
    return true;
}

bool DecodePcx(const uint8_t *src, size_t len, RgbaImage *out)
{
    if (!src || len < 128 || !out) return false;
    const int bits = src[3];
    const int x0 = (int)(int16_t)(src[4] | (src[5] << 8));
    const int y0 = (int)(int16_t)(src[6] | (src[7] << 8));
    const int x1 = (int)(int16_t)(src[8] | (src[9] << 8));
    const int y1 = (int)(int16_t)(src[10] | (src[11] << 8));
    const int planes = (int)(int8_t)src[65];
    const int bpl = (int)(int16_t)(src[66] | (src[67] << 8));
    if (bits != 8 || (planes != 1 && planes != 3)) return false;
    const int w = x1 - x0 + 1;
    const int h = y1 - y0 + 1;
    if (w <= 0 || h <= 0 || w > 4096 || h > 4096) return false;

    std::vector<uint8_t> raw((size_t)h * (size_t)bpl * (size_t)planes);
    size_t i = 128;
    size_t o = 0;
    while (o < raw.size() && i < len) {
        uint8_t b = src[i++];
        int count = 1;
        if ((b & 0xC0) == 0xC0) {
            count = b & 0x3F;
            if (i >= len) return false;
            b = src[i++];
        }
        while (count-- > 0 && o < raw.size()) raw[o++] = b;
    }

    out->w = w;
    out->h = h;
    out->rgba.assign((size_t)w * (size_t)h * 4u, 0);
    if (planes == 1) {
        uint8_t pal[768];
        memset(pal, 0, sizeof(pal));
        if (len >= 769 && src[len - 769] == 0x0C) memcpy(pal, src + len - 768, 768);
        else if (len >= 768) memcpy(pal, src + len - 768, 768);
        for (int y = 0; y < h; ++y) {
            const uint8_t *row = raw.data() + (size_t)y * (size_t)bpl;
            for (int x = 0; x < w; ++x) {
                uint8_t *p = &out->rgba[((size_t)y * (size_t)w + (size_t)x) * 4u];
                p[0] = pal[row[x] * 3 + 0];
                p[1] = pal[row[x] * 3 + 1];
                p[2] = pal[row[x] * 3 + 2];
                p[3] = 255;
            }
        }
    } else {
        for (int y = 0; y < h; ++y) {
            const uint8_t *r = raw.data() + (size_t)y * (size_t)bpl * 3u;
            const uint8_t *g = r + bpl;
            const uint8_t *b = g + bpl;
            for (int x = 0; x < w; ++x) {
                uint8_t *p = &out->rgba[((size_t)y * (size_t)w + (size_t)x) * 4u];
                p[0] = r[x];
                p[1] = g[x];
                p[2] = b[x];
                p[3] = 255;
            }
        }
    }
    return true;
}

void Dxt1Block(const uint8_t *b, uint8_t px[16][4])
{
    const uint16_t c0 = (uint16_t)(b[0] | (b[1] << 8));
    const uint16_t c1 = (uint16_t)(b[2] | (b[3] << 8));
    uint8_t c[4][4];
    auto rgb565 = [](uint16_t v, uint8_t *o) {
        o[0] = (uint8_t)(((v >> 11) & 31) * 255 / 31);
        o[1] = (uint8_t)(((v >> 5) & 63) * 255 / 63);
        o[2] = (uint8_t)((v & 31) * 255 / 31);
        o[3] = 255;
    };
    rgb565(c0, c[0]);
    rgb565(c1, c[1]);
    if (c0 > c1) {
        for (int i = 0; i < 3; ++i) {
            c[2][i] = (uint8_t)((2 * c[0][i] + c[1][i]) / 3);
            c[3][i] = (uint8_t)((c[0][i] + 2 * c[1][i]) / 3);
        }
        c[2][3] = c[3][3] = 255;
    } else {
        for (int i = 0; i < 3; ++i) {
            c[2][i] = (uint8_t)((c[0][i] + c[1][i]) / 2);
            c[3][i] = 0;
        }
        c[2][3] = 255;
        c[3][3] = 0;
    }
    uint32_t bits = ru32(b + 4);
    for (int i = 0; i < 16; ++i) {
        memcpy(px[i], c[bits & 3], 4);
        bits >>= 2;
    }
}

bool DecodeDtx(const uint8_t *src, size_t len, RgbaImage *out)
{
    if (!src || len < 164 || !out) return false;
    const int32_t ver = (int32_t)ru32(src + 4);
    const int w = (int)ru16(src + 8);
    const int h = (int)ru16(src + 10);
    const int mips = (int)ru16(src + 12);
    const uint8_t bppId = src[24 + 2];
    enum { BPP_8P = 0, BPP_8, BPP_16, BPP_32, BPP_DXT1, BPP_DXT3, BPP_DXT5 };
    const int bpp = (bppId == 0) ? BPP_32 : (int)bppId;
    if (w <= 0 || h <= 0 || w > 2048 || h > 2048) return false;
    if (ver != -5 && ver != -4 && ver != -3) {
        fprintf(stderr, "dtx version %d unexpected\n", (int)ver);
    }
    const uint8_t *pix = src + 164;
    out->w = w;
    out->h = h;
    out->rgba.assign((size_t)w * (size_t)h * 4u, 0);

    auto put = [&](int x, int y, uint8_t r, uint8_t g, uint8_t b, uint8_t a) {
        if ((unsigned)x >= (unsigned)w || (unsigned)y >= (unsigned)h) return;
        uint8_t *p = &out->rgba[((size_t)y * (size_t)w + (size_t)x) * 4u];
        p[0] = r;
        p[1] = g;
        p[2] = b;
        p[3] = a;
    };

    if (bpp == BPP_32) {
        const size_t need = (size_t)w * (size_t)h * 4u;
        if (pix + need > src + len) return false;
        for (int y = 0; y < h; ++y) {
            for (int x = 0; x < w; ++x) {
                const uint8_t *s = pix + ((size_t)y * (size_t)w + (size_t)x) * 4u;
                put(x, y, s[2], s[1], s[0], s[3] ? s[3] : 255); // BGRA
            }
        }
        return true;
    }
    if (bpp == BPP_16) {
        const size_t need = (size_t)w * (size_t)h * 2u;
        if (pix + need > src + len) return false;
        for (int y = 0; y < h; ++y) {
            for (int x = 0; x < w; ++x) {
                uint16_t v = (uint16_t)ru16(pix + ((size_t)y * (size_t)w + (size_t)x) * 2u);
                uint8_t r = (uint8_t)(((v >> 11) & 31) * 255 / 31);
                uint8_t g = (uint8_t)(((v >> 5) & 63) * 255 / 63);
                uint8_t b = (uint8_t)((v & 31) * 255 / 31);
                put(x, y, r, g, b, 255);
            }
        }
        return true;
    }
    if (bpp == BPP_DXT1 || bpp == BPP_DXT3 || bpp == BPP_DXT5) {
        const int bw = (w + 3) / 4;
        const int bh = (h + 3) / 4;
        const int block = (bpp == BPP_DXT1) ? 8 : 16;
        if (pix + (size_t)bw * (size_t)bh * (size_t)block > src + len) return false;
        for (int by = 0; by < bh; ++by) {
            for (int bx = 0; bx < bw; ++bx) {
                const uint8_t *blk = pix + ((size_t)by * (size_t)bw + (size_t)bx) * (size_t)block;
                uint8_t px[16][4];
                const uint8_t *color = (bpp == BPP_DXT1) ? blk : blk + 8;
                Dxt1Block(color, px);
                if (bpp == BPP_DXT5) {
                    const uint8_t a0 = blk[0], a1 = blk[1];
                    uint8_t av[8];
                    av[0] = a0;
                    av[1] = a1;
                    if (a0 > a1) {
                        for (int i = 1; i <= 6; ++i) av[i + 1] = (uint8_t)(((7 - i) * a0 + i * a1) / 7);
                    } else {
                        for (int i = 1; i <= 4; ++i) av[i + 1] = (uint8_t)(((5 - i) * a0 + i * a1) / 5);
                        av[6] = 0;
                        av[7] = 255;
                    }
                    uint64_t abits = 0;
                    memcpy(&abits, blk + 2, 6);
                    for (int i = 0; i < 16; ++i) {
                        px[i][3] = av[abits & 7];
                        abits >>= 3;
                    }
                }
                for (int py = 0; py < 4; ++py) {
                    for (int px_ = 0; px_ < 4; ++px_) {
                        const uint8_t *c = px[py * 4 + px_];
                        put(bx * 4 + px_, by * 4 + py, c[0], c[1], c[2], c[3]);
                    }
                }
            }
        }
        (void)mips;
        return true;
    }
    fprintf(stderr, "dtx bpp=%d %dx%d unsupported\n", bpp, w, h);
    return false;
}

bool WritePpm(const char *path, const RgbaImage &img)
{
    FILE *f = fopen(path, "wb");
    if (!f) return false;
    fprintf(f, "P6\n%d %d\n255\n", img.w, img.h);
    for (int i = 0; i < img.w * img.h; ++i)
        fwrite(&img.rgba[(size_t)i * 4u], 1, 3, f);
    fclose(f);
    return true;
}

bool LoadImagePath(CRezMgr *mgr, const char *path, RgbaImage *img)
{
    std::vector<uint8_t> bytes;
    if (!LoadBytes(mgr, path, &bytes)) return false;
    const char *dot = strrchr(path, '.');
    bool ok = false;
    if (dot && strcasecmp(dot, ".pcx") == 0) ok = DecodePcx(bytes.data(), bytes.size(), img);
    else ok = DecodeDtx(bytes.data(), bytes.size(), img);
    if (!ok) {
        fprintf(stderr, "decode failed %s (%zu bytes)\n", path, bytes.size());
        return false;
    }
    fprintf(stderr, "loaded %s (%dx%d bpp_hdr=%u)\n", path, img->w, img->h,
            bytes.size() >= 27 ? (unsigned)bytes[26] : 0u);
    if (getenv("NOLF2_DUMP_ART")) {
        char out[256];
        const char *slash = strrchr(path, '\\');
        snprintf(out, sizeof(out), "/tmp/nolf2-art-%s.ppm", slash ? slash + 1 : path);
        WritePpm(out, *img);
        fprintf(stderr, "  dumped %s\n", out);
    }
    return true;
}

void Blit(RgbaImage *dst, const RgbaImage &src, int dx, int dy, int dw, int dh)
{
    if (dst->w <= 0 || src.w <= 0) return;
    if (dw <= 0) dw = src.w;
    if (dh <= 0) dh = src.h;
    for (int y = 0; y < dh; ++y) {
        const int sy = y * src.h / dh;
        const int dyi = dy + y;
        if ((unsigned)dyi >= (unsigned)dst->h) continue;
        for (int x = 0; x < dw; ++x) {
            const int sx = x * src.w / dw;
            const int dxi = dx + x;
            if ((unsigned)dxi >= (unsigned)dst->w) continue;
            const uint8_t *s = &src.rgba[((size_t)sy * (size_t)src.w + (size_t)sx) * 4u];
            if (s[3] < 8) continue;
            uint8_t *d = &dst->rgba[((size_t)dyi * (size_t)dst->w + (size_t)dxi) * 4u];
            if (s[3] >= 250) {
                memcpy(d, s, 4);
            } else {
                const int a = s[3];
                d[0] = (uint8_t)((s[0] * a + d[0] * (255 - a)) / 255);
                d[1] = (uint8_t)((s[1] * a + d[1] * (255 - a)) / 255);
                d[2] = (uint8_t)((s[2] * a + d[2] * (255 - a)) / 255);
                d[3] = 255;
            }
        }
    }
}

struct Font {
    FT_Library lib = NULL;
    FT_Face face = NULL;
    std::vector<uint8_t> ttf;
    bool ok() const { return face != NULL; }
};

bool LoadFont(CRezMgr *mgr, Font *font)
{
    if (FT_Init_FreeType(&font->lib)) return false;
    for (const char *path : kFontPaths) {
        if (!LoadBytes(mgr, path, &font->ttf)) continue;
        if (FT_New_Memory_Face(font->lib, font->ttf.data(), (FT_Long)font->ttf.size(), 0, &font->face) == 0) {
            fprintf(stderr, "font %s\n", path);
            return true;
        }
    }
    return false;
}

void DrawText(RgbaImage *dst, Font *font, int px, int x, int y, const char *text, uint8_t r, uint8_t g, uint8_t b)
{
    if (!font->ok() || !text) return;
    FT_Set_Pixel_Sizes(font->face, 0, (FT_UInt)px);
    const int baseline = y + (int)(font->face->size->metrics.ascender >> 6);
    int pen = x;
    for (const unsigned char *p = (const unsigned char *)text; *p; ++p) {
        if (FT_Load_Char(font->face, *p, FT_LOAD_RENDER)) continue;
        FT_GlyphSlot sl = font->face->glyph;
        for (unsigned row = 0; row < sl->bitmap.rows; ++row) {
            const int dy = baseline - sl->bitmap_top + (int)row;
            if ((unsigned)dy >= (unsigned)dst->h) continue;
            for (unsigned col = 0; col < sl->bitmap.width; ++col) {
                const int dx = pen + sl->bitmap_left + (int)col;
                if ((unsigned)dx >= (unsigned)dst->w) continue;
                const uint8_t a = sl->bitmap.buffer[row * sl->bitmap.pitch + col];
                if (!a) continue;
                uint8_t *d = &dst->rgba[((size_t)dy * (size_t)dst->w + (size_t)dx) * 4u];
                d[0] = (uint8_t)((r * a + d[0] * (255 - a)) / 255);
                d[1] = (uint8_t)((g * a + d[1] * (255 - a)) / 255);
                d[2] = (uint8_t)((b * a + d[2] * (255 - a)) / 255);
                d[3] = 255;
            }
        }
        pen += (int)(sl->advance.x >> 6);
    }
}

void ChromaKeyYellow(RgbaImage *img)
{
    for (size_t i = 0; i + 3 < img->rgba.size(); i += 4) {
        const int r = img->rgba[i], g = img->rgba[i + 1], b = img->rgba[i + 2];
        const int maxc = r > g ? (r > b ? r : b) : (g > b ? g : b);
        const int minc = r < g ? (r < b ? r : b) : (g < b ? g : b);
        const bool yellow = r > 160 && g > 110 && b < 90 && (r + g) > 2 * b + 80;
        const bool gray = (maxc - minc) < 18 && maxc > 70 && maxc < 210;
        if (yellow || gray) img->rgba[i + 3] = 0;
    }
}

void CoverBlit(RgbaImage *dst, const RgbaImage &src)
{
    if (src.w <= 0 || dst->w <= 0) return;
    /* scale to cover, center-crop */
    const int dw = dst->w, dh = dst->h;
    int sw = dw, sh = src.h * dw / src.w;
    if (sh < dh) {
        sh = dh;
        sw = src.w * dh / src.h;
    }
    Blit(dst, src, (dw - sw) / 2, (dh - sh) / 2, sw, sh);
}

void CollectWorlds(CRezDir *dir, const std::string &prefix, std::vector<std::string> *out)
{
    if (!dir || out->size() > 200) return;
    for (CRezTyp *typ = dir->GetFirstType(); typ; typ = dir->GetNextType(typ)) {
        char ext[8] = {};
        dir->GetParentMgr()->TypeToStr(typ->GetType(), ext);
        if (strcasecmp(ext, "DAT") != 0 && strcasecmp(ext, "dat") != 0) continue;
        for (CRezItm *it = dir->GetFirstItem(typ); it; it = dir->GetNextItem(it)) {
            std::string path = prefix;
            if (!path.empty()) path += '\\';
            path += it->GetName() ? it->GetName() : "?";
            out->push_back(path);
        }
    }
    for (CRezDir *sub = dir->GetFirstSubDir(); sub; sub = dir->GetNextSubDir(sub)) {
        std::string next = prefix;
        if (!next.empty()) next += '\\';
        next += sub->GetDirName() ? sub->GetDirName() : "?";
        CollectWorlds(sub, next, out);
    }
}

struct Menu {
    std::vector<std::string> items;
    std::vector<bool> enabled;
    int sel = 0;
};

void DrawMenu(RgbaImage *fb, Font *font, const Menu &m, int x, int y)
{
    for (size_t i = 0; i < m.items.size(); ++i) {
        const bool on = (int)i == m.sel;
        const bool en = i < m.enabled.size() ? m.enabled[i] : true;
        uint8_t r, g, b;
        if (!en) {
            r = 150;
            g = 120;
            b = 60;
        } else if (on) {
            r = 40;
            g = 24;
            b = 8;
        } else {
            r = 92;
            g = 56;
            b = 16;
        }
        char line[256];
        snprintf(line, sizeof(line), "%s%s", on ? "> " : "  ", m.items[i].c_str());
        DrawText(fb, font, 28, x, y + (int)i * 40, line, r, g, b);
    }
}

void Fill(RgbaImage *img, uint8_t r, uint8_t g, uint8_t b)
{
    img->rgba.assign((size_t)img->w * (size_t)img->h * 4u, 0);
    for (size_t i = 0; i < img->rgba.size(); i += 4) {
        img->rgba[i + 0] = r;
        img->rgba[i + 1] = g;
        img->rgba[i + 2] = b;
        img->rgba[i + 3] = 255;
    }
}

}  // namespace

int main(int argc, char **argv)
{
    const char *data = getenv("NOLF2_DATA");
    if (argc > 1) data = argv[1];
    if (!data || !data[0]) data = kDefaultData;

    char game[1024], game2[1024], engine[1024];
    snprintf(game, sizeof(game), "%s/GAME.REZ", data);
    snprintf(game2, sizeof(game2), "%s/GAME2.REZ", data);
    snprintf(engine, sizeof(engine), "%s/Engine.REZ", data);

    fprintf(stderr, "NOLF2 boot  data=%s\n", data);
    CRezMgr mgr;
    mgr.SetLowerCaseUsed(FALSE);
    if (!mgr.Open(game, TRUE, FALSE)) {
        fprintf(stderr, "CRezMgr::Open failed: %s\n", game);
        return 1;
    }
    mgr.OpenAdditional(game2, FALSE);
    mgr.OpenAdditional(engine, FALSE);

    RgbaImage splash, backdrop, logo;
    for (const char *p : kSplashPaths) {
        if (LoadImagePath(&mgr, p, &splash)) break;
    }
    LoadImagePath(&mgr, "INTERFACE\\MENU\\SPRTEX\\CATEMENUBKGRND.DTX", &backdrop);
    LoadImagePath(&mgr, "INTERFACE\\MENU\\SPRTEX\\ASIHW.DTX", &logo);
    if (logo.w) ChromaKeyYellow(&logo);

    if (getenv("NOLF2_DUMP_ART")) {
        RgbaImage extra;
        LoadImagePath(&mgr, "INTERFACE\\MENU\\SPRTEX\\CATEMENUBKGRND.DTX", &extra);
        LoadImagePath(&mgr, "INTERFACE\\MENU\\SPRTEX\\CATEPIC.DTX", &extra);
        LoadImagePath(&mgr, "INTERFACE\\MENU\\SKINS\\MAININTROALL.DTX", &extra);
        LoadImagePath(&mgr, "INTERFACE\\MENU\\SKINS\\MAINBACK.DTX", &extra);
        fprintf(stderr, "art dump done\n");
        mgr.Close(FALSE);
        return 0;
    }

    Font font;
    if (!LoadFont(&mgr, &font)) fprintf(stderr, "no menu font — text will be missing\n");

    std::vector<std::string> worlds;
    if (CRezDir *wd = mgr.GetDirFromPath("WORLDS")) CollectWorlds(wd, "WORLDS", &worlds);
    std::sort(worlds.begin(), worlds.end());
    fprintf(stderr, "worlds listed: %zu\n", worlds.size());

    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_EVENTS) != 0) {
        fprintf(stderr, "SDL_Init: %s\n", SDL_GetError());
        return 1;
    }
    SDL_Window *win = SDL_CreateWindow("No One Lives Forever 2",
        SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, kWinW, kWinH, SDL_WINDOW_SHOWN | SDL_WINDOW_RESIZABLE);
    SDL_Renderer *ren = SDL_CreateRenderer(win, -1, SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC);
    if (!ren) ren = SDL_CreateRenderer(win, -1, 0);
    if (!win || !ren) {
        fprintf(stderr, "SDL window failed: %s\n", SDL_GetError());
        return 1;
    }
    SDL_Texture *tex = SDL_CreateTexture(ren, SDL_PIXELFORMAT_ABGR8888, SDL_TEXTUREACCESS_STREAMING, kWinW, kWinH);

    Menu mainM;
    mainM.items = {"Single player", "Continue game", "Multiplayer (Internet)", "Multiplayer (LAN)", "Options", "Profile", "Quit"};
    mainM.enabled = {true, false, true, true, true, true, true};
    Menu singleM;
    singleM.items = {"New game", "Load game", "Custom level", "Back"};
    singleM.enabled = {true, false, true, true};
    Menu optM;
    optM.items = {"Display", "Sound", "Keyboard", "Mouse", "Back"};
    optM.enabled = {true, true, true, true, true};
    Menu worldM;
    for (size_t i = 0; i < worlds.size() && i < 18; ++i) worldM.items.push_back(worlds[i]);
    worldM.items.push_back("Back");
    worldM.enabled.assign(worldM.items.size(), true);

    Screen screen = splash.w ? kSplash : kMain;
    std::string notice;
    int worldPage = 0;
    const int worldPageSize = 16;
    Uint32 splashAt = SDL_GetTicks();
    bool running = true;

    auto composeWorldPage = [&]() {
        worldM.items.clear();
        worldM.enabled.clear();
        const int begin = worldPage * worldPageSize;
        const int end = std::min(begin + worldPageSize, (int)worlds.size());
        for (int i = begin; i < end; ++i) worldM.items.push_back(worlds[(size_t)i]);
        if (end < (int)worlds.size()) worldM.items.push_back("More worlds...");
        worldM.items.push_back("Back");
        worldM.enabled.assign(worldM.items.size(), true);
        worldM.sel = 0;
    };

    while (running) {
        SDL_Event e;
        while (SDL_PollEvent(&e)) {
            if (e.type == SDL_QUIT) running = false;
            if (e.type != SDL_KEYDOWN && e.type != SDL_MOUSEBUTTONDOWN) continue;

            if (screen == kSplash) {
                screen = kMain;
                continue;
            }
            if (e.type == SDL_MOUSEBUTTONDOWN) continue;

            const SDL_Keycode key = e.key.keysym.sym;
            Menu *cur = NULL;
            if (screen == kMain) cur = &mainM;
            else if (screen == kSingle) cur = &singleM;
            else if (screen == kOptions) cur = &optM;
            else if (screen == kWorlds) cur = &worldM;

            if (screen == kNotice) {
                if (key == SDLK_ESCAPE || key == SDLK_RETURN || key == SDLK_SPACE) screen = kMain;
                continue;
            }
            if (!cur) continue;
            if (key == SDLK_ESCAPE) {
                if (screen == kMain) running = false;
                else if (screen == kWorlds) screen = kSingle;
                else screen = kMain;
                continue;
            }
            if (key == SDLK_UP || key == SDLK_w) {
                do {
                    cur->sel = (cur->sel + (int)cur->items.size() - 1) % (int)cur->items.size();
                } while (!cur->enabled[(size_t)cur->sel]);
            } else if (key == SDLK_DOWN || key == SDLK_s) {
                do {
                    cur->sel = (cur->sel + 1) % (int)cur->items.size();
                } while (!cur->enabled[(size_t)cur->sel]);
            } else if (key == SDLK_RETURN || key == SDLK_SPACE) {
                const std::string &pick = cur->items[(size_t)cur->sel];
                if (screen == kMain) {
                    if (pick == "Single player") screen = kSingle;
                    else if (pick == "Options") screen = kOptions;
                    else if (pick == "Quit") running = false;
                    else if (pick == "Multiplayer (Internet)" || pick == "Multiplayer (LAN)" || pick == "Profile") {
                        notice = pick + " — CShell / WON not linked yet. Frontend only.";
                        screen = kNotice;
                    }
                } else if (screen == kSingle) {
                    if (pick == "Back") screen = kMain;
                    else if (pick == "New game" || pick == "Custom level") {
                        worldPage = 0;
                        composeWorldPage();
                        screen = kWorlds;
                    } else {
                        notice = pick + " — no save folder wired yet.";
                        screen = kNotice;
                    }
                } else if (screen == kOptions) {
                    if (pick == "Back") screen = kMain;
                    else {
                        notice = pick + " — CShell options screens not linked yet.";
                        screen = kNotice;
                    }
                } else if (screen == kWorlds) {
                    if (pick == "Back") screen = kSingle;
                    else if (pick == "More worlds...") {
                        ++worldPage;
                        composeWorldPage();
                    } else {
                        notice = "World " + pick +
                                 " — ClientMgr/CShell is not bound yet, so the .dat cannot start.";
                        screen = kNotice;
                    }
                }
            }
        }

        if (screen == kSplash && SDL_GetTicks() - splashAt > 7000) screen = kMain;

        RgbaImage fb;
        fb.w = kWinW;
        fb.h = kWinH;
        Fill(&fb, 18, 10, 6);

        if (screen == kSplash && splash.w) {
            Blit(&fb, splash, 0, 0, kWinW, kWinH);
            DrawText(&fb, &font, 18, 28, kWinH - 40, "Click or Enter — continue", 40, 28, 16);
        } else {
            if (backdrop.w) CoverBlit(&fb, backdrop);
            if (logo.w) {
                const int lw = 460;
                const int lh = logo.h * lw / logo.w;
                Blit(&fb, logo, 36, 18, lw, lh);
            }

            if (screen == kMain) DrawMenu(&fb, &font, mainM, 56, 250);
            else if (screen == kSingle) {
                DrawText(&fb, &font, 22, 56, 210, "Single player", 80, 48, 16);
                DrawMenu(&fb, &font, singleM, 56, 250);
            } else if (screen == kOptions) {
                DrawText(&fb, &font, 22, 56, 210, "Options", 80, 48, 16);
                DrawMenu(&fb, &font, optM, 56, 250);
            } else if (screen == kWorlds) {
                DrawText(&fb, &font, 20, 56, 200, "WORLDS", 80, 48, 16);
                DrawMenu(&fb, &font, worldM, 56, 230);
            } else if (screen == kNotice) {
                DrawText(&fb, &font, 20, 56, 280, notice.c_str(), 80, 48, 16);
                DrawText(&fb, &font, 16, 56, 360, "Enter / Esc — back", 90, 60, 24);
            }
            DrawText(&fb, &font, 13, 40, kWinH - 28, "Up/Down   Enter   Esc", 90, 60, 24);
        }

        SDL_UpdateTexture(tex, NULL, fb.rgba.data(), kWinW * 4);
        SDL_SetRenderDrawColor(ren, 0, 0, 0, 255);
        SDL_RenderClear(ren);
        SDL_RenderCopy(ren, tex, NULL, NULL);
        SDL_RenderPresent(ren);
        SDL_Delay(16);
    }

    SDL_DestroyTexture(tex);
    SDL_DestroyRenderer(ren);
    SDL_DestroyWindow(win);
    SDL_Quit();
    if (font.face) FT_Done_Face(font.face);
    if (font.lib) FT_Done_FreeType(font.lib);
    mgr.Close(FALSE);
    return 0;
}
