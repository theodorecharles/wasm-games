#include "bdefs.h"

#include "stringmgr.h"
#include "render.h"
#include "sysfile.h"
#include "de_objects.h"
#include "servermgr.h"
#include "classbind.h"
#include "bindmgr.h"
#include "console.h"
#include "clientmgr.h"
#include "iclientshell.h"
#include "iltclient.h"
#include "client_filemgr.h"
#include "server_filemgr.h"
#include "syslibraryloader.h"

#include <dlfcn.h>
#include <errno.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>
#include <sys/select.h>
#include <sys/time.h>
#include <unistd.h>

static IServerFileMgr *server_filemgr;
define_holder(IServerFileMgr, server_filemgr);

static IClientFileMgr *client_file_mgr;
define_holder(IClientFileMgr, client_file_mgr);

static ILTClient *ilt_client;
define_holder(ILTClient, ilt_client);

static IClientShell *i_client_shell;
define_holder(IClientShell, i_client_shell);

static IInstanceHandleClient *instance_handle_client;
define_holder(IInstanceHandleClient, instance_handle_client);

static IInstanceHandleServer *instance_handle_server;
define_holder(IInstanceHandleServer, instance_handle_server);

static ILTServer *ilt_server;
define_holder(ILTServer, ilt_server);

ClientGlob g_ClientGlob;

extern RMode g_RMode;
extern RMode* rdll_GetSupportedModes();
extern void rdll_FreeModeList(RMode *pModes);

void dsi_OnReturnError(int err)
{
	if (g_ClientGlob.m_bBreakOnError)
		fprintf(stderr, "dsi_OnReturnError(%d)\n", err);
}

static void *g_hResourceModule = 0;

int dsi_Init()
{
	memset(&g_ClientGlob, 0, sizeof(g_ClientGlob));
	g_ClientGlob.m_bConsoleEnabled = true;
	g_ClientGlob.m_bInputEnabled = 1;
	g_ClientGlob.m_bClientActive = 1;
	g_ClientGlob.m_WndClassName = (char*)"LithTech";
	g_ClientGlob.m_WndCaption = "No One Lives Forever 2";

	dm_Init();
	str_Init();
	df_Init();
	return 0;
}

void dsi_Term()
{
	df_Term();
	str_Term();
	dm_Term();
}

void* dsi_GetResourceModule()
{
	return g_hResourceModule;
}

LTRESULT dsi_SetupMessage(char *pMsg, int maxMsgLen, uint32 dResult, va_list marker)
{
	if (!pMsg || maxMsgLen <= 0)
		return LT_ERROR;
	LTSNPrintF(pMsg, maxMsgLen, "LTRESULT 0x%08x", (unsigned)dResult);
	(void)marker;
	return LT_OK;
}

void dsi_Sleep(uint32 ms)
{
	if (!ms)
		return;
	timeval timeout;
	timeout.tv_sec = (time_t)(ms / 1000);
	timeout.tv_usec = (suseconds_t)((ms % 1000) * 1000);
	select(0, NULL, NULL, NULL, &timeout);
}

void dsi_ServerSleep(uint32 ms) { dsi_Sleep(ms); }
void dsi_ClientSleep(uint32 ms) { dsi_Sleep(ms); }

void dsi_OnMemoryFailure()
{
	fprintf(stderr, "dsi_OnMemoryFailure\n");
	abort();
}

static RMode* CopyModeList(RMode *pListHead)
{
	RMode *pOut = LTNULL;
	for (RMode *pCur = pListHead; pCur; pCur = pCur->m_pNext) {
		RMode *pCopy;
		LT_MEM_TRACK_ALLOC(pCopy = (RMode*)dalloc(sizeof(RMode)), LT_MEM_TYPE_MISC);
		memcpy(pCopy, pCur, sizeof(RMode));
		pCopy->m_pNext = pOut;
		pOut = pCopy;
	}
	return pOut;
}

RMode* dsi_GetRenderModes()
{
	RMode *pList = rdll_GetSupportedModes();
	RMode *pCopy = CopyModeList(pList);
	rdll_FreeModeList(pList);
	return pCopy;
}

