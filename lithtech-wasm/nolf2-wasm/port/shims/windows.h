/* Linux compile shim for Win32 types used by ButeMgr / RegMgr. */
#ifndef PORT_WINDOWS_H
#define PORT_WINDOWS_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <ctype.h>
#include <strings.h>

#ifndef BYTE
typedef unsigned char BYTE;
#endif
#ifndef WORD
typedef unsigned short WORD;
#endif
#ifndef DWORD
typedef unsigned int DWORD;
#endif
#ifndef LONG
typedef long LONG;
#endif
#ifndef BOOL
typedef int BOOL;
#endif
#ifndef UINT
typedef unsigned int UINT;
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

#ifndef HANDLE
typedef void *HANDLE;
#endif
#ifndef HKEY
typedef void *HKEY;
#endif
#ifndef LPCSTR
typedef const char *LPCSTR;
#endif
#ifndef LPSTR
typedef char *LPSTR;
#endif
#ifndef LPCTSTR
typedef const char *LPCTSTR;
#endif
#ifndef LPTSTR
typedef char *LPTSTR;
#endif

#ifndef HKEY_LOCAL_MACHINE
#define HKEY_LOCAL_MACHINE ((HKEY)(long)0x80000002)
#endif
#ifndef HKEY_CURRENT_USER
#define HKEY_CURRENT_USER ((HKEY)(long)0x80000001)
#endif

#ifndef ERROR_SUCCESS
#define ERROR_SUCCESS 0L
#endif
#ifndef ERROR_FILE_NOT_FOUND
#define ERROR_FILE_NOT_FOUND 2L
#endif

#ifndef REG_NONE
#define REG_NONE 0
#endif
#ifndef REG_SZ
#define REG_SZ 1
#endif
#ifndef REG_BINARY
#define REG_BINARY 3
#endif
#ifndef REG_DWORD
#define REG_DWORD 4
#endif
#ifndef REG_OPTION_NON_VOLATILE
#define REG_OPTION_NON_VOLATILE 0
#endif
#ifndef KEY_READ
#define KEY_READ 0x20019
#endif
#ifndef MB_OK
#define MB_OK 0x00000000L
#define MB_OKCANCEL 0x00000001L
#define MB_ABORTRETRYIGNORE 0x00000002L
#define IDOK 1
#define IDCANCEL 2
#define IDABORT 3
#define IDRETRY 4
#define IDIGNORE 5
#endif
#ifndef SW_MINIMIZE
#define SW_MINIMIZE 6
#define SW_MAXIMIZE 3
#define SW_RESTORE 9
#endif

#ifndef HWND
typedef void *HWND;
#endif
#ifdef __cplusplus
inline HWND FindWindow(const char *, const char *) { return 0; }
inline int ShowWindow(HWND, int) { return 1; }
inline int DestroyWindow(HWND) { return 1; }
#else
static HWND FindWindow(const char *a, const char *b) { (void)a; (void)b; return 0; }
static int ShowWindow(HWND h, int s) { (void)h; (void)s; return 1; }
static int DestroyWindow(HWND h) { (void)h; return 1; }
#endif

#ifndef KEY_WRITE
#define KEY_WRITE 0x20006
#endif
#ifndef KEY_ALL_ACCESS
#define KEY_ALL_ACCESS 0xF003F
#endif

#ifdef __cplusplus
#include <stdio.h>
inline char *_ltoa(long v, char *buf, int base)
{
	if (!buf) return buf;
	if (base == 16) sprintf(buf, "%lx", (unsigned long)v);
	else sprintf(buf, "%ld", v);
	return buf;
}
inline char *_itoa(int v, char *buf, int base) { return _ltoa((long)v, buf, base); }
#else
static char *_ltoa(long v, char *buf, int base)
{
	if (!buf) return buf;
	if (base == 16) sprintf(buf, "%lx", (unsigned long)v);
	else sprintf(buf, "%ld", v);
	return buf;
}
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
#ifndef _vsnprintf
#define _vsnprintf vsnprintf
#endif

#ifdef __cplusplus
inline LONG RegCloseKey(HKEY) { return ERROR_SUCCESS; }
inline LONG RegSetValueEx(HKEY, LPCSTR, DWORD, DWORD, const unsigned char *, DWORD)
{ return ERROR_FILE_NOT_FOUND; }
inline LONG RegQueryValueEx(HKEY, LPCSTR, DWORD *, DWORD *, unsigned char *, DWORD *)
{ return ERROR_FILE_NOT_FOUND; }
inline LONG RegDeleteValue(HKEY, LPCSTR) { return ERROR_FILE_NOT_FOUND; }
inline LONG RegCreateKeyEx(HKEY, LPCSTR, DWORD, LPSTR, DWORD, DWORD, void *, HKEY *phk, DWORD *disp)
{
	if (phk) *phk = (HKEY)0;
	if (disp) *disp = 0;
	return ERROR_FILE_NOT_FOUND;
}
inline LONG RegDeleteKey(HKEY, LPCSTR) { return ERROR_FILE_NOT_FOUND; }
#else
static LONG RegCloseKey(HKEY k) { (void)k; return ERROR_SUCCESS; }
#endif

#ifndef FORMAT_MESSAGE_FROM_STRING
#define FORMAT_MESSAGE_FROM_STRING 0x00000400
#define FORMAT_MESSAGE_IGNORE_INSERTS 0x00000200
#define FORMAT_MESSAGE_FROM_SYSTEM 0x00001000
#endif

#ifdef __cplusplus
extern "C" {
#endif
int LoadStringA(void *hInstance, unsigned id, char *buf, int max);
int LoadString(void *hInstance, unsigned id, char *buf, int max);
unsigned FormatMessageA(unsigned flags, const void *src, unsigned msgId, unsigned lang,
	char *buf, unsigned size, va_list *args);
unsigned FormatMessage(unsigned flags, const void *src, unsigned msgId, unsigned lang,
	char *buf, unsigned size, va_list *args);
#ifdef __cplusplus
}
#endif

#endif /* PORT_WINDOWS_H */
