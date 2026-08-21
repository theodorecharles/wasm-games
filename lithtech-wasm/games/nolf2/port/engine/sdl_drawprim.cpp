#include "bdefs.h"
#include "gendrawprim.h"
#include "ilttexinterface.h"
#include "render.h"
#include "dtxmgr.h"
#include "de_world.h"
#include "client_filemgr.h"
#include "clientmgr.h"

#ifdef __APPLE__
#include <OpenGL/gl.h>
#else
#include <GL/gl.h>
#endif

extern SharedTexture *sdl_render_GetDrawPrimTexture();
extern int sdl_render_Width();
extern int sdl_render_Height();

static IClientFileMgr *client_file_mgr;
define_holder(IClientFileMgr, client_file_mgr);

class CSDLDrawPrim : public CGenDrawPrim
{
public:
	declare_interface(CSDLDrawPrim);
	CSDLDrawPrim() { m_nSavedVP[0] = m_nSavedVP[1] = 0; m_nSavedVP[2] = 1024; m_nSavedVP[3] = 768; }

	virtual LTRESULT BeginDrawPrim();
	virtual LTRESULT EndDrawPrim();
	virtual LTRESULT SetTexture(const HTEXTURE hTexture);
	virtual void SaveViewport();
	virtual void RestoreViewport();

	virtual LTRESULT DrawPrim(LT_POLYGT3 *pPrim, const uint32 nCount = 1);
	virtual LTRESULT DrawPrim(LT_POLYFT3 *pPrim, const uint32 nCount = 1);
	virtual LTRESULT DrawPrim(LT_POLYG3 *pPrim, const uint32 nCount = 1);
	virtual LTRESULT DrawPrim(LT_POLYF3 *pPrim, const uint32 nCount = 1);
	virtual LTRESULT DrawPrim(LT_POLYGT4 *pPrim, const uint32 nCount = 1);
	virtual LTRESULT DrawPrim(LT_POLYGT4 **ppPrim, const uint32 nCount = 1);
	virtual LTRESULT DrawPrim(LT_POLYFT4 *pPrim, const uint32 nCount = 1);
	virtual LTRESULT DrawPrim(LT_POLYG4 *pPrim, const uint32 nCount = 1);
	virtual LTRESULT DrawPrim(LT_POLYF4 *pPrim, const uint32 nCount = 1);
	virtual LTRESULT DrawPrim(LT_LINEGT *pPrim, const uint32 nCount = 1);
	virtual LTRESULT DrawPrim(LT_LINEFT *pPrim, const uint32 nCount = 1);
	virtual LTRESULT DrawPrim(LT_LINEG *pPrim, const uint32 nCount = 1);
	virtual LTRESULT DrawPrim(LT_LINEF *pPrim, const uint32 nCount = 1);
	virtual LTRESULT DrawPrimPoint(LT_VERTGT *pVerts, const uint32 nCount = 1);
	virtual LTRESULT DrawPrimPoint(LT_VERTG *pVerts, const uint32 nCount = 1);
	virtual LTRESULT DrawPrimFan(LT_VERTGT *pVerts, const uint32 nCount);
	virtual LTRESULT DrawPrimFan(LT_VERTFT *pVerts, const uint32 nCount, LT_VERTRGBA rgba);
	virtual LTRESULT DrawPrimFan(LT_VERTG *pVerts, const uint32 nCount);
	virtual LTRESULT DrawPrimFan(LT_VERTF *pVerts, const uint32 nCount, LT_VERTRGBA rgba);
	virtual LTRESULT DrawPrimStrip(LT_VERTGT *pVerts, const uint32 nCount);
	virtual LTRESULT DrawPrimStrip(LT_VERTFT *pVerts, const uint32 nCount, LT_VERTRGBA rgba);
	virtual LTRESULT DrawPrimStrip(LT_VERTG *pVerts, const uint32 nCount);
	virtual LTRESULT DrawPrimStrip(LT_VERTF *pVerts, const uint32 nCount, LT_VERTRGBA rgba);

	virtual void SetUVWH(LT_POLYGT4 *pPrim, HTEXTURE pTex, float u, float v, float w, float h);

private:
	int m_nSavedVP[4];
	void ApplyState();
	void BeginScreen();
	void EndScreen();
};