void dsi_RelinquishRenderModes(RMode *pMode)
{
	while (pMode) {
		RMode *pNext = pMode->m_pNext;
		dfree(pMode);
		pMode = pNext;
	}
}

LTRESULT dsi_GetRenderMode(RMode *pMode)
{
	if (!pMode)
		return LT_ERROR;
	memcpy(pMode, &g_RMode, sizeof(RMode));
	return LT_OK;
}

LTRESULT dsi_SetRenderMode(RMode *pMode)
{
	RMode currentMode;
	if (r_TermRender(1, false) != LT_OK) {
		dsi_OnClientShutdown((char*)"Unable to restore video");
		RETURN_ERROR(0, SetRenderMode, LT_UNABLETORESTOREVIDEO);
	}

	memcpy(&currentMode, &g_RMode, sizeof(RMode));
	if (r_InitRender(pMode) != LT_OK) {
		if (r_InitRender(&currentMode) != LT_OK)
			RETURN_ERROR(0, SetRenderMode, LT_UNABLETORESTOREVIDEO);
		RETURN_ERROR(1, SetRenderMode, LT_KEPTSAMEMODE);
	}

	g_ClientGlob.m_bRendererShutdown = 0;
	return LT_OK;
}

LTRESULT dsi_ShutdownRender(uint32 flags)
{
	r_TermRender(1, true);
	(void)flags;
	g_ClientGlob.m_bRendererShutdown = 1;
	return LT_OK;
}

static LTRESULT CopyIdentToTemp(FileIdentifier *pIdent, const char *pszFilename,
	char *pszOutName, int outNameLen, bool &bFileCopied)
{
	bFileCopied = false;
	if (!pIdent)
		return LT_ERROR;

	if (df_GetTreeType(pIdent->m_hFileTree) == DosTree ||
		df_GetTreeType(pIdent->m_hFileTree) == UnixTree)
	{
		if (df_GetFullFilename(pIdent->m_hFileTree, (char*)pszFilename, pszOutName, outNameLen))
			return LT_OK;
	}

	char szTempPath[MAX_PATH];
	const char *tmp = getenv("TMPDIR");
	if (!tmp) tmp = "/tmp";
	LTSNPrintF(szTempPath, sizeof(szTempPath), "%s", tmp);

	char leaf[MAX_PATH];
	const char *slash = strrchr(pszFilename, '\\');
	if (!slash) slash = strrchr(pszFilename, '/');
	LTSNPrintF(leaf, sizeof(leaf), "%s", slash ? slash + 1 : pszFilename);
	LTSNPrintF(pszOutName, outNameLen, "%s/%s", szTempPath, leaf);

	if (client_file_mgr->CopyFile(pszFilename, pszOutName) != LT_OK)
		return LT_ERRORCOPYINGFILE;
	bFileCopied = true;
	return LT_OK;
}

LTRESULT GetOrCopyFile(char const* pszTempPath, char const* pszFilename,
	char* pszOutName, int outNameLen, bool& bFileCopied)
{
	(void)pszTempPath;
	bFileCopied = false;
	if (!pszFilename || !pszOutName)
		return LT_ERROR;

	if (access(pszFilename, R_OK) == 0) {
		LTStrCpy(pszOutName, pszFilename, outNameLen);
		return LT_OK;
	}

	if (server_filemgr && server_filemgr->DoesFileExist(pszFilename, LTNULL, LTNULL)) {
		char szTempPath[MAX_PATH];
		const char *tmp = getenv("TMPDIR");
		if (!tmp) tmp = "/tmp";
		LTSNPrintF(szTempPath, sizeof(szTempPath), "%s", tmp);
		const char *slash = strrchr(pszFilename, '\\');
		if (!slash) slash = strrchr(pszFilename, '/');
		LTSNPrintF(pszOutName, outNameLen, "%s/%s", szTempPath, slash ? slash + 1 : pszFilename);
		if (server_filemgr->CopyFile((char*)pszFilename, pszOutName) != LT_OK)
			return LT_ERRORCOPYINGFILE;
		bFileCopied = true;
		return LT_OK;
	}

	return LT_ERRORCOPYINGFILE;
}

