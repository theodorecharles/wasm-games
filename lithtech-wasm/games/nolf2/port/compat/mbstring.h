#ifndef PORT_MBSTRING_H
#define PORT_MBSTRING_H

#include <string.h>
#include <strings.h>
#include <ctype.h>

#ifdef __cplusplus
inline size_t _mbstrlen(const char *s) { return s ? strlen(s) : 0; }
inline unsigned char *_mbsinc(const unsigned char *s)
{
	return (unsigned char *)(s ? s + 1 : s);
}
inline size_t _mbsnbcnt(const unsigned char *s, size_t n)
{
	(void)s;
	return n;
}
inline unsigned char *_mbsncpy(unsigned char *d, const unsigned char *s, size_t n)
{
	return (unsigned char *)strncpy((char *)d, (const char *)s, n);
}
inline int _mbsicmp(const unsigned char *a, const unsigned char *b)
{
	return strcasecmp((const char *)a, (const char *)b);
}
#else
#define _mbstrlen(s) strlen(s)
#define _mbsinc(s) ((unsigned char *)((s) + 1))
#define _mbsnbcnt(s, n) (n)
#define _mbsncpy(d, s, n) ((unsigned char *)strncpy((char *)(d), (const char *)(s), (n)))
#define _mbsicmp(a, b) strcasecmp((const char *)(a), (const char *)(b))
#endif

#endif
