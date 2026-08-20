#include "jill/jn.hpp"

#include "jill/bytes.hpp"

namespace jill {

JnFile JnFile::load(const std::string& path) {
    ByteReader r = ByteReader::load_file(path);
    JnFile jn;
    for (int x = 0; x < kMapWidth; ++x) {
        for (int y = 0; y < kMapHeight; ++y) {
            jn.map_code[x][y] = r.read_u16le() & kMapCodeMask;
        }
    }

    const int nobj = r.read_u16le();
    jn.objects.reserve(static_cast<size_t>(nobj));
    for (int i = 0; i < nobj; ++i) {
        JnObject o;
        o.type = r.read_u8();
        o.x = r.read_u16le();
        o.y = r.read_u16le();
        o.x_speed = r.read_i16le();
        o.y_speed = r.read_i16le();
        o.width = r.read_u16le();
        o.height = r.read_u16le();
        o.state = r.read_i16le();
        o.sub_state = r.read_u16le();
        o.state_count = r.read_u16le();
        o.counter = r.read_i16le();
        o.flags = r.read_u16le();
        o.pointer = r.read_u32le();
        o.info1 = r.read_i16le();
        o.zap_hold = r.read_u16le();
        jn.objects.push_back(o);
    }

    // 70-byte Jill save block
    if (r.tell() + 70 <= r.size()) {
        jn.save.level = r.read_i16le();
        jn.save.health = r.read_i16le();
        jn.save.inventory_length = r.read_i16le();
        for (int i = 0; i < 16; ++i) jn.save.inventory[i] = r.read_i16le();
        jn.save.score = r.read_u32le();
        for (int i = 0; i < 28; ++i) (void)r.read_u8();
    }

    // String stack: UINT16 length + bytes + NUL, assigned to objects with pointer != 0
    size_t obj_i = 0;
    auto next_ptr_obj = [&]() -> JnObject* {
        while (obj_i < jn.objects.size()) {
            if (jn.objects[obj_i].pointer != 0) return &jn.objects[obj_i++];
            ++obj_i;
        }
        return nullptr;
    };

    while (r.tell() + 2 <= r.size()) {
        const int len = r.read_u16le();
        std::string s;
        s.reserve(static_cast<size_t>(len));
        for (int i = 0; i < len && !r.eof(); ++i) s.push_back(static_cast<char>(r.read_u8()));
        if (!r.eof()) (void)r.read_u8();  // trailing NUL
        jn.strings.push_back(s);
        if (JnObject* o = next_ptr_obj()) o->stack_string = s;
    }
    return jn;
}

}  // namespace jill
