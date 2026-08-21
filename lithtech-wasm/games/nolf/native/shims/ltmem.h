#ifndef __LTMEM_H__
#define __LTMEM_H__

#ifndef __LTBASEDEFS_H__
#include "ltbasedefs.h"
#endif

enum {
  LT_MEM_TYPE_UNKNOWN = 0,
  LT_MEM_TYPE_MISC
};

#ifndef LT_MEM_TRACK_ALLOC
#define LT_MEM_TRACK_ALLOC(ltStatement, ltAllocType) ltStatement
#define LT_MEM_TRACK_FREE(ltStatement) ltStatement
#define LT_MEM_TRACK_REALLOC(ltStatement, ltAllocType) ltStatement
#endif

inline void LTMemInit() {}
inline void LTMemTerm() {}

#endif
