#ifndef __DSYS_INTERFACE_H__
#define __DSYS_INTERFACE_H__

#include "windows.h"
#include "ltbasetypes.h"
#include "ltbasedefs.h"
#include "version_info.h"

#include <setjmp.h>
#include <stdarg.h>

class CClientMgr;
class CClassMgr;

#ifdef DE_CLIENT_COMPILE
#define MAX_KEYBUFFER           100
#define SOUND_DRIVER_NAME_LEN   32
#define SOUND_DRIVER_NAME_ARG   "+sounddll"

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

extern ClientGlob g_ClientGlob;
#endif

int dsi_Init();
void dsi_Term();
void dsi_OnReturnError(int err);

struct RMode;
RMode* dsi_GetRenderModes();
void dsi_RelinquishRenderModes(RMode *pMode);
LTRESULT dsi_GetRenderMode(RMode *pMode);
LTRESULT dsi_SetRenderMode(RMode *pMode);
LTRESULT dsi_ShutdownRender(uint32 flags);

LTRESULT dsi_InitClientShellDE();
LTRESULT dsi_LoadServerObjects(CClassMgr *pInfo);

void dsi_OnMemoryFailure();
void dsi_Sleep(uint32 ms);
void dsi_ServerSleep(uint32 ms);
void dsi_ClientSleep(uint32 ms);

LTBOOL dsi_IsInputEnabled();

uint16 dsi_NumKeyDowns();
uint16 dsi_NumKeyUps();
uint32 dsi_GetKeyDown(uint32 i);
uint32 dsi_GetKeyDownRep(uint32 i);
uint32 dsi_GetKeyUp(uint32 i);
void dsi_ClearKeyDowns();
void dsi_ClearKeyUps();
void dsi_ClearKeyMessages();

LTBOOL dsi_IsConsoleUp();
void dsi_SetConsoleUp(LTBOOL bUp);
void dsi_SetConsoleEnable(bool bEnabled);
bool dsi_IsConsoleEnabled();
LTBOOL dsi_IsClientActive();
void dsi_OnClientShutdown(char *pMsg);

const char* dsi_GetDefaultWorld();

LTRESULT dsi_SetupMessage(char *pMsg, int maxMsgLen, LTRESULT dResult, va_list marker);
LTRESULT dsi_DoErrorMessage(const char *pMessage);

LTRESULT GetOrCopyFile(char const* pszTempPath, char const* pszFilename,
	char* pszOutName, int outNameLen, bool& bFileCopied);
LTRESULT GetOrCopyClientFile(char const* pszFilename, char* pszOutName,
	int outNameLen, bool& bFileCopied);

void dsi_PrintToConsole(const char *pMsg, ...);

void* dsi_GetInstanceHandle();
void* dsi_GetResourceModule();
void* dsi_GetMainWindow();

void dsi_MessageBox(const char *pMsg, const char *pTitle);
LTRESULT dsi_GetVersionInfo(LTVersionInfo &info);

#endif
