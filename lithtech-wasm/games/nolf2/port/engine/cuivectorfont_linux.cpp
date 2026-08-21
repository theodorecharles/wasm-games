#include "bdefs.h"
#include "cuivectorfont.h"
#include "ilttexinterface.h"
#include "ltmodule.h"

#include <ft2build.h>
#include FT_FREETYPE_H

#include <math.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <vector>

static ILTTexInterface *pTexInterface = NULL;
define_holder(ILTTexInterface, pTexInterface);

class InstalledFontFace
{
public:
	InstalledFontFace() : m_nHeight(0) { m_szFile[0] = 0; }
	bool Init(char const *pszFontFile, char const *pszFontFace, int nHeight);
	const char *GetFile() const { return m_szFile; }
	int GetHeight() const { return m_nHeight; }

private:
	char m_szFile[260];
	int m_nHeight;
};

bool InstalledFontFace::Init(char const *pszFontFile, char const *pszFontFace, int nHeight)
{
	(void)pszFontFace;
	m_nHeight = nHeight > 0 ? nHeight : 12;
	m_szFile[0] = 0;

	if (pszFontFile && pszFontFile[0]) {
		bool copied = false;
		if (GetOrCopyClientFile(pszFontFile, m_szFile, sizeof(m_szFile), copied) == LT_OK &&
			m_szFile[0] && access(m_szFile, R_OK) == 0)
			return true;
	}

	static const char *const kFallbacks[] = {
		"/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
		"/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
		"/usr/share/fonts/truetype/freefont/FreeSans.ttf",
		"/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
		NULL
	};
	for (int i = 0; kFallbacks[i]; ++i) {
		if (access(kFallbacks[i], R_OK) == 0) {
			LTStrCpy(m_szFile, kFallbacks[i], sizeof(m_szFile));
			return true;
		}
	}
	return false;
}

static int NextPot(int n)
{
	int p = 32;
	while (p < n)
		p *= 2;
	if (p > 1024)
		p = 1024;
	return p;
}

struct CUIGlyphInfo {
	int w, h, left, top, adv;
	int atlasX, atlasY;
	std::vector<uint8> bits;
};

CUIVectorFont::CUIVectorFont() {}
CUIVectorFont::~CUIVectorFont() { Term(); }

bool CUIVectorFont::Init(char const *pszFontFile,
	char const *pszFontFace,
	uint32 pointSize,
	uint8 asciiStart,
	uint8 asciiEnd,
	LTFontParams *fontParams)
{
	char szChars[256];
	int i;
	int n = 0;
	for (i = asciiStart; i <= asciiEnd && n < 255; ++i)
		szChars[n++] = (char)i;
	szChars[n] = 0;
	return Init(pszFontFile, pszFontFace, pointSize, szChars, fontParams);
}

bool CUIVectorFont::Init(char const *pszFontFile,
	char const *pszFontFace,
	uint32 pointSize,
	char const *pszCharacters,
	LTFontParams *fontParams)
{
	(void)fontParams;
	if (!pszCharacters || !pszCharacters[0] || !pszFontFace || !pszFontFace[0])
		return false;

	Term();
	m_Proportional = true;
	m_PointSize = (int32)pointSize;

	InstalledFontFace face;
	if (!face.Init(pszFontFile, pszFontFace, (int)pointSize)) {
		fprintf(stderr, "CUIVectorFont: no font file for '%s' / '%s'\n",
			pszFontFile ? pszFontFile : "", pszFontFace);
		return false;
	}

	if (!CreateFontTextureAndTable(face, pszCharacters, true))
		return false;

	m_Valid = true;
	fprintf(stderr, "CUIVectorFont: %s face='%s' size=%u file=%s\n",
		pszFontFile ? pszFontFile : "", pszFontFace, pointSize, face.GetFile());
	return true;
}