define_interface(CSDLDrawPrim, ILTDrawPrim);
instantiate_interface(CSDLDrawPrim, ILTDrawPrim, Internal);

static void ApplyBlend(ELTBlendMode mode)
{
	glEnable(GL_BLEND);
	switch (mode) {
	case DRAWPRIM_BLEND_ADD:
		glBlendFunc(GL_ONE, GL_ONE);
		break;
	case DRAWPRIM_BLEND_MOD_SRCALPHA:
	case DRAWPRIM_BLEND_MUL_SRCALPHA_ONE:
		glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
		break;
	case DRAWPRIM_BLEND_MUL_SRCCOL_DSTCOL:
		glBlendFunc(GL_DST_COLOR, GL_ZERO);
		break;
	case DRAWPRIM_NOBLEND:
		glDisable(GL_BLEND);
		break;
	default:
		glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
		break;
	}
}

void CSDLDrawPrim::ApplyState()
{
	ApplyBlend(m_BlendMode);
	if (m_eZBufferMode == DRAWPRIM_NOZ)
		glDisable(GL_DEPTH_TEST);
	else
		glEnable(GL_DEPTH_TEST);

	if (m_eFillMode == DRAWPRIM_WIRE)
		glPolygonMode(GL_FRONT_AND_BACK, GL_LINE);
	else
		glPolygonMode(GL_FRONT_AND_BACK, GL_FILL);

	if (m_pTexture)
		r_GetRenderStruct()->DrawPrimSetTexture((SharedTexture*)m_pTexture);
	else
		r_GetRenderStruct()->DrawPrimDisableTextures();
}

void CSDLDrawPrim::BeginScreen()
{
	ApplyState();
	glMatrixMode(GL_PROJECTION);
	glPushMatrix();
	glLoadIdentity();
	glOrtho(0, sdl_render_Width(), sdl_render_Height(), 0, -1, 1);
	glMatrixMode(GL_MODELVIEW);
	glPushMatrix();
	glLoadIdentity();
}

void CSDLDrawPrim::EndScreen()
{
	glPopMatrix();
	glMatrixMode(GL_PROJECTION);
	glPopMatrix();
	glMatrixMode(GL_MODELVIEW);
	glPolygonMode(GL_FRONT_AND_BACK, GL_FILL);
}

LTRESULT CSDLDrawPrim::BeginDrawPrim() { return LT_OK; }
LTRESULT CSDLDrawPrim::EndDrawPrim() { return LT_OK; }

LTRESULT CSDLDrawPrim::SetTexture(const HTEXTURE hTexture)
{
	m_pTexture = (HTEXTURE)hTexture;
	if (hTexture)
		r_BindTexture((SharedTexture*)hTexture, LTFALSE);
	return LT_OK;
}

void CSDLDrawPrim::SaveViewport()
{
	glGetIntegerv(GL_VIEWPORT, m_nSavedVP);
}

void CSDLDrawPrim::RestoreViewport()
{
	glViewport(m_nSavedVP[0], m_nSavedVP[1], m_nSavedVP[2], m_nSavedVP[3]);
}

void CSDLDrawPrim::SetUVWH(LT_POLYGT4 *pPrim, HTEXTURE pTex, float u, float v, float w, float h)
{
	(void)pTex;
	CGenDrawPrim::SetUVWH(pPrim, u, v, w, h);
}

static void VertGT(const LT_VERTGT &v)
{
	glColor4ub(v.rgba.r, v.rgba.g, v.rgba.b, v.rgba.a);
	glTexCoord2f(v.u, v.v);
	glVertex3f(v.x, v.y, v.z);
}

LTRESULT CSDLDrawPrim::DrawPrim(LT_POLYGT4 *pPrim, const uint32 nCount)
{
	if (!pPrim)
		return LT_ERROR;
	BeginScreen();
	glBegin(GL_QUADS);
	uint32 i;
	for (i = 0; i < nCount; ++i) {
		VertGT(pPrim[i].verts[0]);
		VertGT(pPrim[i].verts[1]);
		VertGT(pPrim[i].verts[2]);
		VertGT(pPrim[i].verts[3]);
	}
	glEnd();
	EndScreen();
	return LT_OK;
}

