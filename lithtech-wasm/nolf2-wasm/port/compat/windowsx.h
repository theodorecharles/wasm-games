#ifndef PORT_WINDOWSX_H
#define PORT_WINDOWSX_H

#include "windows.h"

#ifndef GET_X_LPARAM
#define GET_X_LPARAM(lp) ((int)(short)LOWORD(lp))
#define GET_Y_LPARAM(lp) ((int)(short)HIWORD(lp))
#endif

#ifndef HANDLE_MSG
#define HANDLE_MSG(hwnd, message, fn) \
	case (message): return HANDLE_##message((hwnd), (wParam), (lParam), (fn))
#endif
#ifndef HANDLE_WM_LBUTTONUP
#define HANDLE_WM_LBUTTONUP(hwnd, wParam, lParam, fn) \
	((fn)((hwnd), (int)(short)LOWORD(lParam), (int)(short)HIWORD(lParam), (UINT)(wParam)), 0L)
#define HANDLE_WM_LBUTTONDOWN(hwnd, wParam, lParam, fn) \
	((fn)((hwnd), FALSE, (int)(short)LOWORD(lParam), (int)(short)HIWORD(lParam), (UINT)(wParam)), 0L)
#define HANDLE_WM_LBUTTONDBLCLK(hwnd, wParam, lParam, fn) \
	((fn)((hwnd), TRUE, (int)(short)LOWORD(lParam), (int)(short)HIWORD(lParam), (UINT)(wParam)), 0L)
#define HANDLE_WM_RBUTTONUP(hwnd, wParam, lParam, fn) \
	((fn)((hwnd), (int)(short)LOWORD(lParam), (int)(short)HIWORD(lParam), (UINT)(wParam)), 0L)
#define HANDLE_WM_RBUTTONDOWN(hwnd, wParam, lParam, fn) \
	((fn)((hwnd), FALSE, (int)(short)LOWORD(lParam), (int)(short)HIWORD(lParam), (UINT)(wParam)), 0L)
#define HANDLE_WM_RBUTTONDBLCLK(hwnd, wParam, lParam, fn) \
	((fn)((hwnd), TRUE, (int)(short)LOWORD(lParam), (int)(short)HIWORD(lParam), (UINT)(wParam)), 0L)
#define HANDLE_WM_MOUSEMOVE(hwnd, wParam, lParam, fn) \
	((fn)((hwnd), (int)(short)LOWORD(lParam), (int)(short)HIWORD(lParam), (UINT)(wParam)), 0L)
#define HANDLE_WM_CHAR(hwnd, wParam, lParam, fn) \
	((fn)((hwnd), (TCHAR)(wParam), (int)(short)LOWORD(lParam)), 0L)
#define HANDLE_WM_SETCURSOR(hwnd, wParam, lParam, fn) \
	(LRESULT)(DWORD)(BOOL)(fn)((hwnd), (HWND)(wParam), (UINT)LOWORD(lParam), (UINT)HIWORD(lParam))
#endif

#endif
