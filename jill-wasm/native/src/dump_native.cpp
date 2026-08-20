#include "jill/jn.hpp"
#include "jill/render.hpp"

#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <string>

namespace fs = std::filesystem;

static std::string pad3(int n) {
    char b[8];
    std::snprintf(b, sizeof(b), "%03d", n);
    return b;
}

int main(int argc, char** argv) {
    const std::string game = argc > 1 ? argv[1] : ".";
    const std::string out_dir = argc > 2 ? argv[2] : "goldens/native";
    const std::string pal = argc > 3 ? argv[3] : "native/data/jill_color_map.properties";

    fs::create_directories(out_dir + "/tiles");
    fs::create_directories(out_dir + "/maps");

    const auto assets = jill::Assets::load(game, pal);

    int tiles = 0;
    for (const auto& ts : assets.sha.tilesets) {
        for (const auto& tile : ts.tiles) {
            const jill::Image img = tile.decode_vga(assets.palette);
            const std::string stem = "ts" + pad3(ts.header_index) + "_tile" + pad3(tile.tile_index);
            jill::write_rgba(out_dir + "/tiles/" + stem + ".rgba", img);
            ++tiles;
        }
    }

    const char* maps[] = {"1.JN1", "INTRO.JN1", "MAP.JN1", nullptr};
    int maps_n = 0;
    for (int i = 0; maps[i]; ++i) {
        const std::string path = game + "/" + maps[i];
        if (!fs::exists(path)) continue;
        const jill::JnFile jn = jill::JnFile::load(path);
        const jill::Image bg = jill::render_background(assets, jn);
        std::string name = maps[i];
        for (char& c : name) {
            if (c == '.') c = '_';
        }
        jill::write_rgba(out_dir + "/maps/" + name + "_bg.rgba", bg);
        jill::write_ppm(out_dir + "/maps/" + name + "_bg.ppm", bg);
        ++maps_n;
    }

    std::printf("native dump: %d tiles, %d maps -> %s\n", tiles, maps_n, out_dir.c_str());
    return 0;
}