LTRESULT CSDLDrawPrim::DrawPrim(LT_POLYGT4 **ppPrim, const uint32 nCount)
{
	if (!ppPrim)
		return LT_ERROR;
	BeginScreen();
	glBegin(GL_QUADS);
	uint32 i;
	for (i = 0; i < nCount; ++i) {
		if (!ppPrim[i])
			continue;
		VertGT(ppPrim[i]->verts[0]);
		VertGT(ppPrim[i]->verts[1]);
		VertGT(ppPrim[i]->verts[2]);
		VertGT(ppPrim[i]->verts[3]);
	}
	glEnd();
	EndScreen();
	return LT_OK;
}

LTRESULT CSDLDrawPrim::DrawPrim(LT_POLYGT3 *pPrim, const uint32 nCount)
{
	if (!pPrim) return LT_ERROR;
	BeginScreen();
	glBegin(GL_TRIANGLES);
	uint32 i;
	for (i = 0; i < nCount; ++i) {
		VertGT(pPrim[i].verts[0]);
		VertGT(pPrim[i].verts[1]);
		VertGT(pPrim[i].verts[2]);
	}
	glEnd();
	EndScreen();
	return LT_OK;
}

LTRESULT CSDLDrawPrim::DrawPrim(LT_POLYFT3 *, const uint32) { return LT_OK; }
LTRESULT CSDLDrawPrim::DrawPrim(LT_POLYG3 *, const uint32) { return LT_OK; }
LTRESULT CSDLDrawPrim::DrawPrim(LT_POLYF3 *, const uint32) { return LT_OK; }
LTRESULT CSDLDrawPrim::DrawPrim(LT_POLYFT4 *pPrim, const uint32 nCount)
{
	if (!pPrim) return LT_ERROR;
	BeginScreen();
	glBegin(GL_QUADS);
	uint32 i;
	for (i = 0; i < nCount; ++i) {
		int v;
		for (v = 0; v < 4; ++v) {
			glColor4ub(pPrim[i].rgba.r, pPrim[i].rgba.g, pPrim[i].rgba.b, pPrim[i].rgba.a);
			glTexCoord2f(pPrim[i].verts[v].u, pPrim[i].verts[v].v);
			glVertex3f(pPrim[i].verts[v].x, pPrim[i].verts[v].y, pPrim[i].verts[v].z);
		}
	}
	glEnd();
	EndScreen();
	return LT_OK;
}
LTRESULT CSDLDrawPrim::DrawPrim(LT_POLYG4 *pPrim, const uint32 nCount)
{
	if (!pPrim) return LT_ERROR;
	BeginScreen();
	r_GetRenderStruct()->DrawPrimDisableTextures();
	glBegin(GL_QUADS);
	uint32 i;
	for (i = 0; i < nCount; ++i) {
		int v;
		for (v = 0; v < 4; ++v) {
			glColor4ub(pPrim[i].verts[v].rgba.r, pPrim[i].verts[v].rgba.g,
				pPrim[i].verts[v].rgba.b, pPrim[i].verts[v].rgba.a);
			glVertex3f(pPrim[i].verts[v].x, pPrim[i].verts[v].y, pPrim[i].verts[v].z);
		}
	}
	glEnd();
	EndScreen();
	return LT_OK;
}
LTRESULT CSDLDrawPrim::DrawPrim(LT_POLYF4 *pPrim, const uint32 nCount)
{
	if (!pPrim) return LT_ERROR;
	BeginScreen();
	r_GetRenderStruct()->DrawPrimDisableTextures();
	glBegin(GL_QUADS);
	uint32 i;
	for (i = 0; i < nCount; ++i) {
		int v;
		for (v = 0; v < 4; ++v) {
			glColor4ub(pPrim[i].rgba.r, pPrim[i].rgba.g, pPrim[i].rgba.b, pPrim[i].rgba.a);
			glVertex3f(pPrim[i].verts[v].x, pPrim[i].verts[v].y, pPrim[i].verts[v].z);
		}
	}
	glEnd();
	EndScreen();
	return LT_OK;
}

