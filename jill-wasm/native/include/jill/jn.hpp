#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace jill {

constexpr int kMapWidth = 128;
constexpr int kMapHeight = 64;
constexpr int kMapCodeMask = 0x0FFF;  // OpenJill, not wiki 0x3FFF

struct JnObject {
    int type = 0;
    int x = 0;
    int y = 0;
    int x_speed = 0;
    int y_speed = 0;
    int width = 0;
    int height = 0;
    int state = 0;
    int sub_state = 0;
    int state_count = 0;
    int counter = 0;
    int flags = 0;
    uint32_t pointer = 0;
    int info1 = 0;
    int zap_hold = 0;
    std::string stack_string;
};

struct JnSave {
    int16_t level = 0;
    int16_t health = 0;
    int16_t inventory_length = 0;
    int16_t inventory[16]{};
    uint32_t score = 0;
};

struct JnFile {
    int map_code[kMapWidth][kMapHeight]{};
    std::vector<JnObject> objects;
    JnSave save;
    std::vector<std::string> strings;

    static JnFile load(const std::string& path);
    int code(int x, int y) const { return map_code[x][y]; }
};

}  // namespace jill