void CUIVectorFont::Term()
{
	if (m_bAllocatedTable && m_pFontTable) {
		delete[] m_pFontTable;
		m_pFontTable = NULL;
	}
	if (m_bAllocatedMap && m_pFontMap) {
		delete[] m_pFontMap;
		m_pFontMap = NULL;
	}
	if (m_Texture && pTexInterface) {
		pTexInterface->ReleaseTextureHandle(m_Texture);
		m_Texture = NULL;
	}
	m_bAllocatedTable = false;
	m_bAllocatedMap = false;
	m_CharTexWidth = 0;
	m_CharTexHeight = 0;
	m_Valid = false;
}

bool CUIVectorFont::CreateFontTextureAndTable(InstalledFontFace &installedFontFace,
	char const *pszChars,
	bool bMakeMap)
{
	if (!pTexInterface || !pszChars || !pszChars[0] || !installedFontFace.GetFile()[0])
		return false;

	const int nLen = (int)strlen(pszChars);
	if (nLen <= 0 || nLen > 255)
		return false;

	FT_Library ft = NULL;
	FT_Face face = NULL;
	if (FT_Init_FreeType(&ft) != 0)
		return false;
	if (FT_New_Face(ft, installedFontFace.GetFile(), 0, &face) != 0) {
		FT_Done_FreeType(ft);
		return false;
	}

	const int nPx = installedFontFace.GetHeight() > 0 ? installedFontFace.GetHeight() : 12;
	if (FT_Set_Pixel_Sizes(face, 0, (FT_UInt)nPx) != 0) {
		FT_Done_Face(face);
		FT_Done_FreeType(ft);
		return false;
	}

	const int kPad = 2;
	int nAscent = (int)((face->size->metrics.ascender + 63) >> 6);
	int nHeight = (int)((face->size->metrics.height + 63) >> 6);
	if (nAscent < 1)
		nAscent = nPx;
	if (nHeight < nAscent + 1)
		nHeight = nAscent + 2;

	std::vector<CUIGlyphInfo> glyphs((size_t)nLen);

	int nMaxW = 1;
	int nMaxH = nHeight;
	int nSpaceAdv = nPx / 4;
	if (nSpaceAdv < 2)
		nSpaceAdv = 2;

	if (FT_Load_Char(face, (FT_ULong)' ', FT_LOAD_DEFAULT) == 0) {
		int adv = (int)(face->glyph->advance.x >> 6);
		if (adv > 0)
			nSpaceAdv = adv;
	}

	int nSumW = 0;
	for (int i = 0; i < nLen; ++i) {
		unsigned char ch = (unsigned char)pszChars[i];
		CUIGlyphInfo &g = glyphs[(size_t)i];
		g.w = g.h = g.left = g.top = 0;
		g.adv = nSpaceAdv;
		if (FT_Load_Char(face, (FT_ULong)ch, FT_LOAD_RENDER) != 0)
			continue;
		FT_GlyphSlot slot = face->glyph;
		g.w = (int)slot->bitmap.width;
		g.h = (int)slot->bitmap.rows;
		g.left = slot->bitmap_left;
		g.top = slot->bitmap_top;
		g.adv = (int)(slot->advance.x >> 6);
		if (g.adv < g.w + g.left)
			g.adv = g.w + (g.left > 0 ? g.left : 0);
		if (g.adv < 1)
			g.adv = 1;
		if (g.w > 0 && g.h > 0 && slot->bitmap.buffer) {
			g.bits.resize((size_t)g.w * (size_t)g.h);
			if (slot->bitmap.pitch == g.w)
				memcpy(&g.bits[0], slot->bitmap.buffer, g.bits.size());
			else {
				for (int y = 0; y < g.h; ++y) {
					memcpy(&g.bits[(size_t)y * (size_t)g.w],
						slot->bitmap.buffer + y * slot->bitmap.pitch,
						(size_t)g.w);
				}
			}
		}
		int boxH = nAscent - g.top + g.h;
		if (boxH > nMaxH)
			nMaxH = boxH;
		if (g.adv + kPad > nMaxW)
			nMaxW = g.adv + kPad;
		nSumW += g.adv + kPad;
	}

	FT_Done_Face(face);
	FT_Done_FreeType(ft);

	int nGuess = (int)(sqrtf((float)nSumW * (float)(nMaxH + kPad)) + 0.5f);
	int texW = NextPot(nGuess);
	if (texW < 64)
		texW = 64;

	int x = 0, y = 0, rowH = nMaxH + kPad;
	for (int i = 0; i < nLen; ++i) {
		int slotW = glyphs[(size_t)i].adv + kPad;
		if (x + slotW >= texW) {
			x = 0;
			y += rowH;
		}
		glyphs[(size_t)i].atlasX = x;
		glyphs[(size_t)i].atlasY = y;
		x += slotW;
	}
	int texH = NextPot(y + rowH);
	if (texW > 1024)
		texW = 1024;
	if (texH > 1024)
		texH = 1024;

	m_pFontTable = new uint16[(size_t)nLen * 3];
	m_bAllocatedTable = (m_pFontTable != NULL);
	if (!m_bAllocatedTable)
		return false;
	memset(m_pFontTable, 0, sizeof(uint16) * (size_t)nLen * 3);

	if (bMakeMap) {
		m_pFontMap = new uint8[256];
		m_bAllocatedMap = (m_pFontMap != NULL);
		if (!m_bAllocatedMap)
			return false;
		memset(m_pFontMap, 0, 256);
	}

	const int nPitch = texW * 4;
	std::vector<uint8> pixels((size_t)nPitch * (size_t)texH, 0);
	// White RGB, zero alpha so CUI can tint; coverage goes into A.
	for (int i = 0; i < texW * texH; ++i) {
		pixels[(size_t)i * 4 + 0] = 255;
		pixels[(size_t)i * 4 + 1] = 255;
		pixels[(size_t)i * 4 + 2] = 255;
		pixels[(size_t)i * 4 + 3] = 0;
	}

	for (int i = 0; i < nLen; ++i) {
		CUIGlyphInfo &g = glyphs[(size_t)i];
		unsigned char ch = (unsigned char)pszChars[i];
		if (m_pFontMap)
			m_pFontMap[ch] = (uint8)i;

		int cellW = g.adv + kPad;
		m_pFontTable[i * 3] = (uint16)cellW;
		m_pFontTable[i * 3 + 1] = (uint16)g.atlasX;
		m_pFontTable[i * 3 + 2] = (uint16)g.atlasY;

		if (g.bits.empty())
			continue;

		int destX = g.atlasX + (g.left > 0 ? g.left : 0);
		int destY = g.atlasY + (nAscent - g.top);
		if (destY < g.atlasY)
			destY = g.atlasY;

		for (int gy = 0; gy < g.h; ++gy) {
			int py = destY + gy;
			if (py < 0 || py >= texH)
				continue;
			for (int gx = 0; gx < g.w; ++gx) {
				int px = destX + gx;
				if (px < 0 || px >= texW)
					continue;
				uint8 a = g.bits[(size_t)gy * (size_t)g.w + (size_t)gx];
				size_t o = ((size_t)py * (size_t)texW + (size_t)px) * 4;
				pixels[o + 0] = 255;
				pixels[o + 1] = 255;
				pixels[o + 2] = 255;
				pixels[o + 3] = a;
			}
		}
	}

	m_DefaultCharScreenWidth = (uint8)(nSpaceAdv > 255 ? 255 : nSpaceAdv);
	m_DefaultCharScreenHeight = (uint8)(nHeight > 255 ? 255 : nHeight);
	m_DefaultVerticalSpacing = (uint8)((m_DefaultCharScreenHeight / 4) + 1);
	m_CharTexWidth = (uint8)((nMaxW / 2) > 255 ? 255 : (nMaxW / 2));
	if (m_CharTexWidth < 1)
		m_CharTexWidth = 1;
	m_CharTexHeight = (uint8)(nMaxH > 255 ? 255 : nMaxH);

	m_Texture = NULL;
	pTexInterface->CreateTextureFromData(
		m_Texture,
		TEXTURETYPE_ARGB8888,
		0,
		&pixels[0],
		(uint32)texW,
		(uint32)texH);
	if (!m_Texture) {
		fprintf(stderr, "CUIVectorFont: CreateTextureFromData %dx%d failed\n", texW, texH);
		return false;
	}
	return true;
}
