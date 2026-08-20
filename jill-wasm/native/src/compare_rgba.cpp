#include "jill/rgba.hpp"

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <string>
#include <vector>

namespace fs = std::filesystem;

struct Mismatch {
    std::string rel;
    std::string detail;
};

static std::string rel_path(const fs::path& root, const fs::path& p) {
    return fs::relative(p, root).generic_string();
}

static bool compare_file(const fs::path& a, const fs::path& b, std::string* detail) {
    if (!fs::exists(b)) {
        *detail = "missing in native: " + b.string();
        return false;
    }
    const jill::Image ja = jill::read_rgba(a.string());
    const jill::Image na = jill::read_rgba(b.string());
    if (ja.w != na.w || ja.h != na.h) {
        char buf[128];
        std::snprintf(buf, sizeof(buf), "size java %dx%d vs native %dx%d", ja.w, ja.h, na.w, na.h);
        *detail = buf;
        return false;
    }
    int diffs = 0;
    int first_x = -1, first_y = -1;
    jill::Argb first_j = 0, first_n = 0;
    for (int y = 0; y < ja.h; ++y) {
        for (int x = 0; x < ja.w; ++x) {
            const jill::Argb jp = ja.get(x, y);
            const jill::Argb np = na.get(x, y);
            if (jp != np) {
                if (diffs == 0) {
                    first_x = x;
                    first_y = y;
                    first_j = jp;
                    first_n = np;
                }
                ++diffs;
            }
        }
    }
    if (diffs == 0) return true;
    char buf[256];
    std::snprintf(buf, sizeof(buf),
                  "%d pixels differ; first (%d,%d) java=%08X native=%08X",
                  diffs, first_x, first_y, first_j, first_n);
    *detail = buf;
    return false;
}

int main(int argc, char** argv) {
    const std::string java_dir = argc > 1 ? argv[1] : "goldens/java";
    const std::string native_dir = argc > 2 ? argv[2] : "goldens/native";

    if (!fs::exists(java_dir)) {
        std::fprintf(stderr, "java goldens missing: %s\n", java_dir.c_str());
        return 2;
    }

    std::vector<Mismatch> bad;
    int compared = 0;
    for (const auto& ent : fs::recursive_directory_iterator(java_dir)) {
        if (!ent.is_regular_file()) continue;
        if (ent.path().extension() != ".rgba") continue;
        const std::string rel = rel_path(java_dir, ent.path());
        std::string detail;
        ++compared;
        if (!compare_file(ent.path(), fs::path(native_dir) / rel, &detail)) {
            bad.push_back({rel, detail});
        }
    }

    std::printf("compared %d rgba files\n", compared);
    if (bad.empty()) {
        std::printf("PIXEL MATCH: all files identical (ARGB bytes)\n");
        return 0;
    }
    std::printf("PIXEL MISMATCH: %d file(s)\n", static_cast<int>(bad.size()));
    const int show = std::min(static_cast<int>(bad.size()), 40);
    for (int i = 0; i < show; ++i) {
        std::printf("  %s: %s\n", bad[static_cast<size_t>(i)].rel.c_str(),
                    bad[static_cast<size_t>(i)].detail.c_str());
    }
    return 1;
}
