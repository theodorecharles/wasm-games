#include "stdafx.h"
#include "CRC32.h"
#include "rez_probe.h"

extern "C" uint32_t nolf2_crc32(const uint8_t *data, std::size_t size) {
  if (!data || size == 0) {
    return 0;
  }
  return CRC32::CalcDataCRC(data, static_cast<uint32>(size));
}