LTRESULT GetOrCopyClientFile(char const* pszFilename, char* pszOutName,
	int outNameLen, bool& bFileCopied)
{
	bFileCopied = false;
	FileRef ref;
	ref.m_FileType = FILE_ANYFILE;
	ref.m_pFilename = (char*)pszFilename;
	FileIdentifier *pIdent = client_file_mgr->GetFileIdentifier(&ref, TYPECODE_UNKNOWN);
	if (pIdent)
		return CopyIdentToTemp(pIdent, pszFilename, pszOutName, outNameLen, bFileCopied);

	if (access(pszFilename, R_OK) == 0) {
		LTStrCpy(pszOutName, pszFilename, outNameLen);
		return LT_OK;
	}
	return LT_ERRORCOPYINGFILE;
}

typedef ClassDef** (*ObjectDLLSetupFn)(int *nDefs, void *pServer, int *version);

LTRESULT dsi_LoadServerObjects(CClassMgr *pInfo)
{
	if (!pInfo)
		return LT_ERROR;

	int version = 0;
	void *self = LTLibraryLoader::GetMainHandle();
	ObjectDLLSetupFn fn = (ObjectDLLSetupFn)LTLibraryLoader::GetProcAddress(self, "ObjectDLLSetup");
	if (fn) {
		pInfo->m_ClassModule.m_hModule = bm_CreateHandleBinding("", self);
		pInfo->m_ClassModule.m_pClassDefs = fn(&pInfo->m_ClassModule.m_nClassDefs, ilt_server, &version);
		fprintf(stderr, "dsi_LoadServerObjects: ObjectDLLSetup defs=%d version=%d\n",
			pInfo->m_ClassModule.m_nClassDefs, version);
		if (version != SERVEROBJ_VERSION)
			return LT_INVALIDOBJECTDLLVERSION;
		if (instance_handle_server)
			instance_handle_server->SetInstanceHandle(pInfo->m_ClassModule.m_hModule);
		return LT_OK;
	}
	fprintf(stderr, "dsi_LoadServerObjects: ObjectDLLSetup not in main exe, trying .so\n");

	const char *names[] = { "libobject.so", "object.lto", "Object.lto", NULL };
	int i;
	for (i = 0; names[i]; ++i) {
		int status = cb_LoadModule(names[i], false, pInfo->m_ClassModule, &version);
		if (status == CB_NOERROR) {
			if (instance_handle_server)
				instance_handle_server->SetInstanceHandle(pInfo->m_ClassModule.m_hModule);
			return LT_OK;
		}
		if (status == CB_VERSIONMISMATCH)
			return LT_INVALIDOBJECTDLLVERSION;
	}

	return LT_INVALIDOBJECTDLL;
}

LTRESULT dsi_InitClientShellDE()
{
	if (g_pClientMgr) {
		g_pClientMgr->m_hClientResourceModule = LTNULL;
		g_pClientMgr->m_hLocalizedClientResourceModule = LTNULL;
		g_pClientMgr->m_hShellModule = LTNULL;
	}

	if (i_client_shell != NULL) {
		if (instance_handle_client)
			instance_handle_client->SetInstanceHandle(LTLibraryLoader::GetMainHandle());
		/* Static cres_loadstring.cpp ignores the module handle; it only
		   needs a non-NULL pointer so GetEngineHook("cres_hinstance") works. */
		if (g_pClientMgr && !g_pClientMgr->m_hClientResourceModule)
			g_pClientMgr->m_hClientResourceModule =
				bm_CreateHandleBinding("", LTLibraryLoader::GetMainHandle());
		return LT_OK;
	}

	const char *names[] = { "libCShell.so", "libcshell.so", "cshell.dll", NULL };
	int i;
	for (i = 0; names[i]; ++i) {
		int status = BIND_CANTFINDMODULE;
		if (g_pClientMgr)
			status = bm_BindModule(names[i], false, g_pClientMgr->m_hShellModule);
		if (status == BIND_NOERROR && i_client_shell != NULL) {
			if (instance_handle_client)
				instance_handle_client->SetInstanceHandle(g_pClientMgr->m_hShellModule);
			return LT_OK;
		}
	}

	if (g_pClientMgr)
		g_pClientMgr->SetupError(LT_MISSINGSHELLDLL, "libCShell.so");
	RETURN_ERROR(1, InitClientShellDE, LT_MISSINGSHELLDLL);
}

