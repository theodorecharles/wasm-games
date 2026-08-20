#ifndef __LITHTYPES_H__
#define __LITHTYPES_H__

#include "lithtech_compat.h"

#ifndef UINT8
typedef unsigned char UINT8;
#endif
#ifndef INT8
typedef signed char INT8;
#endif
#ifndef UINT16
typedef unsigned short int UINT16;
#endif
#ifndef INT16
typedef signed short int INT16;
#endif
#ifndef INT32
typedef int INT32;
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

#ifndef NULL
#define NULL 0
#endif

#ifndef ASSERT
#include <assert.h>
#define ASSERT(exp) assert(exp)
#endif

#endif
