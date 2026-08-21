#include "stdafx.h"
#include "WinUtil.h"
#include "CommonUtilities.h"
#include "ltbasedefs.h"

#include <sys/stat.h>
#include <unistd.h>
#include <errno.h>
#include <time.h>
#include <stdio.h>
#include <string.h>
#include <direct.h>
#include <io.h>

static void PortNormalizeSlashes(char *path)
{
	if (!path) return;
	for (; *path; ++path) {
		if (*path == '\\') *path = '/';
	}
}

static void PortTrimTrailingSlash(char *path)
{
	size_t n;
	if (!path || !*path) return;
	n = strlen(path);
	while (n > 1 && path[n - 1] == '/') {
		path[--n] = '\0';
	}
}

BOOL CWinUtil::GetMoviesPath(char *strPath)
{
	char strTemp[256];
	char strFile[270];

	if (!strPath) return FALSE;
	strPath[0] = '\0';

	if (_getcwd(strTemp, 255)) {
		PortNormalizeSlashes(strTemp);
		if (strTemp[strlen(strTemp) - 1] != '/') strcat(strTemp, "/");
		SAFE_STRCPY(strFile, strTemp);
		strcat(strFile, "intro.smk");
		if (FileExist(strFile)) {
			SAFE_STRCPY(strPath, strTemp);
			return TRUE;
		}

		SAFE_STRCPY(strFile, strTemp);
		strcat(strFile, "Movies/");
		if (DirExist(strFile)) {
			SAFE_STRCPY(strPath, strFile);
			return TRUE;
		}
	}

	strPath[0] = '\0';
	return FALSE;
}

BOOL CWinUtil::DirExist(char const *strPath)
{
	struct stat statbuf;
	char szPath[MAX_PATH];

	if (!strPath || !*strPath) return FALSE;

	SAFE_STRCPY(szPath, strPath);
	PortNormalizeSlashes(szPath);
	PortTrimTrailingSlash(szPath);

	if (stat(szPath, &statbuf) != 0) return FALSE;
	return S_ISDIR(statbuf.st_mode) ? TRUE : FALSE;
}

BOOL CWinUtil::CreateDir(char const *strPath)
{
	char strPartialPath[MAX_PATH];
	char szPath[MAX_PATH];
	char *token;

	if (!strPath || !*strPath) return FALSE;
	if (DirExist(strPath)) return TRUE;
	if (strPath[strlen(strPath) - 1] == ':') return FALSE;

	SAFE_STRCPY(szPath, strPath);
	PortNormalizeSlashes(szPath);

	strPartialPath[0] = '\0';
	token = strtok(szPath, "/");
	while (token) {
		if (strPartialPath[0] == '\0' && strPath[0] == '/') {
			strcpy(strPartialPath, "/");
			strcat(strPartialPath, token);
		} else if (strPartialPath[0]) {
			strcat(strPartialPath, "/");
			strcat(strPartialPath, token);
		} else {
			strcpy(strPartialPath, token);
		}

		if (!DirExist(strPartialPath) && strPartialPath[strlen(strPartialPath) - 1] != ':') {
			if (!CreateDirectory(strPartialPath, NULL)) return FALSE;
		}
		token = strtok(NULL, "/");
	}

	return TRUE;
}

BOOL CWinUtil::FileExist(char const *strPath)
{
	struct stat statbuf;
	char szPath[MAX_PATH];

	if (!strPath || !*strPath) return FALSE;
	SAFE_STRCPY(szPath, strPath);
	PortNormalizeSlashes(szPath);
	if (stat(szPath, &statbuf) != 0) return FALSE;
	return S_ISREG(statbuf.st_mode) ? TRUE : FALSE;
}