LTRESULT CSDLDrawPrim::DrawPrim(LT_LINEGT *, const uint32) { return LT_OK; }
LTRESULT CSDLDrawPrim::DrawPrim(LT_LINEFT *, const uint32) { return LT_OK; }
LTRESULT CSDLDrawPrim::DrawPrim(LT_LINEG *, const uint32) { return LT_OK; }
LTRESULT CSDLDrawPrim::DrawPrim(LT_LINEF *, const uint32) { return LT_OK; }
LTRESULT CSDLDrawPrim::DrawPrimPoint(LT_VERTGT *, const uint32) { return LT_OK; }
LTRESULT CSDLDrawPrim::DrawPrimPoint(LT_VERTG *, const uint32) { return LT_OK; }
LTRESULT CSDLDrawPrim::DrawPrimFan(LT_VERTGT *, const uint32) { return LT_OK; }
LTRESULT CSDLDrawPrim::DrawPrimFan(LT_VERTFT *, const uint32, LT_VERTRGBA) { return LT_OK; }
LTRESULT CSDLDrawPrim::DrawPrimFan(LT_VERTG *, const uint32) { return LT_OK; }
LTRESULT CSDLDrawPrim::DrawPrimFan(LT_VERTF *, const uint32, LT_VERTRGBA) { return LT_OK; }
LTRESULT CSDLDrawPrim::DrawPrimStrip(LT_VERTGT *, const uint32) { return LT_OK; }
LTRESULT CSDLDrawPrim::DrawPrimStrip(LT_VERTFT *, const uint32, LT_VERTRGBA) { return LT_OK; }
LTRESULT CSDLDrawPrim::DrawPrimStrip(LT_VERTG *, const uint32) { return LT_OK; }
LTRESULT CSDLDrawPrim::DrawPrimStrip(LT_VERTF *, const uint32, LT_VERTRGBA) { return LT_OK; }

class CSDLTexInterface : public ILTTexInterface
{
public:
	declare_interface(CSDLTexInterface);

	virtual LTRESULT FindTextureFromName(HTEXTURE &hTexture, const char *pFilename)
	{
		FileRef ref;
		hTexture = NULL;
		ref.m_FileType = TYPECODE_TEXTURE;
		ref.m_pFilename = pFilename;
		FileIdentifier *pIdent = client_file_mgr->GetFileIdentifier(&ref, TYPECODE_TEXTURE);
		if (!pIdent || !pIdent->m_pData)
			return LT_ERROR;
		hTexture = (HTEXTURE)pIdent->m_pData;
		return LT_OK;
	}

	virtual LTRESULT CreateTextureFromName(HTEXTURE &hTexture, const char *pFilename)
	{
		FileRef ref;
		ref.m_FileType = FILE_CLIENTFILE;
		ref.m_pFilename = (char*)pFilename;
		hTexture = (HTEXTURE)g_pClientMgr->AddSharedTexture(&ref);
		if (!hTexture)
			return LT_MISSINGFILE;
		r_BindTexture((SharedTexture*)hTexture, LTFALSE);
		return LT_OK;
	}

