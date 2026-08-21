#ifndef PORT_WINDOWS_H
#define PORT_WINDOWS_H

/* Linux stand-in for the Win32 types NOLF2 / Jupiter still include. */

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef _WINDOWS_
#define _WINDOWS_
#endif
#ifndef _WINDEF_
#define _WINDEF_
#endif

#include <ctype.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>
#include <errno.h>
#include <fcntl.h>
#include <dirent.h>
#include <stdarg.h>
#include <limits.h>

#ifdef __cplusplus
extern "C" {
#endif

#ifndef WINAPI
#define WINAPI
#endif
#ifndef CALLBACK
#define CALLBACK
#endif
#ifndef APIENTRY
#define APIENTRY
#endif
#ifndef PASCAL
#define PASCAL
#endif
#ifndef NTAPI
#define NTAPI
#endif
#ifndef __stdcall
#define __stdcall
#endif
#ifndef __cdecl
#define __cdecl
#endif
#ifndef __fastcall
#define __fastcall
#endif
#ifndef STDMETHODCALLTYPE
#define STDMETHODCALLTYPE
#endif

#ifndef __declspec
#define __declspec(x)
#endif
#ifndef _declspec
#define _declspec(x)
#endif
#ifndef DECLSPEC_SELECTANY
#define DECLSPEC_SELECTANY
#endif

#ifndef MAX_PATH
#define MAX_PATH 260
#endif
#ifndef _MAX_PATH
#define _MAX_PATH MAX_PATH
#endif
#ifndef _MAX_DRIVE
#define _MAX_DRIVE 3
#endif
#ifndef _MAX_DIR
#define _MAX_DIR 256
#endif
#ifndef _MAX_FNAME
#define _MAX_FNAME 256
#endif
#ifndef _MAX_EXT
#define _MAX_EXT 256
#endif
#ifndef MAX_COMPUTERNAME_LENGTH
#define MAX_COMPUTERNAME_LENGTH 31
#endif

#ifndef FALSE
#define FALSE 0
#endif
#ifndef TRUE
#define TRUE 1
#endif

#ifndef INFINITE
#define INFINITE 0xFFFFFFFFu
#endif
#ifndef INVALID_HANDLE_VALUE
#define INVALID_HANDLE_VALUE ((HANDLE)(intptr_t)-1)
#endif
#ifndef INVALID_FILE_ATTRIBUTES
#define INVALID_FILE_ATTRIBUTES ((DWORD)0xFFFFFFFFu)
#endif
#ifndef HFILE_ERROR
#define HFILE_ERROR ((HFILE)-1)
#endif

#ifndef ERROR_SUCCESS
#define ERROR_SUCCESS 0
#endif
#ifndef ERROR_FILE_NOT_FOUND
#define ERROR_FILE_NOT_FOUND 2
#endif
#ifndef ERROR_PATH_NOT_FOUND
#define ERROR_PATH_NOT_FOUND 3
#endif
#ifndef SEM_FAILCRITICALERRORS
#define SEM_FAILCRITICALERRORS 0x0001
#endif
#ifndef SEM_NOOPENFILEERRORBOX
#define SEM_NOOPENFILEERRORBOX 0x8000
#endif

#ifndef DRIVE_UNKNOWN
#define DRIVE_UNKNOWN 0
#define DRIVE_NO_ROOT_DIR 1
#define DRIVE_REMOVABLE 2
#define DRIVE_FIXED 3
#define DRIVE_REMOTE 4
#define DRIVE_CDROM 5
#define DRIVE_RAMDISK 6
#endif

#ifndef MB_OK
#define MB_OK 0x00000000L
#define MB_OKCANCEL 0x00000001L
#define MB_YESNO 0x00000004L
#define MB_ABORTRETRYIGNORE 0x00000002L
#define MB_ICONERROR 0x00000010L
#define MB_ICONWARNING 0x00000030L
#define IDOK 1
#define IDCANCEL 2
#define IDABORT 3
#define IDRETRY 4
#define IDIGNORE 5
#define IDYES 6
#define IDNO 7
#endif
#ifndef SW_HIDE
#define SW_HIDE 0
#define SW_SHOWNORMAL 1
#define SW_SHOW 5
#define SW_MINIMIZE 6
#define SW_SHOWMINNOACTIVE 7
#define SW_RESTORE 9
#define SW_MAXIMIZE 3
#endif
#ifndef SWP_NOMOVE
#define SWP_NOMOVE 0x0002
#define SWP_NOSIZE 0x0001
#define SWP_NOREPOSITION 0x0200
#define SWP_NOZORDER 0x0004
#define HWND_TOP ((void *)0)
#define HWND_TOPMOST ((void *)(intptr_t)-1)
#endif
#ifndef PM_REMOVE
#define PM_REMOVE 1
#define PM_NOREMOVE 0
#endif
#ifndef WM_QUIT
#define WM_QUIT 0x0012
#define WM_KEYDOWN 0x0100
#define WM_KEYUP 0x0101
#define WM_CHAR 0x0102
#endif

#ifndef OF_EXIST
#define OF_EXIST 0x4000
#endif

#ifndef FILE_ATTRIBUTE_DIRECTORY
#define FILE_ATTRIBUTE_DIRECTORY 0x00000010
#endif

#ifndef REG_SZ
#define REG_SZ 1
#define REG_BINARY 3
#define REG_DWORD 4
#endif

#ifndef HKEY_CURRENT_USER
#define HKEY_CURRENT_USER ((HKEY)(uintptr_t)0x80000001u)
#define HKEY_LOCAL_MACHINE ((HKEY)(uintptr_t)0x80000002u)
#endif

#ifndef WM_USER
#define WM_USER 0x0400
#endif

#ifndef VK_ESCAPE
#define VK_LBUTTON 0x01
#define VK_RBUTTON 0x02
#define VK_CANCEL 0x03
#define VK_MBUTTON 0x04
#define VK_BACK 0x08
#define VK_TAB 0x09
#define VK_CLEAR 0x0C
#define VK_RETURN 0x0D
#define VK_SHIFT 0x10
#define VK_CONTROL 0x11
#define VK_MENU 0x12
#define VK_PAUSE 0x13
#define VK_CAPITAL 0x14
#define VK_ESCAPE 0x1B
#define VK_SPACE 0x20
#define VK_PRIOR 0x21
#define VK_NEXT 0x22
#define VK_END 0x23
#define VK_HOME 0x24
#define VK_LEFT 0x25
#define VK_UP 0x26
#define VK_RIGHT 0x27
#define VK_DOWN 0x28
#define VK_SELECT 0x29
#define VK_PRINT 0x2A
#define VK_EXECUTE 0x2B
#define VK_SNAPSHOT 0x2C
#define VK_INSERT 0x2D
#define VK_DELETE 0x2E
#define VK_HELP 0x2F
#define VK_LWIN 0x5B
#define VK_RWIN 0x5C
#define VK_APPS 0x5D
#define VK_NUMPAD0 0x60
#define VK_NUMPAD1 0x61
#define VK_NUMPAD2 0x62
#define VK_NUMPAD3 0x63
#define VK_NUMPAD4 0x64
#define VK_NUMPAD5 0x65
#define VK_NUMPAD6 0x66
#define VK_NUMPAD7 0x67
#define VK_NUMPAD8 0x68
#define VK_NUMPAD9 0x69
#define VK_MULTIPLY 0x6A
#define VK_ADD 0x6B
#define VK_SEPARATOR 0x6C
#define VK_SUBTRACT 0x6D
#define VK_DECIMAL 0x6E
#define VK_DIVIDE 0x6F
#define VK_F1 0x70
#define VK_F2 0x71
#define VK_F3 0x72
#define VK_F4 0x73
#define VK_F5 0x74
#define VK_F6 0x75
#define VK_F7 0x76
#define VK_F8 0x77
#define VK_F9 0x78
#define VK_F10 0x79
#define VK_F11 0x7A
#define VK_F12 0x7B
#define VK_F13 0x7C
#define VK_F14 0x7D
#define VK_F15 0x7E
#define VK_F16 0x7F
#define VK_F17 0x80
#define VK_F18 0x81
#define VK_F19 0x82
#define VK_F20 0x83
#define VK_F21 0x84
#define VK_F22 0x85
#define VK_F23 0x86
#define VK_F24 0x87
#define VK_NUMLOCK 0x90
#define VK_SCROLL 0x91
#define VK_LSHIFT 0xA0
#define VK_RSHIFT 0xA1
#define VK_LCONTROL 0xA2
#define VK_RCONTROL 0xA3
#define VK_LMENU 0xA4
#define VK_RMENU 0xA5
#define VK_TILDE 0xC0
#endif

#ifndef RGB
#define RGB(r,g,b) ((COLORREF)(((BYTE)(r)|((WORD)((BYTE)(g))<<8))|(((DWORD)(BYTE)(b))<<16)))
#endif
#ifndef GetRValue
#define GetRValue(c) ((BYTE)((c)&0xFF))
#define GetGValue(c) ((BYTE)(((c)>>8)&0xFF))
#define GetBValue(c) ((BYTE)(((c)>>16)&0xFF))
#endif
#ifndef LOWORD
#define LOWORD(l) ((WORD)((uintptr_t)(l) & 0xFFFF))
#define HIWORD(l) ((WORD)(((uintptr_t)(l) >> 16) & 0xFFFF))
#define LOBYTE(w) ((BYTE)((uintptr_t)(w) & 0xFF))
#define HIBYTE(w) ((BYTE)(((uintptr_t)(w) >> 8) & 0xFF))
#endif
#ifndef MAKEWORD
#define MAKEWORD(a,b) ((WORD)(((BYTE)((uintptr_t)(a)&0xFF))|((WORD)((BYTE)((uintptr_t)(b)&0xFF)))<<8))
#define MAKELONG(a,b) ((LONG)(((WORD)((uintptr_t)(a)&0xFFFF))|((DWORD)((WORD)((uintptr_t)(b)&0xFFFF)))<<16))
#endif

#ifndef ZeroMemory
#define ZeroMemory(p,n) memset((p), 0, (n))
#endif
#ifndef CopyMemory
#define CopyMemory(d,s,n) memcpy((d),(s),(n))
#endif
#ifndef FillMemory
#define FillMemory(p,n,v) memset((p),(v),(n))
#endif

#ifndef SUCCEEDED
#define SUCCEEDED(hr) (((HRESULT)(hr)) >= 0)
#define FAILED(hr) (((HRESULT)(hr)) < 0)
#define S_OK ((HRESULT)0)
#define S_FALSE ((HRESULT)1)
#define E_FAIL ((HRESULT)0x80004005L)
#define E_NOTIMPL ((HRESULT)0x80004001L)
#define E_OUTOFMEMORY ((HRESULT)0x8007000EL)
#endif

#ifndef STDMETHOD
#ifdef __cplusplus
#define STDMETHOD(m) virtual HRESULT m
#define STDMETHOD_(t,m) virtual t m
#else
#define STDMETHOD(m) HRESULT (m)
#define STDMETHOD_(t,m) t (m)
#endif
#endif

#ifndef interface
#define interface struct
#endif

#ifndef UNREFERENCED_PARAMETER
#define UNREFERENCED_PARAMETER(x) (void)(x)
#endif

#ifndef TEXT
#define TEXT(s) s
#define _T(s) s
#endif

#ifndef _MSC_VER
#ifndef _stricmp
#define _stricmp strcasecmp
#endif
#ifndef _strnicmp
#define _strnicmp strncasecmp
#endif
#ifndef _strcmpi
#define _strcmpi strcasecmp
#endif
#ifndef strcmpi
#define strcmpi strcasecmp
#endif
#ifndef _ltoa
static inline char *_ltoa(long v, char *buf, int base)
{
	if (!buf) return buf;
	if (base == 16) sprintf(buf, "%lx", (unsigned long)v);
	else sprintf(buf, "%ld", v);
	return buf;
}
#endif
#ifndef _itoa
#define _itoa _ltoa
#endif
#ifndef _UI8_MAX
#define _UI8_MAX 0xffu
#define _UI16_MAX 0xffffu
#define _UI32_MAX 0xffffffffu
#define _I8_MIN (-128)
#define _I8_MAX 127
#define _I16_MIN (-32768)
#define _I16_MAX 32767
#define _I32_MIN (-2147483647-1)
#define _I32_MAX 2147483647
#endif
#ifndef LT_HAS_STRICMP
#define LT_HAS_STRICMP
#ifdef stricmp
#undef stricmp
#endif
#ifdef strnicmp
#undef strnicmp
#endif
static inline int stricmp(const char *a, const char *b)
{
	return strcasecmp(a ? a : "", b ? b : "");
}
static inline int strnicmp(const char *a, const char *b, size_t n)
{
	return strncasecmp(a ? a : "", b ? b : "", n);
}
#endif
#ifndef _snprintf
#define _snprintf snprintf
#endif
#ifndef _vsnprintf
#define _vsnprintf vsnprintf
#endif
#ifndef _snwprintf
#define _snwprintf swprintf
#endif
#ifndef lstrlen
#define lstrlen strlen
#endif
#ifndef lstrcpy
#define lstrcpy strcpy
#endif
#ifndef lstrcmpi
#define lstrcmpi strcasecmp
#endif
#ifndef wsprintf
#define wsprintf sprintf
#endif
#ifndef wvsprintf
#define wvsprintf vsprintf
#endif
#endif

typedef unsigned char BYTE;
typedef unsigned short WORD;
typedef unsigned int DWORD;
typedef unsigned int UINT;
typedef unsigned int ULONG;
typedef int LONG;
typedef int BOOL;
typedef int INT;
typedef short SHORT;
typedef unsigned short USHORT;
typedef float FLOAT;
typedef char CHAR;
typedef unsigned char UCHAR;
typedef wchar_t WCHAR;
typedef char TCHAR;
typedef int INT32;
typedef unsigned int UINT32;
typedef int64_t INT64;
typedef uint64_t UINT64;
typedef intptr_t LONG_PTR;
typedef uintptr_t UINT_PTR;
typedef uintptr_t ULONG_PTR;
typedef uintptr_t DWORD_PTR;
typedef int INT_PTR;
typedef long long LONGLONG;
typedef unsigned long long ULONGLONG;
typedef int HRESULT;
typedef DWORD COLORREF;
typedef int HFILE;
typedef int SOCKET;

/* WinUtil.h tests #ifndef DWORD/BOOL; typedef names are not macros. */
#define DWORD DWORD
#define BOOL BOOL
#define BYTE BYTE
#define WORD WORD
#define UINT UINT
#define LONG LONG

typedef void *HANDLE;
typedef void *HINSTANCE;
typedef void *HMODULE;
typedef void *HWND;
typedef void *HDC;
typedef void *HBITMAP;
typedef void *HICON;
typedef void *HCURSOR;
typedef void *HBRUSH;
typedef void *HMENU;
typedef void *HFONT;
typedef void *HPEN;
typedef void *HRGN;
typedef void *HGDIOBJ;
typedef void *HGLOBAL;
typedef void *HLOCAL;
typedef void *HKEY;
typedef void *HACCEL;
typedef void *HPALETTE;
typedef void *HMONITOR;
typedef void *HDWP;
typedef void *HKL;
typedef void *HRSRC;
typedef void *HHOOK;
typedef const void *LPCVOID;
typedef void *LPVOID;
typedef BYTE *LPBYTE;
typedef DWORD *LPDWORD;
typedef WORD *LPWORD;
typedef char *LPSTR;
typedef const char *LPCSTR;
typedef TCHAR *LPTSTR;
typedef const TCHAR *LPCTSTR;
typedef WCHAR *LPWSTR;
typedef const WCHAR *LPCWSTR;
typedef HANDLE *LPHANDLE;
typedef BOOL *LPBOOL;

typedef UINT_PTR WPARAM;
typedef LONG_PTR LPARAM;
typedef LONG_PTR LRESULT;

typedef struct _GUID {
	DWORD Data1;
	WORD Data2;
	WORD Data3;
	BYTE Data4[8];
} GUID;
typedef GUID UUID;
typedef GUID CLSID;
typedef GUID IID;
typedef const GUID *LPCGUID;
typedef const GUID *REFGUID;
#ifdef __cplusplus
#ifndef REFIID
#define REFIID const IID &
#endif
#ifndef REFCLSID
#define REFCLSID const CLSID &
#endif
#else
#ifndef REFIID
#define REFIID const IID *
#endif
#endif

typedef struct tagRECT {
	LONG left, top, right, bottom;
} RECT, *PRECT, *LPRECT;
typedef const RECT *LPCRECT;

typedef struct tagPOINT {
	LONG x, y;
} POINT, *PPOINT, *LPPOINT;

typedef struct tagSIZE {
	LONG cx, cy;
} SIZE, *PSIZE, *LPSIZE;

typedef struct tagMSG {
	HWND hwnd;
	UINT message;
	WPARAM wParam;
	LPARAM lParam;
	DWORD time;
	POINT pt;
} MSG, *LPMSG;

typedef struct _SYSTEMTIME {
	WORD wYear, wMonth, wDayOfWeek, wDay;
	WORD wHour, wMinute, wSecond, wMilliseconds;
} SYSTEMTIME, *LPSYSTEMTIME;

typedef struct _FILETIME {
	DWORD dwLowDateTime;
	DWORD dwHighDateTime;
} FILETIME, *PFILETIME, *LPFILETIME;

typedef struct _SECURITY_ATTRIBUTES {
	DWORD nLength;
	LPVOID lpSecurityDescriptor;
	BOOL bInheritHandle;
} SECURITY_ATTRIBUTES, *LPSECURITY_ATTRIBUTES;

typedef struct _OVERLAPPED {
	ULONG_PTR Internal;
	ULONG_PTR InternalHigh;
	DWORD Offset;
	DWORD OffsetHigh;
	HANDLE hEvent;
} OVERLAPPED, *LPOVERLAPPED;

typedef struct _OFSTRUCT {
	BYTE cBytes;
	BYTE fFixedDisk;
	WORD nErrCode;
	WORD Reserved1;
	WORD Reserved2;
	CHAR szPathName[128];
} OFSTRUCT, *LPOFSTRUCT;

typedef union _LARGE_INTEGER {
	struct {
		DWORD LowPart;
		LONG HighPart;
	};
	struct {
		DWORD LowPart;
		LONG HighPart;
	} u;
	LONGLONG QuadPart;
} LARGE_INTEGER, *PLARGE_INTEGER;

typedef struct _RTL_CRITICAL_SECTION {
	void *DebugInfo;
	LONG LockCount;
	LONG RecursionCount;
	HANDLE OwningThread;
	HANDLE LockSemaphore;
	ULONG_PTR SpinCount;
} CRITICAL_SECTION, *LPCRITICAL_SECTION, *PCRITICAL_SECTION;

typedef struct _MEMORYSTATUS {
	DWORD dwLength;
	DWORD dwMemoryLoad;
	DWORD dwTotalPhys;
	DWORD dwAvailPhys;
	DWORD dwTotalPageFile;
	DWORD dwAvailPageFile;
	DWORD dwTotalVirtual;
	DWORD dwAvailVirtual;
} MEMORYSTATUS, *LPMEMORYSTATUS;

#ifndef WINAPI
#define WINAPI
#endif

static inline DWORD GetTickCount(void)
{
	struct timespec ts;
	clock_gettime(CLOCK_MONOTONIC, &ts);
	return (DWORD)(ts.tv_sec * 1000u + (DWORD)(ts.tv_nsec / 1000000u));
}

#ifndef PBYTE
typedef BYTE *PBYTE;
#endif

static inline BOOL GetKeyboardState(PBYTE lpKeyState)
{
	if (!lpKeyState)
		return FALSE;
	memset(lpKeyState, 0, 256);
	return TRUE;
}

static inline int ToAscii(UINT uVirtKey, UINT /*uScanCode*/, const BYTE * /*lpKeyState*/,
	LPWORD lpChar, UINT /*uFlags*/)
{
	if (!lpChar)
		return 0;
	if (uVirtKey >= 32 && uVirtKey < 127) {
		*lpChar = (WORD)uVirtKey;
		return 1;
	}
	return 0;
}

static inline void Sleep(DWORD ms) { usleep(ms * 1000u); }

static inline void OutputDebugStringA(LPCSTR s)
{
	if (s) fputs(s, stderr);
}
static inline void OutputDebugString(LPCSTR s) { OutputDebugStringA(s); }

static inline UINT SetErrorMode(UINT m) { (void)m; return 0; }

static inline BOOL CreateDirectoryA(LPCSTR path, LPSECURITY_ATTRIBUTES a)
{
	(void)a;
	return mkdir(path, 0755) == 0 || errno == EEXIST;
}
static inline BOOL CreateDirectory(LPCSTR path, LPSECURITY_ATTRIBUTES a)
{
	return CreateDirectoryA(path, a);
}

static inline BOOL CopyFileA(LPCSTR src, LPCSTR dst, BOOL failIfExists)
{
	if (failIfExists && access(dst, F_OK) == 0) return FALSE;
	FILE *in = fopen(src, "rb");
	if (!in) return FALSE;
	FILE *out = fopen(dst, "wb");
	if (!out) { fclose(in); return FALSE; }
	char buf[8192];
	size_t n;
	while ((n = fread(buf, 1, sizeof(buf), in)) > 0) fwrite(buf, 1, n, out);
	fclose(in);
	fclose(out);
	return TRUE;
}
static inline BOOL CopyFile(LPCSTR s, LPCSTR d, BOOL f) { return CopyFileA(s, d, f); }

static inline UINT GetDriveTypeA(LPCSTR root)
{
	(void)root;
	return DRIVE_FIXED;
}
static inline UINT GetDriveType(LPCSTR root) { return GetDriveTypeA(root); }

static inline HFILE OpenFile(LPCSTR path, LPOFSTRUCT ofs, UINT style)
{
	(void)style;
	if (ofs) {
		memset(ofs, 0, sizeof(*ofs));
		ofs->cBytes = sizeof(*ofs);
		if (path) strncpy(ofs->szPathName, path, sizeof(ofs->szPathName) - 1);
	}
	return access(path, F_OK) == 0 ? 0 : HFILE_ERROR;
}

static inline HWND GetFocus(void) { return NULL; }
static inline HWND GetForegroundWindow(void) { return NULL; }
static inline HWND FindWindowA(LPCSTR, LPCSTR) { return NULL; }
static inline HWND FindWindow(LPCSTR a, LPCSTR b) { return FindWindowA(a, b); }
static inline BOOL ShowWindow(HWND, int) { return TRUE; }
static inline BOOL DestroyWindow(HWND) { return TRUE; }
static inline int ShowCursor(BOOL) { return 0; }
#ifndef IMAGE_CURSOR
#define IMAGE_CURSOR 2
#define LR_DEFAULTCOLOR 0
#define LR_DEFAULTSIZE 0x0040
#endif
#ifndef HWND_BROADCAST
#define HWND_BROADCAST ((HWND)(uintptr_t)0xFFFF)
#define WM_FONTCHANGE 0x001D
#define SMTO_BLOCK 0x0001
#define SMTO_ABORTIFHUNG 0x0002
#endif
#ifndef PDWORD_PTR
typedef DWORD_PTR *PDWORD_PTR;
#endif
static inline int AddFontResourceA(LPCSTR) { return 0; }
static inline int AddFontResource(LPCSTR p) { return AddFontResourceA(p); }
static inline BOOL RemoveFontResourceA(LPCSTR) { return TRUE; }
static inline BOOL RemoveFontResource(LPCSTR p) { return RemoveFontResourceA(p); }
static inline LRESULT SendMessageTimeoutA(HWND, UINT, WPARAM, LPARAM, UINT, UINT, PDWORD_PTR)
{ return 1; }
static inline LRESULT SendMessageTimeout(HWND w, UINT m, WPARAM a, LPARAM b, UINT f, UINT t, PDWORD_PTR r)
{ return SendMessageTimeoutA(w, m, a, b, f, t, r); }
static inline HANDLE LoadImageA(HINSTANCE, LPCSTR, UINT, int, int, UINT) { return NULL; }
static inline HANDLE LoadImage(HINSTANCE i, LPCSTR n, UINT t, int x, int y, UINT f)
{
	return LoadImageA(i, n, t, x, y, f);
}
static inline SHORT GetKeyState(int) { return 0; }
static inline SHORT GetAsyncKeyState(int) { return 0; }
static inline HRSRC FindResourceA(HMODULE, LPCSTR, LPCSTR) { return NULL; }
static inline HRSRC FindResource(HMODULE m, LPCSTR n, LPCSTR t) { return FindResourceA(m, n, t); }
static inline HGLOBAL LoadResource(HMODULE, HRSRC) { return NULL; }
static inline LPVOID LockResource(HGLOBAL) { return NULL; }
static inline DWORD SizeofResource(HMODULE, HRSRC) { return 0; }
static inline int GetWindowTextA(HWND, LPSTR buf, int n)
{
	if (buf && n > 0) buf[0] = 0;
	return 0;
}
static inline int GetWindowText(HWND h, LPSTR b, int n) { return GetWindowTextA(h, b, n); }

static inline void DebugBreak(void) { /* no-op on port */ }

static inline int MessageBoxA(HWND, LPCSTR text, LPCSTR title, UINT type)
{
	fprintf(stderr, "MessageBox [%s]: %s\n", title ? title : "", text ? text : "");
	return (type & MB_OKCANCEL) ? IDOK : IDOK;
}
static inline int MessageBox(HWND w, LPCSTR t, LPCSTR c, UINT f) { return MessageBoxA(w, t, c, f); }

#ifndef FORMAT_MESSAGE_FROM_STRING
#define FORMAT_MESSAGE_FROM_STRING 0x00000400
#define FORMAT_MESSAGE_IGNORE_INSERTS 0x00000200
#define FORMAT_MESSAGE_FROM_SYSTEM 0x00001000
#endif
int WINAPI LoadStringA(void *hInstance, unsigned id, char *buf, int max);
int WINAPI LoadString(void *hInstance, unsigned id, char *buf, int max);
unsigned WINAPI FormatMessageA(unsigned flags, const void *src, unsigned msgId, unsigned lang,
	char *buf, unsigned size, va_list *args);
unsigned WINAPI FormatMessage(unsigned flags, const void *src, unsigned msgId, unsigned lang,
	char *buf, unsigned size, va_list *args);

static inline DWORD GetPrivateProfileStringA(LPCSTR app, LPCSTR key, LPCSTR def,
	LPSTR out, DWORD size, LPCSTR file)
{
	(void)app; (void)key; (void)file;
	if (!out || size == 0) return 0;
	const char *src = def ? def : "";
	strncpy(out, src, size - 1);
	out[size - 1] = 0;
	return (DWORD)strlen(out);
}
static inline DWORD GetPrivateProfileString(LPCSTR a, LPCSTR k, LPCSTR d, LPSTR o, DWORD n, LPCSTR f)
{
	return GetPrivateProfileStringA(a, k, d, o, n, f);
}
static inline BOOL WritePrivateProfileStringA(LPCSTR, LPCSTR, LPCSTR, LPCSTR) { return TRUE; }
static inline BOOL WritePrivateProfileString(LPCSTR a, LPCSTR k, LPCSTR s, LPCSTR f)
{
	return WritePrivateProfileStringA(a, k, s, f);
}

static inline DWORD GetModuleFileNameA(HMODULE, LPSTR buf, DWORD size)
{
	if (!buf || size == 0) return 0;
	ssize_t n = readlink("/proc/self/exe", buf, size - 1);
	if (n < 0) { buf[0] = 0; return 0; }
	buf[n] = 0;
	return (DWORD)n;
}
static inline DWORD GetModuleFileName(HMODULE m, LPSTR b, DWORD n) { return GetModuleFileNameA(m, b, n); }

static inline HMODULE GetModuleHandleA(LPCSTR) { return (HMODULE)(uintptr_t)1; }
static inline HMODULE GetModuleHandle(LPCSTR s) { return GetModuleHandleA(s); }

static inline HMODULE LoadLibraryA(LPCSTR name)
{
	(void)name;
	return NULL;
}
static inline HMODULE LoadLibrary(LPCSTR n) { return LoadLibraryA(n); }
static inline BOOL FreeLibrary(HMODULE) { return TRUE; }
static inline void *GetProcAddress(HMODULE, LPCSTR) { return NULL; }

static inline BOOL CloseHandle(HANDLE) { return TRUE; }

static inline void InitializeCriticalSection(LPCRITICAL_SECTION cs) { if (cs) memset(cs, 0, sizeof(*cs)); }
static inline void DeleteCriticalSection(LPCRITICAL_SECTION) {}
static inline void EnterCriticalSection(LPCRITICAL_SECTION) {}
static inline void LeaveCriticalSection(LPCRITICAL_SECTION) {}

static inline LONG InterlockedIncrement(volatile LONG *v) { return __sync_add_and_fetch(v, 1); }
static inline LONG InterlockedDecrement(volatile LONG *v) { return __sync_sub_and_fetch(v, 1); }
static inline LONG InterlockedExchange(volatile LONG *t, LONG v)
{
	return __sync_lock_test_and_set(t, v);
}

static inline DWORD GetCurrentThreadId(void) { return (DWORD)getpid(); }
static inline DWORD GetCurrentProcessId(void) { return (DWORD)getpid(); }

static inline BOOL QueryPerformanceFrequency(LARGE_INTEGER *f)
{
	if (f) f->QuadPart = 1000000000LL;
	return TRUE;
}
static inline BOOL QueryPerformanceCounter(LARGE_INTEGER *c)
{
	struct timespec ts;
	clock_gettime(CLOCK_MONOTONIC, &ts);
	if (c) c->QuadPart = (LONGLONG)ts.tv_sec * 1000000000LL + ts.tv_nsec;
	return TRUE;
}

static inline void GetLocalTime(LPSYSTEMTIME st)
{
	time_t t = time(NULL);
	struct tm tm;
	localtime_r(&t, &tm);
	if (!st) return;
	st->wYear = (WORD)(tm.tm_year + 1900);
	st->wMonth = (WORD)(tm.tm_mon + 1);
	st->wDayOfWeek = (WORD)tm.tm_wday;
	st->wDay = (WORD)tm.tm_mday;
	st->wHour = (WORD)tm.tm_hour;
	st->wMinute = (WORD)tm.tm_min;
	st->wSecond = (WORD)tm.tm_sec;
	st->wMilliseconds = 0;
}

static inline UINT GetSystemDirectoryA(LPSTR buf, UINT size)
{
	if (!buf || size == 0) return 0;
	strncpy(buf, "/usr/lib", size - 1);
	buf[size - 1] = 0;
	return (UINT)strlen(buf);
}
static inline UINT GetWindowsDirectoryA(LPSTR buf, UINT size)
{
	if (!buf || size == 0) return 0;
	strncpy(buf, "/usr", size - 1);
	buf[size - 1] = 0;
	return (UINT)strlen(buf);
}

static inline DWORD GetTempPathA(DWORD n, LPSTR buf)
{
	const char *t = getenv("TMPDIR");
	if (!t) t = "/tmp";
	if (!buf || n == 0) return (DWORD)strlen(t) + 1;
	strncpy(buf, t, n - 1);
	buf[n - 1] = 0;
	size_t L = strlen(buf);
	if (L + 1 < n && buf[L - 1] != '/') { buf[L] = '/'; buf[L + 1] = 0; ++L; }
	return (DWORD)L;
}
static inline UINT GetTempFileNameA(LPCSTR path, LPCSTR pfx, UINT unique, LPSTR out)
{
	snprintf(out, MAX_PATH, "%s/%s%x.tmp", path ? path : "/tmp", pfx ? pfx : "lt", unique ? unique : (UINT)getpid());
	return 1;
}

static inline void GlobalMemoryStatus(LPMEMORYSTATUS ms)
{
	if (!ms) return;
	memset(ms, 0, sizeof(*ms));
	ms->dwLength = sizeof(*ms);
	ms->dwTotalPhys = 1u << 30;
	ms->dwAvailPhys = 1u << 29;
}

static inline int MultiByteToWideChar(UINT, DWORD, LPCSTR src, int slen, LPWSTR dst, int dlen)
{
	(void)slen;
	if (!src) return 0;
	int n = 0;
	while (src[n]) ++n;
	if (!dst || dlen == 0) return n + 1;
	int i;
	for (i = 0; i < n && i < dlen - 1; ++i) dst[i] = (WCHAR)(unsigned char)src[i];
	if (i < dlen) dst[i] = 0;
	return i;
}
static inline int WideCharToMultiByte(UINT, DWORD, LPCWSTR src, int slen, LPSTR dst, int dlen, LPCSTR, LPBOOL)
{
	(void)slen;
	if (!src) return 0;
	int n = 0;
	while (src[n]) ++n;
	if (!dst || dlen == 0) return n + 1;
	int i;
	for (i = 0; i < n && i < dlen - 1; ++i) dst[i] = (char)(src[i] & 0xFF);
	if (i < dlen) dst[i] = 0;
	return i;
}

#ifndef CP_ACP
#define CP_ACP 0
#define CP_UTF8 65001
#endif

static inline DWORD GetFileAttributesA(LPCSTR path)
{
	struct stat st;
	if (stat(path, &st) != 0) return INVALID_FILE_ATTRIBUTES;
	DWORD a = 0;
	if (S_ISDIR(st.st_mode)) a |= FILE_ATTRIBUTE_DIRECTORY;
	return a;
}

static inline BOOL DeleteFileA(LPCSTR path) { return unlink(path) == 0; }
static inline BOOL DeleteFile(LPCSTR path) { return DeleteFileA(path); }
static inline BOOL RemoveDirectoryA(LPCSTR path) { return rmdir(path) == 0; }
static inline BOOL RemoveDirectory(LPCSTR path) { return RemoveDirectoryA(path); }

static inline LONG RegCloseKey(HKEY) { return ERROR_SUCCESS; }
static inline LONG RegCreateKeyA(HKEY, LPCSTR, HKEY *out)
{
	if (out) *out = (HKEY)(uintptr_t)1;
	return ERROR_SUCCESS;
}
static inline LONG RegCreateKeyExA(HKEY, LPCSTR, DWORD, LPSTR, DWORD, DWORD, LPSECURITY_ATTRIBUTES, HKEY *out, LPDWORD)
{
	if (out) *out = (HKEY)(uintptr_t)1;
	return ERROR_SUCCESS;
}
static inline LONG RegOpenKeyExA(HKEY, LPCSTR, DWORD, DWORD, HKEY *out)
{
	if (out) *out = (HKEY)(uintptr_t)1;
	return ERROR_SUCCESS;
}
static inline LONG RegSetValueExA(HKEY, LPCSTR, DWORD, DWORD, const BYTE *, DWORD) { return ERROR_SUCCESS; }
static inline LONG RegQueryValueExA(HKEY, LPCSTR, LPDWORD, LPDWORD type, LPBYTE data, LPDWORD n)
{
	if (type) *type = REG_SZ;
	if (data && n && *n) data[0] = 0;
	if (n) *n = 1;
	return ERROR_FILE_NOT_FOUND;
}

#ifndef VK_TILDE
#define VK_OEM_3 0xC0
#define VK_TILDE VK_OEM_3
#endif
#ifndef VK_TAB
#define VK_TAB 0x09
#define VK_BACK 0x08
#define VK_CAPITAL 0x14
#define VK_PAUSE 0x13
#define VK_PRIOR 0x21
#define VK_NEXT 0x22
#define VK_END 0x23
#define VK_HOME 0x24
#define VK_INSERT 0x2D
#define VK_DELETE 0x2E
#define VK_LSHIFT 0xA0
#define VK_RSHIFT 0xA1
#define VK_LCONTROL 0xA2
#define VK_RCONTROL 0xA3
#define VK_LMENU 0xA4
#define VK_RMENU 0xA5
#define VK_F2 0x71
#define VK_F3 0x72
#define VK_F4 0x73
#define VK_F5 0x74
#define VK_F6 0x75
#define VK_F7 0x76
#define VK_F9 0x78
#define VK_F10 0x79
#define VK_F11 0x7A
#define VK_F12 0x7B
#endif

typedef struct _SYSTEM_INFO {
	union {
		DWORD dwOemId;
		struct {
			WORD wProcessorArchitecture;
			WORD wReserved;
		} DUMMYSTRUCTNAME;
	};
	DWORD dwPageSize;
	LPVOID lpMinimumApplicationAddress;
	LPVOID lpMaximumApplicationAddress;
	DWORD_PTR dwActiveProcessorMask;
	DWORD dwNumberOfProcessors;
	DWORD dwProcessorType;
	DWORD dwAllocationGranularity;
	WORD wProcessorLevel;
	WORD wProcessorRevision;
} SYSTEM_INFO, *LPSYSTEM_INFO;

static inline HWND SetFocus(HWND h) { return h; }
static inline BOOL SetWindowPos(HWND, HWND, int, int, int, int, UINT) { return TRUE; }
static inline BOOL GetWindowRect(HWND, LPRECT r)
{
	if (r) { r->left = 0; r->top = 0; r->right = 1024; r->bottom = 768; }
	return TRUE;
}
static inline BOOL ClipCursor(const RECT *) { return TRUE; }
static inline BOOL SetCursorPos(int, int) { return TRUE; }
static inline BOOL PeekMessage(LPMSG, HWND, UINT, UINT, UINT) { return FALSE; }
static inline void PostQuitMessage(int) {}
static inline void GetSystemInfo(LPSYSTEM_INFO si)
{
	if (!si) return;
	memset(si, 0, sizeof(*si));
	si->dwNumberOfProcessors = 1;
	si->dwPageSize = 4096;
}
static inline DWORD GetCurrentDirectoryA(DWORD n, LPSTR buf)
{
	if (!buf || n == 0) return 0;
	if (!getcwd(buf, n)) { buf[0] = 0; return 0; }
	return (DWORD)strlen(buf);
}
static inline DWORD GetCurrentDirectory(DWORD n, LPSTR buf) { return GetCurrentDirectoryA(n, buf); }
static inline BOOL SetCurrentDirectoryA(LPCSTR p) { return p && chdir(p) == 0; }
static inline BOOL SetCurrentDirectory(LPCSTR p) { return SetCurrentDirectoryA(p); }
static inline DWORD SetClassLong(HWND, int, LONG) { return 0; }
static inline HCURSOR SetCursor(HCURSOR c) { return c; }
static inline HCURSOR LoadCursor(HINSTANCE, LPCSTR) { return (HCURSOR)(uintptr_t)1; }
static inline int ReleaseDC(HWND, HDC) { return 1; }
static inline HDC GetDC(HWND) { return (HDC)(uintptr_t)1; }

#ifndef GCL_HCURSOR
#define GCL_HCURSOR -12
#endif
#ifndef IDC_ARROW
#define IDC_ARROW ((LPCSTR)(uintptr_t)32512)
#endif

#ifndef HRSRC
typedef void *HRSRC;
#endif
#ifndef MAKEINTRESOURCE
#define MAKEINTRESOURCE(i) ((LPCSTR)(uintptr_t)(WORD)(i))
#endif
#ifndef RT_RCDATA
#define RT_RCDATA ((LPCSTR)(uintptr_t)10)
#endif

#ifndef FARPROC
typedef INT_PTR (*FARPROC)();
#endif
#ifndef WNDPROC
typedef LRESULT (*WNDPROC)(HWND, UINT, WPARAM, LPARAM);
#endif

#ifndef WM_LBUTTONDOWN
#define WM_LBUTTONDOWN 0x0201
#define WM_LBUTTONUP 0x0202
#define WM_LBUTTONDBLCLK 0x0203
#define WM_RBUTTONDOWN 0x0204
#define WM_RBUTTONUP 0x0205
#define WM_RBUTTONDBLCLK 0x0206
#define WM_MOUSEMOVE 0x0200
#define WM_SETCURSOR 0x0020
#define WM_CHAR 0x0102
#endif
#ifndef SW_NORMAL
#define SW_NORMAL 1
#endif
#ifndef GWL_STYLE
#define GWL_STYLE -16
#define GWLP_WNDPROC -4
#endif
#ifndef WS_VISIBLE
#define WS_VISIBLE 0x10000000L
#endif
#ifndef SWP_FRAMECHANGED
#define SWP_FRAMECHANGED 0x0020
#endif
#ifndef HWND_NOTOPMOST
#define HWND_NOTOPMOST ((HWND)(intptr_t)-2)
#endif
#ifndef LB_ERR
#define LB_ERR (-1)
#define LB_ADDSTRING 0x0180
#define LB_DELETESTRING 0x0182
#define LB_RESETCONTENT 0x0184
#define LB_GETCURSEL 0x0188
#define LB_GETTEXT 0x018A
#endif
#ifndef WM_SETREDRAW
#define WM_SETREDRAW 0x000B
#endif
#ifndef WAIT_OBJECT_0
#define WAIT_OBJECT_0 0
#define WAIT_TIMEOUT 258
#endif

typedef struct _PROCESS_INFORMATION {
	HANDLE hProcess;
	HANDLE hThread;
	DWORD dwProcessId;
	DWORD dwThreadId;
} PROCESS_INFORMATION, *LPPROCESS_INFORMATION;

typedef struct _STARTUPINFOA {
	DWORD cb;
	LPSTR lpReserved;
	LPSTR lpDesktop;
	LPSTR lpTitle;
	DWORD dwX, dwY, dwXSize, dwYSize;
	DWORD dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
	WORD wShowWindow, cbReserved2;
	LPBYTE lpReserved2;
	HANDLE hStdInput, hStdOutput, hStdError;
} STARTUPINFOA, STARTUPINFO, *LPSTARTUPINFOA, *LPSTARTUPINFO;

static inline HWND GetDesktopWindow(void) { return NULL; }
static inline LONG SetWindowLong(HWND, int, LONG) { return 0; }
static inline LONG_PTR SetWindowLongPtr(HWND, int, LONG_PTR) { return 0; }
static inline LONG_PTR GetWindowLongPtr(HWND, int) { return 0; }
static inline LRESULT CallWindowProc(FARPROC, HWND, UINT, WPARAM, LPARAM) { return 0; }
static inline BOOL CreateProcessA(LPCSTR, LPSTR, LPVOID, LPVOID, BOOL, DWORD, LPVOID, LPCSTR, LPSTARTUPINFO, LPPROCESS_INFORMATION)
{ return FALSE; }
static inline BOOL CreateProcess(LPCSTR a, LPSTR b, LPVOID c, LPVOID d, BOOL e, DWORD f, LPVOID g, LPCSTR h, LPSTARTUPINFO i, LPPROCESS_INFORMATION j)
{ return CreateProcessA(a, b, c, d, e, f, g, h, i, j); }
static inline LRESULT SendMessage(HWND, UINT, WPARAM, LPARAM) { return 0; }
static inline BOOL InvalidateRect(HWND, const RECT *, BOOL) { return TRUE; }
static inline BOOL UpdateWindow(HWND) { return TRUE; }
static inline BOOL SetWindowTextA(HWND, LPCSTR) { return TRUE; }
static inline BOOL SetWindowText(HWND h, LPCSTR s) { return SetWindowTextA(h, s); }
static inline HANDLE CreateEventA(LPSECURITY_ATTRIBUTES, BOOL, BOOL, LPCSTR)
{
	int *ev = (int *)calloc(1, sizeof(int));
	return ev;
}
static inline HANDLE CreateEvent(LPSECURITY_ATTRIBUTES a, BOOL m, BOOL i, LPCSTR n)
{ return CreateEventA(a, m, i, n); }
static inline BOOL SetEvent(HANDLE h) { if (h) *(int *)h = 1; return TRUE; }
static inline BOOL ResetEvent(HANDLE h) { if (h) *(int *)h = 0; return TRUE; }
static inline DWORD WaitForSingleObject(HANDLE h, DWORD ms)
{
	(void)ms;
	if (h && *(int *)h) return WAIT_OBJECT_0;
	return WAIT_TIMEOUT;
}
static inline HANDLE CreateThread(LPSECURITY_ATTRIBUTES, size_t, void *, void *, DWORD, unsigned long *)
{ return NULL; }
static inline BOOL DeleteObject(HGDIOBJ obj) { free(obj); return TRUE; }
static inline HRESULT CoCreateGuid(GUID *g)
{
	if (!g) return E_FAIL;
	memset(g, 0, sizeof(*g));
	g->Data1 = (DWORD)time(NULL);
	g->Data2 = (WORD)getpid();
	return S_OK;
}

#ifdef __cplusplus
}
#endif

