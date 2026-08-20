#include "jill/bytes.hpp"

#include <fstream>

namespace jill {

ByteReader ByteReader::load_file(const std::string& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) throw std::runtime_error("cannot open " + path);
    in.seekg(0, std::ios::end);
    const auto n = in.tellg();
    in.seekg(0, std::ios::beg);
    std::vector<uint8_t> buf(static_cast<size_t>(n));
    if (n > 0 && !in.read(reinterpret_cast<char*>(buf.data()), n)) {
        throw std::runtime_error("short read " + path);
    }
    return ByteReader(std::move(buf));
}

}  // namespace jill