	virtual LTRESULT CreateTextureFromData(HTEXTURE &hTexture,
		ETextureType eType, uint32 flags, uint8 *pData, uint32 nWidth, uint32 nHeight, uint32)
	{
		hTexture = NULL;
		if (!pData || !nWidth || !nHeight || !g_pClientMgr)
			return LT_ERROR;

		BPPIdent bpp = BPP_32;
		PFormat fmt;
		uint32 srcBpp = 4;
		if (eType == TEXTURETYPE_ARGB4444) {
			bpp = BPP_16;
			srcBpp = 2;
			fmt.Init(BPP_16, 0xF000, 0x0F00, 0x00F0, 0x000F);
		} else if (eType == TEXTURETYPE_ARGB1555) {
			bpp = BPP_16;
			srcBpp = 2;
			fmt.Init(BPP_16, 0x8000, 0x7C00, 0x03E0, 0x001F);
		} else if (eType == TEXTURETYPE_RGB565) {
			bpp = BPP_16;
			srcBpp = 2;
			fmt.Init(BPP_16, 0, 0xF800, 0x07E0, 0x001F);
		} else {
			fmt.Init(BPP_32, 0xFF000000, 0x00FF0000, 0x0000FF00, 0x000000FF);
		}

		uint32 srcPitch = nWidth * srcBpp;
		if (srcBpp == 2)
			srcPitch = ((16u * nWidth + 7u) / 8u + 3u) & ~3u;

		SharedTexture *st = g_pClientMgr->m_SharedTextureBank.Allocate();
		if (!st)
			return LT_ERROR;
		memset(st, 0, sizeof(*st));
		st->m_Link.m_pData = st;
		dl_AddHead(&g_pClientMgr->m_SharedTextures, &st->m_Link, st);
		st->m_pFile = NULL;
		st->SetTextureInfo(nWidth, nHeight, fmt);

		TextureData *td = dtx_Alloc(bpp, nWidth, nHeight, 1, LTNULL, LTNULL);
		if (!td) {
			dl_RemoveAt(&g_pClientMgr->m_SharedTextures, &st->m_Link);
			g_pClientMgr->m_SharedTextureBank.Free(st);
			return LT_ERROR;
		}
		td->m_PFormat = fmt;
		td->m_Flags = flags;
		td->m_Header.m_IFlags = flags;
		td->m_pSharedTexture = st;
		st->m_pEngineData = td;
		dl_AddHead(&g_SysCache.m_List, &td->m_Link, td);
		g_SysCache.m_CurMem += td->m_AllocSize;

		uint32 copyW = nWidth * srcBpp;
		if ((uint32)td->m_Mips[0].m_Pitch < copyW)
			copyW = (uint32)td->m_Mips[0].m_Pitch;
		for (uint32 y = 0; y < nHeight; ++y) {
			memcpy(td->m_Mips[0].m_Data + y * (uint32)td->m_Mips[0].m_Pitch,
				pData + y * srcPitch, copyW);
		}

		st->SetRefCount(1);
		r_BindTexture(st, LTTRUE);
		hTexture = (HTEXTURE)st;
		return LT_OK;
	}

	virtual LTRESULT GetTextureData(const HTEXTURE hTexture,
		const uint8* &pData, uint32& nWidth, uint32& nHeight, uint32& nPitch, ETextureType& eType)
	{
		SharedTexture *st = (SharedTexture*)hTexture;
		if (!st)
			return LT_ERROR;
		TextureData *td = r_GetTextureData(st);
		if (!td)
			return LT_ERROR;
		pData = td->m_Mips[0].m_Data;
		nWidth = td->m_Mips[0].m_Width;
		nHeight = td->m_Mips[0].m_Height;
		nPitch = (uint32)td->m_Mips[0].m_Pitch;
		eType = TEXTURETYPE_ARGB8888;
		return LT_OK;
	}

	virtual LTRESULT FlushTextureData(const HTEXTURE hTexture, ETextureMod, uint32)
	{
		if (hTexture)
			r_BindTexture((SharedTexture*)hTexture, LTTRUE);
		return LT_OK;
	}

	virtual LTRESULT GetTextureDims(const HTEXTURE hTexture, uint32 &nWidth, uint32 &nHeight)
	{
		SharedTexture *st = (SharedTexture*)hTexture;
		PFormat fmt;
		if (!st || !r_GetTextureInfo(st, nWidth, nHeight, fmt))
			return LT_ERROR;
		return LT_OK;
	}

	virtual LTRESULT GetTextureType(const HTEXTURE, ETextureType &eTextureType)
	{
		eTextureType = TEXTURETYPE_ARGB8888;
		return LT_OK;
	}

	virtual bool ReleaseTextureHandle(const HTEXTURE hTexture)
	{
		if (!hTexture)
			return false;
		g_pClientMgr->FreeSharedTexture((SharedTexture*)hTexture);
		return true;
	}

	virtual uint32 AddRefTextureHandle(const HTEXTURE hTexture)
	{
		SharedTexture *st = (SharedTexture*)hTexture;
		if (!st)
			return 0;
		st->SetRefCount((uint16)(st->GetRefCount() + 1));
		return st->GetRefCount();
	}
};

define_interface(CSDLTexInterface, ILTTexInterface);
