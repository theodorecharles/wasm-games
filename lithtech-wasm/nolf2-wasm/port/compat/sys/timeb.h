#ifndef PORT_SYS_TIMEB_H
#define PORT_SYS_TIMEB_H

#include_next <sys/timeb.h>

#ifndef _timeb
#define _timeb timeb
#endif
#ifndef _ftime
#define _ftime ftime
#endif

#endif
