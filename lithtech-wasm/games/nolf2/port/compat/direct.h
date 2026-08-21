#ifndef PORT_DIRECT_H
#define PORT_DIRECT_H

#include <unistd.h>
#include <sys/stat.h>
#include <errno.h>
#include <limits.h>

#ifdef __cplusplus
extern "C" {
#endif

static inline char *_getcwd(char *buf, int size)
{
	return getcwd(buf, (size_t)size);
}
static inline int _chdir(const char *p) { return chdir(p); }
static inline int _mkdir(const char *p) { return mkdir(p, 0755); }
static inline int _rmdir(const char *p) { return rmdir(p); }

#ifdef __cplusplus
}
#endif

#endif
