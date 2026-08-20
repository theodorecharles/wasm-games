/* Linux compile shim for MSVC <crtdbg.h>. */
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
#define _ASSERT assert
#endif
#ifndef stricmp
#define stricmp strcasecmp
#endif
#ifndef strnicmp
#define strnicmp strncasecmp
#endif
#ifndef _vsnprintf
#define _vsnprintf vsnprintf
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
inline char *_strrev(char *s)
{
	if (!s || !*s) return s;
	char *a = s;
	char *b = s + strlen(s) - 1;
	while (a < b) {
		char t = *a;
		*a++ = *b;
		*b-- = t;
	}
	return s;
}
#endif

#endif
