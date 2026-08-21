#ifndef PORT_CRTDBG_H
#define PORT_CRTDBG_H

#include <assert.h>
#include <string.h>
#include <strings.h>
#include <stdio.h>
#include <stdarg.h>
#include <ctype.h>

#ifndef ASSERT
#define ASSERT assert
#endif
#ifndef _ASSERT
#define _ASSERT(x) assert(x)
#endif
#ifndef _ASSERTE
#define _ASSERTE(x) assert(x)
#endif
#ifndef _RPT0
#define _RPT0(t, s) ((void)0)
#define _RPT1(t, s, a) ((void)0)
#define _RPT2(t, s, a, b) ((void)0)
#endif
#ifndef _CrtDbgBreak
#define _CrtDbgBreak() ((void)0)
#endif
#ifndef _CrtCheckMemory
#define _CrtCheckMemory() (1)
#endif
#ifndef _CRT_WARN
#define _CRT_WARN 0
#define _CRT_ERROR 1
#define _CRT_ASSERT 2
#endif

#ifndef _CRT_REPORT_HOOK
typedef int (*_CRT_REPORT_HOOK)(int, char *, int *);
#endif
#ifndef _CrtSetReportHook
#define _CrtSetReportHook(fn) ((_CRT_REPORT_HOOK)0)
#endif

#ifndef stricmp
#define stricmp strcasecmp
#endif
#ifndef strnicmp
#define strnicmp strncasecmp
#endif
#ifndef _stricmp
#define _stricmp strcasecmp
#endif
#ifndef _strnicmp
#define _strnicmp strncasecmp
#endif
#ifndef _vsnprintf
#define _vsnprintf vsnprintf
#endif
#ifndef _snprintf
#define _snprintf snprintf
#endif

#ifdef __cplusplus
inline char *_strupr(char *s)
{
	if (!s) return s;
	for (char *p = s; *p; ++p)
		*p = (char)toupper((unsigned char)*p);
	return s;
}
inline char *_strlwr(char *s)
{
	if (!s) return s;
	for (char *p = s; *p; ++p)
		*p = (char)tolower((unsigned char)*p);
	return s;
}
#endif

#endif