#ifdef __cplusplus
#ifndef _wcsicmp
inline int _wcsicmp(const wchar_t *a, const wchar_t *b)
{
	if (!a || !b) return a == b ? 0 : (a ? 1 : -1);
	while (*a && *b) {
		wchar_t ca = *a >= L'A' && *a <= L'Z' ? (*a + 32) : *a;
		wchar_t cb = *b >= L'A' && *b <= L'Z' ? (*b + 32) : *b;
		if (ca != cb) return ca < cb ? -1 : 1;
		++a; ++b;
	}
	return *a == *b ? 0 : (*a ? 1 : -1);
}
#endif
#endif

static inline void _splitpath(const char *path, char *drive, char *dir, char *fname, char *ext)
{
	if (drive) drive[0] = '\0';
	if (dir) dir[0] = '\0';
	if (fname) fname[0] = '\0';
	if (ext) ext[0] = '\0';
	if (!path) return;

	if (drive && path[0] && path[1] == ':') {
		drive[0] = path[0];
		drive[1] = ':';
		drive[2] = '\0';
		path += 2;
	}

	const char *slash = strrchr(path, '/');
	const char *bslash = strrchr(path, '\\');
	if (bslash && (!slash || bslash > slash)) slash = bslash;

	const char *base = path;
	if (slash) {
		if (dir) {
			size_t n = (size_t)(slash - path + 1);
			if (n > _MAX_DIR) n = _MAX_DIR;
			memcpy(dir, path, n);
			dir[n] = '\0';
		}
		base = slash + 1;
	}

	const char *dot = strrchr(base, '.');
	if (dot && dot != base) {
		if (fname) {
			size_t n = (size_t)(dot - base);
			if (n >= _MAX_FNAME) n = _MAX_FNAME - 1;
			memcpy(fname, base, n);
			fname[n] = '\0';
		}
		if (ext) {
			strncpy(ext, dot, _MAX_EXT - 1);
			ext[_MAX_EXT - 1] = '\0';
		}
	} else if (fname) {
		strncpy(fname, base, _MAX_FNAME - 1);
		fname[_MAX_FNAME - 1] = '\0';
	}
}

#ifndef timeGetTime
static inline DWORD timeGetTime(void) { return GetTickCount(); }
#endif

#ifndef MMRESULT
typedef UINT MMRESULT;
#endif

#endif /* PORT_WINDOWS_H */
