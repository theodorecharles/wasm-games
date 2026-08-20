#include "lithtech_compat.h"

#include <cstdlib>

void *DefStdlithAlloc(uint32 size) {
  if (size == 0) {
    return nullptr;
  }
  return std::malloc(size);
}

void DefStdlithFree(void *ptr) { std::free(ptr); }
