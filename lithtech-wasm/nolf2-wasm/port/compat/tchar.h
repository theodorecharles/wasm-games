#ifndef PORT_TCHAR_H
#define PORT_TCHAR_H

#include "windows.h"
#include <string.h>
#include <stdio.h>
#include <stdarg.h>

#ifndef _T
#define _T(s) s
#define _TEXT(s) s
#define TEXT(s) s
#endif

#ifndef _tcslen
#define _tcslen strlen
#define _tcscpy strcpy
#define _tcsncpy strncpy
#define _tcscat strcat
#define _tcscmp strcmp
#define _tcsicmp strcasecmp
#define _tcsncmp strncmp
#define _tcsnicmp strncasecmp
#define _stprintf sprintf
#define _sntprintf snprintf
#define _vsntprintf vsnprintf
#define _tfopen fopen
#define _TCHAR char
#define TCHAR char
#endif

#endif
