#include "bdefs.h"
#include "texturestringimage.h"
#include "object_bank.h"
#include "ilttexinterface.h"

#include <algorithm>
#include <string.h>

#define MEMORY_CATEGORY LT_MEM_TYPE_TEXTURE

static ObjectBank<CTextureStringImage> g_TexStringImageBank(64, 64);

static ILTTexInterface *g_pILTTextureMgr = NULL;
define_holder(ILTTexInterface, g_pILTTextureMgr);

static void GetUniqueCharList(const wchar_t *pszString, wchar_t *pszBuffer, uint32 nBufferSize)
{
	if (nBufferSize == 0)
		return;

	LTStrCpy(pszBuffer, pszString, nBufferSize);
	pszBuffer[nBufferSize - 1] = (wchar_t)'\0';

	uint32 nStrLen = LTStrLen(pszBuffer);
	if (nStrLen > 1) {
		std::sort(pszBuffer, pszBuffer + nStrLen);
		uint32 nBufferEnd = nStrLen - 1;
		for (uint32 nCurrChar = nBufferEnd; nCurrChar > 0; nCurrChar--) {
			if (pszBuffer[nCurrChar] == pszBuffer[nCurrChar - 1]) {
				pszBuffer[nCurrChar] = pszBuffer[nBufferEnd];
				pszBuffer[nBufferEnd] = (wchar_t)'\0';
				nBufferEnd--;
			}
		}
	}
}

static uint32 NextPow2(uint32 n)
{
	uint32 p = 1;
	while (p < n)
		p <<= 1;
	return p ? p : 1;
}

CTextureStringImage::CTextureStringImage() :
	m_pGlyphList(NULL),
	m_nNumGlyphs(0),
	m_nRowHeight(0)
{
}

CTextureStringImage::~CTextureStringImage()
{
	FreeData();
}

CTextureStringImage *CTextureStringImage::Allocate()
{
	return g_TexStringImageBank.Allocate();
}

void CTextureStringImage::Free(CTextureStringImage *pImage)
{
	g_TexStringImageBank.Free(pImage);
}

bool CTextureStringImage::CreateBitmapFont(const wchar_t *pszString, const CFontInfo &Font)
{
	FreeData();
	if (!pszString)
		return false;

	if (!SetupUniqueGlyphList(pszString))
		return false;

	m_FontInfo = Font;
	m_nRowHeight = Font.m_nHeight ? Font.m_nHeight : 12;
	const uint32 cellH = m_nRowHeight;
	const uint32 cellW = LTMAX((uint32)1, (m_nRowHeight * 3) / 5);

	const uint32 nGlyphs = m_nNumGlyphs ? m_nNumGlyphs : 1;
	uint32 cols = 1;
	while (cols * cols < nGlyphs)
		++cols;
	const uint32 rows = (nGlyphs + cols - 1) / cols;
	uint32 texW = NextPow2(cols * cellW);
	uint32 texH = NextPow2(rows * cellH);
	if (texW > 1024) texW = 1024;
	if (texH > 1024) texH = 1024;

	for (uint32 i = 0; i < m_nNumGlyphs; ++i) {
		const uint32 cx = i % cols;
		const uint32 cy = i / cols;
		CTextureStringGlyph &glyph = m_pGlyphList[i];
		uint32 w = (glyph.m_cGlyph == (wchar_t)' ') ? LTMAX((uint32)1, cellW / 2) : cellW;
		glyph.m_rBlackBox.Init(0, 0, (int32)w, (int32)cellH);
		glyph.m_nTotalWidth = w;
		glyph.m_fU = (float)(cx * cellW) / (float)texW;
		glyph.m_fV = (float)(cy * cellH) / (float)texH;
		glyph.m_fTexWidth = (float)w / (float)texW;
		glyph.m_fTexHeight = (float)cellH / (float)texH;
	}

	if (g_pILTTextureMgr) {
		const uint32 nPixels = texW * texH;
		uint32 *pData = new uint32[nPixels];
		memset(pData, 0, nPixels * sizeof(uint32));
		for (uint32 i = 0; i < m_nNumGlyphs; ++i) {
			const uint32 cx = i % cols;
			const uint32 cy = i / cols;
			const uint32 w = m_pGlyphList[i].m_nTotalWidth;
			for (uint32 y = 0; y < cellH; ++y) {
				for (uint32 x = 0; x < w; ++x) {
					const uint32 px = cx * cellW + x;
					const uint32 py = cy * cellH + y;
					if (px < texW && py < texH)
						pData[py * texW + px] = 0xFFFFFFFFu;
				}
			}
		}
		g_pILTTextureMgr->CreateTextureFromData(m_hTexture, TEXTURETYPE_ARGB8888,
			TEXTUREFLAG_32BITSYSCOPY, (uint8 *)pData, texW, texH, 0);
		delete[] pData;
	}

	return true;
}

void CTextureStringImage::FreeData()
{
	delete[] m_pGlyphList;
	m_pGlyphList = NULL;
	m_nNumGlyphs = 0;
	m_hTexture = NULL;
	m_nRowHeight = 0;
}

const CTextureStringGlyph *CTextureStringImage::GetGlyphByIndex(uint32 nGlyph) const
{
	if (nGlyph < m_nNumGlyphs)
		return &m_pGlyphList[nGlyph];
	return NULL;
}

const CTextureStringGlyph *CTextureStringImage::GetGlyph(wchar_t cGlyph) const
{
	for (uint32 i = 0; i < m_nNumGlyphs; ++i) {
		if (m_pGlyphList[i].m_cGlyph == cGlyph)
			return &m_pGlyphList[i];
	}
	return NULL;
}

bool CTextureStringImage::SetupUniqueGlyphList(const wchar_t *pszString)
{
	uint32 nStrLen = LTStrLen(pszString);
	wchar_t *pszUniqueList;
	LT_MEM_TRACK_ALLOC(pszUniqueList = new wchar_t[nStrLen + 1], MEMORY_CATEGORY);
	if (!pszUniqueList)
		return false;

	GetUniqueCharList(pszString, pszUniqueList, nStrLen + 1);
	uint32 nNumGlyphs = LTStrLen(pszUniqueList);

	LT_MEM_TRACK_ALLOC(m_pGlyphList = new CTextureStringGlyph[nNumGlyphs], MEMORY_CATEGORY);
	if (!m_pGlyphList) {
		delete[] pszUniqueList;
		return false;
	}

	m_nNumGlyphs = nNumGlyphs;
	for (uint32 i = 0; i < nNumGlyphs; ++i)
		m_pGlyphList[i].m_cGlyph = pszUniqueList[i];

	delete[] pszUniqueList;
	return true;
}
