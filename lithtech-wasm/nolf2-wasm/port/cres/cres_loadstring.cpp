/* Official NOLF2 EN string table + Win32 LoadString/FormatMessage for Linux. */

#include <stdio.h>
#include <string.h>
#include <stdarg.h>
#include <stdint.h>

#include "cres_strings.inc"

#ifndef WINAPI
#define WINAPI
#endif

extern "C" int WINAPI LoadStringA(void * /*hInstance*/, unsigned id, char *buf, int max)
{
	if (!buf || max <= 0) return 0;
	buf[0] = 0;
	for (int i = 0; kCresStrings[i].s; ++i) {
		if ((unsigned)kCresStrings[i].id == id) {
			strncpy(buf, kCresStrings[i].s, (size_t)max - 1);
			buf[max - 1] = 0;
			return (int)strlen(buf);
		}
	}
	return 0;
}

extern "C" int WINAPI LoadStringW(void *h, unsigned id, char *buf, int max)
{
	return LoadStringA(h, id, buf, max);
}

#ifndef FORMAT_MESSAGE_FROM_STRING
#define FORMAT_MESSAGE_FROM_STRING 0x00000400
#define FORMAT_MESSAGE_IGNORE_INSERTS 0x00000200
#endif

/* Handles %1!s! / %1!d! inserts used by NOLF2 FormatString. */
extern "C" unsigned WINAPI FormatMessageA(
	unsigned flags, const void *src, unsigned /*msgId*/, unsigned /*lang*/,
	char *buf, unsigned size, va_list *args)
{
	if (!buf || size == 0) return 0;
	buf[0] = 0;
	const char *fmt = (const char *)src;
	if (!fmt) return 0;

	if (flags & FORMAT_MESSAGE_IGNORE_INSERTS) {
		strncpy(buf, fmt, size - 1);
		buf[size - 1] = 0;
		return (unsigned)strlen(buf);
	}

	char *out = buf;
	char *end = buf + size - 1;
	const char *p = fmt;
	while (*p && out < end) {
		if (p[0] == '%' && p[1] >= '1' && p[1] <= '9') {
			++p;
			int idx = 0;
			while (*p >= '0' && *p <= '9') {
				idx = idx * 10 + (*p - '0');
				++p;
			}
			(void)idx;
			const char *ins = "";
			char tmp[64];
			if (*p == '!') {
				++p;
				if (p[0] == 's' && p[1] == '!') {
					p += 2;
					ins = args ? va_arg(*args, const char *) : "";
					if (!ins) ins = "";
				} else if ((p[0] == 'd' || p[0] == 'u' || p[0] == 'i') && p[1] == '!') {
					int v = args ? va_arg(*args, int) : 0;
					snprintf(tmp, sizeof(tmp), "%d", v);
					ins = tmp;
					p += 2;
				} else {
					while (*p && *p != '!') ++p;
					if (*p == '!') ++p;
					ins = "";
				}
			} else {
				ins = args ? va_arg(*args, const char *) : "";
				if (!ins) ins = "";
			}
			while (*ins && out < end) *out++ = *ins++;
			continue;
		}
		if (p[0] == '%' && p[1] == '%') {
			*out++ = '%';
			p += 2;
			continue;
		}
		*out++ = *p++;
	}
	*out = 0;
	return (unsigned)(out - buf);
}

#ifdef LoadString
#undef LoadString
#endif
extern "C" int WINAPI LoadString(void *h, unsigned id, char *buf, int max)
{
	return LoadStringA(h, id, buf, max);
}

extern "C" unsigned WINAPI FormatMessage(
	unsigned flags, const void *src, unsigned msgId, unsigned lang,
	char *buf, unsigned size, va_list *args)
{
	return FormatMessageA(flags, src, msgId, lang, buf, size, args);
}
