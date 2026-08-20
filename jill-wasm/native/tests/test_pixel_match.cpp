#include "jill/jn.hpp"
#include "jill/render.hpp"
#include "jill/rgba.hpp"

#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <string>

namespace fs = std::filesystem;

#ifndef JILL_GAME_DIR
#define JILL_GAME_DIR "."
#endif
#ifndef JILL_PALETTE
#define JILL_PALETTE "native/data/jill_color_map.properties"
#endif
#ifndef JILL_JAVA_GOLDENS
#define JILL_JAVA_GOLDENS "goldens/java"
#endif

static int fail(const char* msg) {
    std::fprintf(stderr, "FAIL: %s\n", msg);
    return 1;
}

static bool same_image(const jill::Image& a, const jill::Image& b, const std::string& name) {
    if (a.w != b.w || a.h != b.h) {
        std::fprintf(stderr, "FAIL %s: size %dx%d vs %dx%d\n", name.c_str(), a.w, a.h, b.w, b.h);
        return false;
    }
    for (int y = 0; y < a.h; ++y) {
        for (int x = 0; x < a.w; ++x) {
            const jill::Argb ja = a.get(x, y);
            const jill::Argb na = b.get(x, y);
            if (ja != na) {
                std::fprintf(stderr, "FAIL %s: pixel (%d,%d) java=%08X native=%08X\n",
                             name.c_str(), x, y, ja, na);
                return false;
            }
        }
    }
    return true;
}

static bool parse_tile_stem(const std::string& stem, int* ts, int* tile) {
    // tsXXX_tileYYY
    if (stem.size() < 12) return false;
    if (stem.compare(0, 2, "ts") != 0) return false;
    const auto pos = stem.find("_tile");
    if (pos == std::string::npos) return false;
    *ts = std::atoi(stem.c_str() + 2);
    *tile = std::atoi(stem.c_str() + pos + 5);
    return true;
}

int main() {
    const fs::path game(JILL_GAME_DIR);
    const fs::path pal(JILL_PALETTE);
    const fs::path java_root(JILL_JAVA_GOLDENS);

    if (!fs::exists(java_root / "tiles")) {
        return fail("java golden tiles missing — run DumpGoldens first");
    }

    const jill::Assets assets = jill::Assets::load(game.string(), pal.string());

    int tiles = 0;
    for (const auto& ent : fs::directory_iterator(java_root / "tiles")) {
        if (!ent.is_regular_file() || ent.path().extension() != ".rgba") continue;
        int ts = -1, tile = -1;
        if (!parse_tile_stem(ent.path().stem().string(), &ts, &tile)) {
            std::fprintf(stderr, "FAIL: bad tile name %s\n", ent.path().c_str());
            return 1;
        }
        const jill::Image oracle = jill::read_rgba(ent.path().string());
        const jill::Image got = assets.tile_vga(ts, tile);
        if (!same_image(oracle, got, ent.path().filename().string())) return 1;
        ++tiles;
    }
    if (tiles <= 0) return fail("no java tile goldens compared");

    struct MapCase {
        const char* jn;
        const char* rgba;
    };
    const MapCase maps[] = {
        {"1.JN1", "1_JN1_bg.rgba"},
        {"INTRO.JN1", "INTRO_JN1_bg.rgba"},
        {"MAP.JN1", "MAP_JN1_bg.rgba"},
    };
    int maps_n = 0;
    for (const auto& m : maps) {
        const fs::path gold = java_root / "maps" / m.rgba;
        if (!fs::exists(gold)) {
            std::fprintf(stderr, "FAIL: missing map golden %s\n", gold.c_str());
            return 1;
        }
        const jill::JnFile jn = jill::JnFile::load((game / m.jn).string());
        const jill::Image got = jill::render_background(assets, jn);
        const jill::Image oracle = jill::read_rgba(gold.string());
        if (!same_image(oracle, got, m.rgba)) return 1;
        ++maps_n;
    }
    if (maps_n != 3) return fail("expected 3 map goldens");

    std::printf("test_pixel_match: %d tiles + %d maps match OpenJill ARGB oracles\n", tiles, maps_n);
    return 0;
}
