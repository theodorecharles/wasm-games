#pragma once

// Host-side LithTech type widths. Official lithtypes.h typedefs DWORD as
// unsigned long (64-bit on LP64), which breaks packed REZ headers.
// Define the names as macros so later #ifndef DWORD skips those typedefs.

#include <cassert>
#include <cctype>
#include <cstdint>
#include <cstring>
#include <strings.h>

#ifndef BYTE
typedef std::uint8_t BYTE;
#define BYTE BYTE
#endif

#ifndef WORD
typedef std::uint16_t WORD;
#define WORD WORD
#endif

#ifndef DWORD
typedef std::uint32_t DWORD;
#define DWORD DWORD
#endif

#ifndef BOOL
typedef int BOOL;
#endif
#ifndef TRUE
#define TRUE 1
#endif
#ifndef FALSE
#define FALSE 0
#endif

#ifndef UINT8
typedef std::uint8_t UINT8;
#endif
#ifndef UINT16
typedef std::uint16_t UINT16;
#endif
#ifndef UINT32
typedef std::uint32_t UINT32;
#define UINT32 UINT32
#endif
#ifndef INT8
typedef std::int8_t INT8;
#endif
#ifndef INT16
typedef std::int16_t INT16;
#endif
#ifndef INT32
typedef std::int32_t INT32;
#endif

typedef std::uint8_t uint8;
typedef std::uint16_t uint16;
typedef std::uint32_t uint32;
typedef std::uint64_t uint64;
typedef std::int8_t int8;
typedef std::int16_t int16;
typedef std::int32_t int32;
typedef std::int64_t int64;

#ifndef ASSERT
#define ASSERT(x) assert(x)
#endif

#ifndef LTNULL
#define LTNULL 0
#endif

#ifndef MODULE_EXPORT
#define MODULE_EXPORT
#endif
#ifndef MODULE_IMPORT
#define MODULE_IMPORT
#endif

inline void LTStrCpy(char *pDest, const char *pSrc, uint32 nBufferChars) {
  if (!pDest || nBufferChars == 0) {
    return;
  }
  if (!pSrc) {
    pSrc = "";
  }
  std::strncpy(pDest, pSrc, nBufferChars - 1);
  pDest[nBufferChars - 1] = '\0';
}

inline int stricmp(const char *a, const char *b) {
  return strcasecmp(a ? a : "", b ? b : "");
}

inline int strnicmp(const char *a, const char *b, std::size_t n) {
  return strncasecmp(a ? a : "", b ? b : "", n);
}

inline char *strupr(char *s) {
  if (!s) {
    return s;
  }
  for (char *p = s; *p; ++p) {
    *p = static_cast<char>(std::toupper(static_cast<unsigned char>(*p)));
  }
  return s;
}

inline int notSupportedLinux() {
  ASSERT(false && "Not supported on Linux");
  return 0;
}
