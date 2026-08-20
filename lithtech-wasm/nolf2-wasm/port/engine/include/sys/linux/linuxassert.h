#ifndef PORT_ENGINE_LINUXASSERT_H
#define PORT_ENGINE_LINUXASSERT_H

#include <assert.h>

#ifndef ASSERT
#define ASSERT assert
#endif

#ifndef _assert
#define _assert(msg, file, line) assert(0 && (msg))
#endif

#endif