BOOL CWinUtil::CopyDir(char const *pSrc, char const *pDest)
{
	char szDir[MAX_PATH];
	char szDestFile[MAX_PATH];
	char szFiles[MAX_PATH];
	char szSrc[MAX_PATH];
	struct _finddata_t file;
	long hFile;
	StringSet fileList;
	StringSet::iterator iter;

	if (!pSrc || !pDest) return FALSE;
	if (!DirExist(pSrc)) return FALSE;

	SAFE_STRCPY(szSrc, pSrc);
	PortNormalizeSlashes(szSrc);
	PortTrimTrailingSlash(szSrc);

	strcpy(szDir, pDest);
	PortNormalizeSlashes(szDir);
	if (!DirExist(szDir))
		CreateDir(szDir);

	sprintf(szFiles, "%s/*", szSrc);
	if ((hFile = _findfirst(szFiles, &file)) != -1L) {
		do {
			if (strcmp(file.name, ".") == 0 || strcmp(file.name, "..") == 0) continue;
			sprintf(szFiles, "%s/%s", szSrc, file.name);
			if (FileExist(szFiles))
				fileList.insert(file.name);
		} while (_findnext(hFile, &file) == 0);
		_findclose(hFile);
	}

	iter = fileList.begin();
	while (iter != fileList.end()) {
		sprintf(szFiles, "%s/%s", szSrc, iter->c_str());
		sprintf(szDestFile, "%s/%s", szDir, iter->c_str());
		if (!CopyFile(szFiles, szDestFile, FALSE))
			return FALSE;
		iter++;
	}

	return TRUE;
}

BOOL CWinUtil::EmptyDir(char const *pDir)
{
	char szFiles[MAX_PATH];
	char szDir[MAX_PATH];
	struct _finddata_t file;
	long hFile;
	StringSet fileList;
	StringSet::iterator iter;

	if (!pDir) return FALSE;
	if (!DirExist(pDir)) return FALSE;

	SAFE_STRCPY(szDir, pDir);
	PortNormalizeSlashes(szDir);
	PortTrimTrailingSlash(szDir);

	sprintf(szFiles, "%s/*", szDir);
	if ((hFile = _findfirst(szFiles, &file)) != -1L) {
		do {
			if (strcmp(file.name, ".") == 0 || strcmp(file.name, "..") == 0) continue;
			sprintf(szFiles, "%s/%s", szDir, file.name);
			fileList.insert(szFiles);
		} while (_findnext(hFile, &file) == 0);
		_findclose(hFile);
	}

	iter = fileList.begin();
	while (iter != fileList.end()) {
		remove(iter->c_str());
		iter++;
	}

	return TRUE;
}

BOOL CWinUtil::RemoveDir(char const *pDir)
{
	char szDir[MAX_PATH];

	if (!pDir) return FALSE;
	if (!DirExist(pDir)) return FALSE;
	if (!EmptyDir(pDir)) return FALSE;

	SAFE_STRCPY(szDir, pDir);
	PortNormalizeSlashes(szDir);
	PortTrimTrailingSlash(szDir);
	_rmdir(szDir);
	return TRUE;
}

DWORD CWinUtil::WinGetPrivateProfileString(const char *lpAppName, const char *lpKeyName,
	const char *lpDefault, char *lpReturnedString, DWORD nSize, const char *lpFileName)
{
	return GetPrivateProfileString(lpAppName, lpKeyName, lpDefault, lpReturnedString, nSize, lpFileName);
}

DWORD CWinUtil::WinWritePrivateProfileString(const char *lpAppName, const char *lpKeyName,
	const char *lpString, const char *lpFileName)
{
	return WritePrivateProfileString(lpAppName, lpKeyName, lpString, lpFileName);
}

void CWinUtil::DebugOut(char const *str)
{
	OutputDebugString(str);
}

void CWinUtil::DebugBreak()
{
	::DebugBreak();
}

float CWinUtil::GetTime()
{
	return (float)GetTickCount() / 1000.0f;
}

char *CWinUtil::GetFocusWindow()
{
	static char strText[128];
	HWND hWnd = GetFocus();
	if (!hWnd) {
		hWnd = GetForegroundWindow();
		if (!hWnd) return NULL;
	}
	GetWindowText(hWnd, strText, 127);
	return strText;
}

void CWinUtil::WriteToDebugFile(char const *strText)
{
	FILE *pFile;
	time_t seconds;
	struct tm timedate;
	char strTimeDate[128];

	if (!strText) return;
	pFile = fopen("/tmp/shodebug.txt", "a+t");
	if (!pFile) return;

	time(&seconds);
	if (!localtime_r(&seconds, &timedate)) {
		fclose(pFile);
		return;
	}

	sprintf(strTimeDate, "[%02d/%02d/%02d %02d:%02d:%02d]  ",
		timedate.tm_mon + 1, timedate.tm_mday, (timedate.tm_year + 1900) % 100,
		timedate.tm_hour, timedate.tm_min, timedate.tm_sec);
	fwrite(strTimeDate, strlen(strTimeDate), 1, pFile);
	fwrite(strText, strlen(strText), 1, pFile);
	fwrite("\n", 1, 1, pFile);
	fclose(pFile);
}
