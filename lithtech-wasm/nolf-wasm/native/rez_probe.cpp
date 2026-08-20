#include "rez_probe.h"

#include <algorithm>
#include <cstring>

namespace {

constexpr char kCopyright[] = "RezMgr Version 1 Copyright (C) 1995 MONOLITH INC.";
constexpr std::size_t kMinHeader = 131;
constexpr std::size_t kVersionOffset = 0x7f;

}  // namespace

extern "C" int nolf_rez_header_ok(const uint8_t *data, std::size_t size) {
  if (!data || size < kMinHeader) {
    return 0;
  }
  const size_t prefix = size < 80 ? size : 80;
  const uint8_t *found = std::search(
      data, data + prefix,
      reinterpret_cast<const uint8_t *>(kCopyright),
      reinterpret_cast<const uint8_t *>(kCopyright) + sizeof(kCopyright) - 1);
  if (found == data + prefix) {
    return 0;
  }
  const uint32_t version = uint32_t(data[kVersionOffset]) |
      (uint32_t(data[kVersionOffset + 1]) << 8) |
      (uint32_t(data[kVersionOffset + 2]) << 16) |
      (uint32_t(data[kVersionOffset + 3]) << 24);
  return version == 1 ? 1 : 0;
}