LTBOOL dsi_IsInputEnabled()
{
	return g_ClientGlob.m_bInputEnabled ? LTTRUE : LTFALSE;
}

uint16 dsi_NumKeyDowns() { return g_ClientGlob.m_nKeyDowns; }
uint16 dsi_NumKeyUps() { return g_ClientGlob.m_nKeyUps; }

uint32 dsi_GetKeyDown(uint32 i)
{
	return (i < MAX_KEYBUFFER) ? g_ClientGlob.m_KeyDowns[i] : 0;
}

uint32 dsi_GetKeyDownRep(uint32 i)
{
	return (i < MAX_KEYBUFFER) ? (uint32)g_ClientGlob.m_KeyDownReps[i] : 0;
}

uint32 dsi_GetKeyUp(uint32 i)
{
	return (i < MAX_KEYBUFFER) ? g_ClientGlob.m_KeyUps[i] : 0;
}

void dsi_ClearKeyDowns() { g_ClientGlob.m_nKeyDowns = 0; }
void dsi_ClearKeyUps() { g_ClientGlob.m_nKeyUps = 0; }
void dsi_ClearKeyMessages() {}

LTBOOL dsi_IsConsoleUp()
{
	if (!dsi_IsConsoleEnabled())
		return LTFALSE;
	return g_ClientGlob.m_bIsConsoleUp ? LTTRUE : LTFALSE;
}

void dsi_SetConsoleUp(LTBOOL bUp)
{
	g_ClientGlob.m_bIsConsoleUp = bUp ? 1 : 0;
}

void dsi_SetConsoleEnable(bool bEnabled)
{
	g_ClientGlob.m_bConsoleEnabled = bEnabled;
	if (!bEnabled)
		dsi_SetConsoleUp(LTFALSE);
}

bool dsi_IsConsoleEnabled()
{
	return g_ClientGlob.m_bConsoleEnabled;
}

LTBOOL dsi_IsClientActive()
{
	return g_ClientGlob.m_bClientActive ? LTTRUE : LTFALSE;
}

void dsi_OnClientShutdown(char *pMsg)
{
	if (pMsg && pMsg[0])
		LTStrCpy(g_ClientGlob.m_ExitMessage, pMsg, sizeof(g_ClientGlob.m_ExitMessage));
	else
		g_ClientGlob.m_ExitMessage[0] = 0;
	g_ClientGlob.m_bAppClosing = 1;
	g_ClientGlob.m_bProcessWindowMessages = 0;
}

char* dsi_GetDefaultWorld()
{
	return (char*)g_ClientGlob.m_pWorldName;
}

void dsi_PrintToConsole(const char *pMsg, ...)
{
	char msg[1024];
	va_list marker;
	va_start(marker, pMsg);
	vsnprintf(msg, sizeof(msg) - 2, pMsg, marker);
	va_end(marker);

	size_t len = strlen(msg);
	if (len == 0 || msg[len - 1] != '\n') {
		msg[len] = '\n';
		msg[len + 1] = 0;
	}
	fputs(msg, stderr);

#ifdef DE_CLIENT_COMPILE
	con_PrintString(CONRGB(255, 255, 0), 0, msg);
#endif
}

void* dsi_GetInstanceHandle()
{
	return g_ClientGlob.m_hInstance;
}

void* dsi_GetMainWindow()
{
	return g_ClientGlob.m_hMainWnd;
}

LTRESULT dsi_DoErrorMessage(char *pMessage)
{
	fprintf(stderr, "ERROR: %s\n", pMessage ? pMessage : "");
#ifdef DE_CLIENT_COMPILE
	con_PrintString(CONRGB(255, 255, 255), 0, pMessage);
#endif
	return LT_OK;
}

void dsi_MessageBox(char *pMsg, char *pTitle)
{
	fprintf(stderr, "MessageBox [%s]: %s\n", pTitle ? pTitle : "", pMsg ? pMsg : "");
}

LTRESULT dsi_GetVersionInfo(LTVersionInfo &info)
{
	info.m_MajorVersion = 86;
	info.m_MinorVersion = 0;
	return LT_OK;
}
