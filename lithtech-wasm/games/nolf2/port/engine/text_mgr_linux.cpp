#include "bdefs.h"
#include "ltmodule.h"
#include "clientmgr.h"
#include "iltclient.h"
#include "sysclientde_impl.h"
#include "interface_helpers.h"
#include "text_mgr.h"
#include "stringmgr.h"

#include <string.h>

struct LTLinuxFont {
	int  m_nWidth;
	int  m_nHeight;
	int  m_nExtra;
	bool m_bBold;
	char m_szName[64];
};

static ILTClient *ilt_client;
define_holder(ILTClient, ilt_client);

static int FontCellWidth(const LTLinuxFont *pFont)
{
	if (!pFont)
		return 8;
	int w = pFont->m_nWidth;
	if (w <= 0)
		w = (pFont->m_nHeight * 3) / 5;
	if (w <= 0)
		w = 8;
	return w + pFont->m_nExtra;
}

static int FontCellHeight(const LTLinuxFont *pFont)
{
	if (!pFont || pFont->m_nHeight <= 0)
		return 12;
	return pFont->m_nHeight;
}

static HLTFONT tmgr_CreateFont(const char *pFontName, int width, int height,
	bool /*bItalic*/, bool /*bUnderline*/, bool bBold)
{
	LTLinuxFont *pFont = new LTLinuxFont;
	memset(pFont, 0, sizeof(*pFont));
	pFont->m_nWidth = width;
	pFont->m_nHeight = height;
	pFont->m_bBold = bBold;
	if (pFontName)
		strncpy(pFont->m_szName, pFontName, sizeof(pFont->m_szName) - 1);
	return (HLTFONT)pFont;
}

static void tmgr_DeleteFont(HLTFONT hFont)
{
	delete (LTLinuxFont *)hFont;
}

static LTRESULT tmgr_SetFontExtraSpace(HLTFONT hFont, int pixels)
{
	LTLinuxFont *pFont = (LTLinuxFont *)hFont;
	if (!pFont)
		return LT_ERROR;
	pFont->m_nExtra = pixels;
	return LT_OK;
}

static LTRESULT tmgr_GetFontExtraSpace(HLTFONT hFont, int &pixels)
{
	LTLinuxFont *pFont = (LTLinuxFont *)hFont;
	if (!pFont)
		return LT_ERROR;
	pixels = pFont->m_nExtra;
	return LT_OK;
}

static void tmgr_GetStringDimensions(HLTFONT hFont, HSTRING hString, int *sizeX, int *sizeY)
{
	if (!sizeX || !sizeY)
		return;
	if (!hFont || !hString) {
		*sizeX = *sizeY = 0;
		return;
	}
	int nChars = str_GetNumStringCharacters(hString);
	*sizeX = nChars * FontCellWidth((LTLinuxFont *)hFont);
	*sizeY = FontCellHeight((LTLinuxFont *)hFont);
}

static void tmgr_DrawStringToSurface(HSURFACE hDest, HLTFONT /*hFont*/, HSTRING /*hString*/,
	LTRect *pRect, HLTCOLOR /*hForeColor*/, HLTCOLOR hBackColor)
{
	if (!hDest || !ilt_client || !ilt_client->FillRect)
		return;
	ilt_client->FillRect(hDest, pRect, hBackColor);
}

static HSURFACE tmgr_CreateSurfaceFromString(HLTFONT hFont, HSTRING hString,
	HLTCOLOR /*hForeColor*/, HLTCOLOR hBackColor, int extraPixelsX, int extraPixelsY)
{
	int sx = 1, sy = 1;
	tmgr_GetStringDimensions(hFont, hString, &sx, &sy);
	sx += extraPixelsX;
	sy += extraPixelsY;
	if (sx < 1) sx = 1;
	if (sy < 1) sy = 1;

	if (!ilt_client || !ilt_client->CreateSurface)
		return LTNULL;
	HSURFACE hSurf = ilt_client->CreateSurface((uint32)sx, (uint32)sy);
	if (hSurf && ilt_client->FillRect)
		ilt_client->FillRect(hSurf, LTNULL, hBackColor);
	return hSurf;
}

void tmgr_Init()
{
	if (!ilt_client)
		return;
	ilt_client->CreateFont = tmgr_CreateFont;
	ilt_client->DeleteFont = tmgr_DeleteFont;
	ilt_client->SetFontExtraSpace = tmgr_SetFontExtraSpace;
	ilt_client->GetFontExtraSpace = tmgr_GetFontExtraSpace;
	ilt_client->GetStringDimensions = tmgr_GetStringDimensions;
	ilt_client->DrawStringToSurface = tmgr_DrawStringToSurface;
	ilt_client->CreateSurfaceFromString = tmgr_CreateSurfaceFromString;
}

void tmgr_Term()
{
}
