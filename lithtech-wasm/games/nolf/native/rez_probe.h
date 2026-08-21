#pragma once

#include <cstddef>
#include <cstdint>

#ifdef __cplusplus
extern "C" {
#endif

int nolf_rez_header_ok(const uint8_t *data, std::size_t size);
uint32_t nolf_crc32(const uint8_t *data, std::size_t size);

#ifdef __cplusplus
}
#endif
