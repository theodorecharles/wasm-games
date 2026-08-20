#pragma once

#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

namespace jill {

struct DmaEntry {
    int map_code = 0;
    int tile = 0;
    int tileset = 0;  // raw & 0x3F
    int flags = 0;
    std::string name;
    int index = 0;
};

struct DmaFile {
    std::vector<DmaEntry> entries;
    std::unordered_map<int, DmaEntry> by_code;
    std::unordered_map<std::string, DmaEntry> by_name;

    static DmaFile load(const std::string& path);
    const DmaEntry* find(int map_code) const;
};

}  // namespace jill
