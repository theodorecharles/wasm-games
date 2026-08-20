#include "rez_probe.h"

#include <cstdio>
#include <fstream>
#include <iostream>
#include <vector>

int main(int argc, char **argv) {
  if (argc < 2) {
    std::cerr << "usage: nolf2_probe_cli <file.rez>\n";
    return 2;
  }
  std::ifstream in(argv[1], std::ios::binary);
  if (!in) {
    std::cerr << "cannot open " << argv[1] << "\n";
    return 1;
  }
  std::vector<uint8_t> header(256);
  in.read(reinterpret_cast<char *>(header.data()), static_cast<std::streamsize>(header.size()));
  const auto got = static_cast<std::size_t>(in.gcount());
  header.resize(got);
  const int ok = nolf2_rez_header_ok(header.data(), header.size());
  const uint32_t crc = nolf2_crc32(header.data(), header.size());
  std::printf("%s header=%s crc32=0x%08x bytes=%zu\n",
              argv[1], ok ? "ok" : "bad", crc, header.size());
  return ok ? 0 : 1;
}
