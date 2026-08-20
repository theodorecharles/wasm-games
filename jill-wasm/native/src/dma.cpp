#include "jill/dma.hpp"

#include "jill/bytes.hpp"

namespace jill {

DmaFile DmaFile::load(const std::string& path) {
    ByteReader r = ByteReader::load_file(path);
    DmaFile dma;
    int count = 0;
    while (!r.eof()) {
        if (r.tell() + 7 > r.size()) break;
        DmaEntry e;
        e.map_code = r.read_u16le();
        e.tile = r.read_u8();
        e.tileset = r.read_u8() & 0x3F;
        e.flags = r.read_u16le();
        const int nlen = r.read_u8();
        e.name.reserve(static_cast<size_t>(nlen));
        for (int i = 0; i < nlen; ++i) {
            if (r.eof()) break;
            e.name.push_back(static_cast<char>(r.read_u8()));
        }
        e.index = count++;
        dma.by_code[e.map_code] = e;
        dma.by_name[e.name] = e;
        dma.entries.push_back(std::move(e));
    }
    return dma;
}

const DmaEntry* DmaFile::find(int map_code) const {
    const auto it = by_code.find(map_code);
    if (it == by_code.end()) return nullptr;
    return &it->second;
}

}  // namespace jill
