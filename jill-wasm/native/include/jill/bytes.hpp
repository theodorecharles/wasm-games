#pragma once

#include <cstdint>
#include <stdexcept>
#include <string>
#include <vector>

namespace jill {

class ByteReader {
public:
    explicit ByteReader(std::vector<uint8_t> data) : data_(std::move(data)) {}

    static ByteReader load_file(const std::string& path);

    size_t size() const { return data_.size(); }
    size_t tell() const { return pos_; }
    bool eof() const { return pos_ >= data_.size(); }

    void seek(size_t p) {
        pos_ = p > data_.size() ? data_.size() : p;
    }

    uint8_t read_u8() {
        if (pos_ >= data_.size()) throw std::runtime_error("unexpected EOF (u8)");
        return data_[pos_++];
    }

    uint16_t read_u16le() {
        const uint16_t lo = read_u8();
        const uint16_t hi = read_u8();
        return static_cast<uint16_t>(lo | (hi << 8));
    }

    int16_t read_i16le() { return static_cast<int16_t>(read_u16le()); }

    uint32_t read_u32le() {
        const uint32_t a = read_u8();
        const uint32_t b = read_u8();
        const uint32_t c = read_u8();
        const uint32_t d = read_u8();
        return a | (b << 8) | (c << 16) | (d << 24);
    }

    const uint8_t* data() const { return data_.data(); }

private:
    std::vector<uint8_t> data_;
    size_t pos_ = 0;
};

}  // namespace jill
