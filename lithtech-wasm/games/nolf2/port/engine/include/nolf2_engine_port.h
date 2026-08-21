#ifndef NOLF2_ENGINE_PORT_H
#define NOLF2_ENGINE_PORT_H

/* Force-included for the Jupiter Linux host. */
#include "windows.h"
#include "mmsystem.h"
#include <setjmp.h>
#include <new>
#include <cwctype>

#ifndef INLINE_FN
#define INLINE_FN inline
#endif
#ifndef LT_MATH_HELPERS_DEFINED
#define LT_MATH_HELPERS_DEFINED
template<class T, class TB>
INLINE_FN T LTDIFF(T a, TB b) { return ((a < (T)b) ? ((T)b - a) : (a - (T)b)); }
template<class T, class TB>
INLINE_FN T LTMIN(T a, TB b) { return ((a < (T)b) ? a : (T)b); }
template<class T, class TB>
INLINE_FN T LTMAX(T a, TB b) { return ((a > (T)b) ? a : (T)b); }
template<class T>
INLINE_FN T LTABS(T a) { return ((a >= 0) ? a : -a); }
template<class T, class TB, class TC>
INLINE_FN T LTCLAMP(T a, TB min, TC max) { return ((a < (T)min) ? (T)min : ((a > (T)max) ? (T)max : a)); }
template<class T, class TMAX, class TINTERP>
INLINE_FN T LTLERP(T min, TMAX max, TINTERP t) { return (min + (((T)max - min) * t)); }
#endif

#ifndef VK_OEM_3
#define VK_OEM_3 0xC0
#endif

#ifndef MAX_KEYBUFFER
#define MAX_KEYBUFFER 100
#endif
#ifndef SOUND_DRIVER_NAME_LEN
#define SOUND_DRIVER_NAME_LEN 32
#endif
#ifndef SOUND_DRIVER_NAME_ARG
#define SOUND_DRIVER_NAME_ARG "+sounddll"
#endif

#ifndef NOLF2_CLIENTGLOB_DEFINED
#define NOLF2_CLIENTGLOB_DEFINED
class ClientGlob {
public:
	ClientGlob() {
		m_bIsConsoleUp = 0;
		m_bConsoleEnabled = true;
		m_bInputEnabled = 1;
		m_pGameResources = 0;
		m_pWorldName = 0;
	}
	int             m_bProcessWindowMessages;
	jmp_buf         m_MemoryJmp;
	void           *m_hMainWnd;
	void           *m_hInstance;
	char           *m_WndClassName;
	const char     *m_WndCaption;
	int             m_bInitializingRenderer;
	int             m_bBreakOnError;
	int             m_bClientActive;
	int             m_bLostFocus;
	int             m_bAppClosing;
	int             m_bDialogUp;
	int             m_bRendererShutdown;
	int             m_bHost;
	char           *m_pGameResources;
	const char     *m_pWorldName;
	char            m_CachePath[500];
	unsigned int    m_KeyDowns[MAX_KEYBUFFER];
	unsigned int    m_KeyUps[MAX_KEYBUFFER];
	int             m_KeyDownReps[MAX_KEYBUFFER];
	unsigned short  m_nKeyDowns;
	unsigned short  m_nKeyUps;
	int             m_bIsConsoleUp;
	int             m_bInputEnabled;
	char            m_ExitMessage[500];
	char            m_acSoundDriverName[SOUND_DRIVER_NAME_LEN];
	bool            m_bConsoleEnabled;
};
#ifndef g_ClientGlob
#ifdef __cplusplus
extern ClientGlob g_ClientGlob;
#endif
#endif
#endif

#ifdef __cplusplus
void dsi_SetConsoleEnable(bool bEnabled);
bool dsi_IsConsoleEnabled();
#ifndef __LTBASETYPES_H__
#include "ltbasetypes.h"
#endif
class LTVersionInfo;
LTRESULT dsi_GetVersionInfo(LTVersionInfo &info);
class CSoundMgr;
CSoundMgr *GetClientILTSoundMgrImpl();
#endif

#ifndef SCREEN_NEAR_Z
#define SCREEN_NEAR_Z 0.0
#endif

#ifndef CUI_SYSTEM_OPAQUE
#define CUI_SYSTEM_OPAQUE 0xFF000000
#endif
#ifndef CUI_DEFAULT_FONT_COLOR
#define CUI_DEFAULT_FONT_COLOR 0x00FFFFFF
#endif
#ifndef CUI_DEFAULT_WIDGET_COLOR
#define CUI_DEFAULT_WIDGET_COLOR 0x00FFFFFF
#endif

#ifndef LPDIRECTSOUND8
#ifndef LPDIRECTSOUND
typedef void *LPDIRECTSOUND;
#endif
typedef void *LPDIRECTSOUND8;
typedef void *LPDIRECTSOUNDBUFFER;
#ifndef PTDIRECTSOUND
#define PTDIRECTSOUND LPDIRECTSOUND
#endif
#endif

#ifdef __cplusplus
LTRESULT GetOrCopyClientFile(char const* pszFilename, char* pszOutName,
	int outNameLen, bool& bFileCopied);
#endif

#ifndef MAX_PATH
#define MAX_PATH 260
#endif

#ifndef _MAX_PATH
#define _MAX_PATH MAX_PATH
#endif

#endif
