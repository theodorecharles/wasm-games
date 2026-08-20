#include "bdefs.h"
#include "videomgr.h"
#include "musicdriver.h"
#include "version_info.h"
#include "systeminfo.h"

#include <unistd.h>
#include <string.h>

VideoMgr* CreateVideoMgr(const char *)
{
	return LTNULL;
}

musicdriver_status music_InitDriver(char *, SMusicMgr *pMusicMgr)
{
	if (pMusicMgr)
		memset(pMusicMgr, 0, sizeof(*pMusicMgr));
	return MUSICDRIVER_CANTLOADLIBRARY;
}

void music_TermDriver()
{
}

LTRESULT GetLTExeVersion(void *, LTVersionInfo &info)
{
	info.m_MajorVersion = 86;
	info.m_MinorVersion = 0;
	return LT_OK;
}

uint32 CSystemInfo::GetProcessorCount()
{
	long n = sysconf(_SC_NPROCESSORS_ONLN);
	return n > 0 ? (uint32)n : 1;
}
