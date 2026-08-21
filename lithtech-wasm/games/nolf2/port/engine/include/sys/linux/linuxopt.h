#ifndef PORT_ENGINE_LINUXOPT_H
#define PORT_ENGINE_LINUXOPT_H

#include <math.h>
#include <string.h>

#ifndef ltsqrtf
#define ltsqrtf(f) ((float)sqrt((double)(f)))
#endif
#ifndef ltabsf
#define ltabsf(f) ((float)fabs((double)(f)))
#endif
#ifndef ltsinf
#define ltsinf(f) ((float)sin((double)(f)))
#endif
#ifndef ltcosf
#define ltcosf(f) ((float)cos((double)(f)))
#endif

#endif
