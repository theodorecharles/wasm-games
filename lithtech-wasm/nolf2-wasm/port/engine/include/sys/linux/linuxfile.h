#ifndef __DE_FILE_H__
#define __DE_FILE_H__

#ifndef __ILTSTREAM_H__
#include "iltstream.h"
#endif

typedef void* HLTFileTree;

enum TreeType
{
	RezFileTree,
	DosTree,
	UnixTree
};

#define DIRECTORY_TYPE	0
#define FILE_TYPE		1
#define DFOPEN_READ	0

struct LTFindInfo
{
	int				m_Type;
	char			m_Name[256];
	uint32			m_Date;			// must match win/de_file.h (not unsigned long)
	uint32			m_Size;
	void			*m_pInternal;
};

void df_Init();
void df_Term();
int df_OpenTree(const char *pName, HLTFileTree *&pTreePointer);
void df_CloseTree(HLTFileTree *hTree);
TreeType df_GetTreeType(HLTFileTree *hTree);
bool df_GetFileInfo(HLTFileTree *hTree, const char *pName, LTFindInfo *pInfo);
int df_GetDirInfo(HLTFileTree *hTree, char *pName);
int df_GetFullFilename(HLTFileTree *hTree, char *pName, char *pOutName, int maxLen);
ILTStream* df_Open(HLTFileTree *hTree, const char *pName, int openMode=DFOPEN_READ);
int df_FindNext(HLTFileTree *hTree, const char *pDirName, LTFindInfo *pInfo);
void df_FindClose(LTFindInfo *pInfo);
int df_Save(ILTStream *hFile, const char *pName);
int df_GetRawInfo(HLTFileTree *hTree, const char *pName, char* sFileName, unsigned int nMaxFileName, uint32* nPos, uint32* nSize);

#endif
