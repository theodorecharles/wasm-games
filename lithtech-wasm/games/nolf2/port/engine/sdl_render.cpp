#include "bdefs.h"
#include "renderinfostruct.h"
#include "renderstruct.h"
#include "render.h"
#include "dtxmgr.h"
#include "de_world.h"
#include "iltstream.h"

#include <SDL.h>
#ifdef __APPLE__
#include <OpenGL/gl.h>
#else
#include <GL/gl.h>
#endif

#include <math.h>
#include <stdio.h>
#include <string.h>
#include <vector>

#ifndef CP_ALPHA
#define CP_ALPHA 0
#define CP_RED 1
#define CP_GREEN 2
#define CP_BLUE 3
#endif

struct SGLSurf {
	int w, h;
	int pitch;
	uint8 *px;
	GLuint tex;
	int optimized;
};

struct SRBVert {
	LTVector m_vPos;
	float m_fU0, m_fV0;
	float m_fU1, m_fV1;
	uint32 m_nColor;
	LTVector m_vNormal;
	LTVector m_vTangent;
	LTVector m_vBinormal;
};

struct SWorldTri {
	SRBVert v[3];
	SharedTexture *tex;
};

struct SRenderSect {
	uint32 startIndex;
	uint32 triCount;
	SharedTexture *tex;
};

static RenderStruct *g_pStruct = NULL;
static int g_nWidth = 1024;
static int g_nHeight = 768;
static int g_bIn3D = 0;
static int g_bInOpt2D = 0;
static LTSurfaceBlend g_OptBlend = LTSURFACEBLEND_ALPHA;
static HLTCOLOR g_OptColor = 0xFFFFFFFF;
static uint8 *g_pScreen = NULL;
static int g_nScreenPitch = 0;
static int g_bScreenLocked = 0;
static SharedTexture *g_pDrawPrimTex = NULL;
static std::vector<SWorldTri> g_WorldTris;
static float g_ClearR = 0, g_ClearG = 0, g_ClearB = 0;

static GLuint TexFromShared(SharedTexture *pTex)
{
	if (!pTex)
		return 0;
	return (GLuint)(uintptr_t)pTex->m_pRenderData;
}

static void UploadRGBA(GLuint id, int w, int h, const uint8 *rgba)
{
	glBindTexture(GL_TEXTURE_2D, id);
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT);
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT);
	glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
	glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, w, h, 0, GL_RGBA, GL_UNSIGNED_BYTE, rgba);
}

// Engine surfaces are A8R8G8B8 (LE bytes B,G,R,A). PCX has A=0.
static void UploadSurfacePixels(GLuint id, int w, int h, const uint8 *px)
{
	if (!px || w <= 0 || h <= 0)
		return;
	std::vector<uint8> rgba((size_t)w * (size_t)h * 4);
	int nZeroA = 0;
	int nPix = w * h;
	for (int i = 0; i < nPix; ++i) {
		uint32 p = ((const uint32 *)px)[i];
		uint8 a = (uint8)(p >> 24);
		rgba[(size_t)i * 4 + 0] = (uint8)((p >> 16) & 0xFF);
		rgba[(size_t)i * 4 + 1] = (uint8)((p >> 8) & 0xFF);
		rgba[(size_t)i * 4 + 2] = (uint8)(p & 0xFF);
		rgba[(size_t)i * 4 + 3] = a;
		if (a == 0)
			++nZeroA;
	}
	if (nZeroA > nPix / 2) {
		for (int i = 0; i < nPix; ++i)
			rgba[(size_t)i * 4 + 3] = 255;
	}
	UploadRGBA(id, w, h, &rgba[0]);
}

static void ConvertMipToRGBA(TextureData *td, uint8 *out)
{
	uint32 w = td->m_Mips[0].m_Width;
	uint32 h = td->m_Mips[0].m_Height;
	uint8 *src = td->m_Mips[0].m_Data;
	int pitch = td->m_Mips[0].m_Pitch;
	BPPIdent bpp = td->m_Header.GetBPPIdent();
	uint32 x, y;

	if (!src) {
		memset(out, 255, w * h * 4);
		return;
	}

	if (bpp == BPP_32) {
		for (y = 0; y < h; ++y) {
			uint32 *row = (uint32*)(src + y * pitch);
			for (x = 0; x < w; ++x) {
				uint32 p = row[x];
				out[(y * w + x) * 4 + 0] = (uint8)((p >> 16) & 0xFF);
				out[(y * w + x) * 4 + 1] = (uint8)((p >> 8) & 0xFF);
				out[(y * w + x) * 4 + 2] = (uint8)(p & 0xFF);
				out[(y * w + x) * 4 + 3] = (uint8)((p >> 24) & 0xFF);
			}
		}
		return;
	}

	if (bpp == BPP_16) {
		const bool b4444 = (td->m_Header.m_IFlags & DTX_PREFER4444) != 0 ||
			td->m_PFormat.m_Masks[0] == 0xF000;
		for (y = 0; y < h; ++y) {
			uint16 *row = (uint16*)(src + y * pitch);
			for (x = 0; x < w; ++x) {
				uint16 p = row[x];
				if (b4444) {
					out[(y * w + x) * 4 + 0] = (uint8)(((p >> 8) & 0xF) * 17);
					out[(y * w + x) * 4 + 1] = (uint8)(((p >> 4) & 0xF) * 17);
					out[(y * w + x) * 4 + 2] = (uint8)((p & 0xF) * 17);
					out[(y * w + x) * 4 + 3] = (uint8)(((p >> 12) & 0xF) * 17);
				} else {
					uint8 r = (uint8)(((p >> 11) & 31) * 255 / 31);
					uint8 g = (uint8)(((p >> 5) & 63) * 255 / 63);
					uint8 b = (uint8)((p & 31) * 255 / 31);
					out[(y * w + x) * 4 + 0] = r;
					out[(y * w + x) * 4 + 1] = g;
					out[(y * w + x) * 4 + 2] = b;
					out[(y * w + x) * 4 + 3] = 255;
				}
			}
		}
		return;
	}

	memset(out, 180, w * h * 4);
}

static int rs_Init(RenderStructInit *pInit)
{
	pInit->m_RendererVersion = LTRENDER_VERSION;
	g_nWidth = (int)pInit->m_Mode.m_Width;
	g_nHeight = (int)pInit->m_Mode.m_Height;
	if (g_nWidth <= 0) g_nWidth = 1024;
	if (g_nHeight <= 0) g_nHeight = 768;
	pInit->m_Mode.m_Width = (uint32)g_nWidth;
	pInit->m_Mode.m_Height = (uint32)g_nHeight;
	pInit->m_Mode.m_BitDepth = 32;
	LTStrCpy(pInit->m_Mode.m_InternalName, "SDL/OpenGL", sizeof(pInit->m_Mode.m_InternalName));
	LTStrCpy(pInit->m_Mode.m_Description, "SDL OpenGL", sizeof(pInit->m_Mode.m_Description));

	g_nScreenPitch = g_nWidth * 4;
	delete [] g_pScreen;
	g_pScreen = new uint8[g_nScreenPitch * g_nHeight];
	memset(g_pScreen, 0, g_nScreenPitch * g_nHeight);

	glViewport(0, 0, g_nWidth, g_nHeight);
	glClearColor(0, 0, 0, 1);
	glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
	dsi_PrintToConsole("SDL renderer %dx%d A8R8G8B8", g_nWidth, g_nHeight);
	return RENDER_OK;
}

static void rs_Term(bool)
{
	delete [] g_pScreen;
	g_pScreen = NULL;
	g_WorldTris.clear();
}

static IDirect3DDevice9* rs_GetD3DDevice() { return NULL; }

static void rs_BindTexture(SharedTexture *pTexture, bool bChanged)
{
	if (!pTexture || !g_pStruct || !g_pStruct->GetTexture)
		return;
	if (pTexture->m_pRenderData && !bChanged)
		return;

	TextureData *td = g_pStruct->GetTexture(pTexture);
	if (!td)
		return;

	uint32 w = td->m_Mips[0].m_Width;
	uint32 h = td->m_Mips[0].m_Height;
	if (!w || !h)
		return;

	GLuint id = (GLuint)(uintptr_t)pTexture->m_pRenderData;
	if (!id)
		glGenTextures(1, &id);

	std::vector<uint8> rgba((size_t)w * h * 4);
	ConvertMipToRGBA(td, &rgba[0]);
	UploadRGBA(id, (int)w, (int)h, &rgba[0]);
	pTexture->m_pRenderData = (void*)(uintptr_t)id;
	if (g_pStruct)
		g_pStruct->m_SystemTextureMemory += w * h * 4;
}

static void rs_UnbindTexture(SharedTexture *pTexture)
{
	if (!pTexture || !pTexture->m_pRenderData)
		return;
	GLuint id = (GLuint)(uintptr_t)pTexture->m_pRenderData;
	glDeleteTextures(1, &id);
	pTexture->m_pRenderData = NULL;
}

static D3DFORMAT rs_GetTextureDDFormat1(BPPIdent, uint32) { return D3DFMT_A8R8G8B8; }

static bool rs_QueryDDSupport(PFormat *) { return true; }

static bool rs_GetTextureDDFormat2(BPPIdent, uint32, PFormat *pFormat)
{
	if (!pFormat)
		return false;
	pFormat->Init(BPP_32, 0xFF000000, 0x00FF0000, 0x0000FF00, 0x000000FF);
	return true;
}

static bool rs_ConvertTexDataToDD(uint8 *pSrc, PFormat *pSrcFmt, uint32 nSrcW, uint32 nSrcH,
	uint8 *pDst, PFormat *pDstFmt, BPPIdent, uint32, uint32 nDstW, uint32 nDstH)
{
	if (!pSrc || !pDst || !nSrcW || !nSrcH || !nDstW || !nDstH)
		return false;
	uint32 srcBpp = pSrcFmt ? pSrcFmt->GetBytesPerPixel() : 4;
	uint32 dstBpp = pDstFmt ? pDstFmt->GetBytesPerPixel() : srcBpp;
	if (!srcBpp)
		srcBpp = 4;
	if (!dstBpp)
		dstBpp = srcBpp;
	uint32 w = nSrcW < nDstW ? nSrcW : nDstW;
	uint32 h = nSrcH < nDstH ? nSrcH : nDstH;
	if (srcBpp == dstBpp) {
		for (uint32 y = 0; y < h; ++y)
			memcpy(pDst + y * nDstW * dstBpp, pSrc + y * nSrcW * srcBpp, w * srcBpp);
		return true;
	}
	return false;
}

static void rs_DrawPrimSetTexture(SharedTexture *pTexture)
{
	g_pDrawPrimTex = pTexture;
	if (pTexture)
		rs_BindTexture(pTexture, false);
	GLuint id = TexFromShared(pTexture);
	if (id) {
		glEnable(GL_TEXTURE_2D);
		glBindTexture(GL_TEXTURE_2D, id);
	} else {
		glDisable(GL_TEXTURE_2D);
	}
}

static void rs_DrawPrimDisableTextures()
{
	g_pDrawPrimTex = NULL;
	glDisable(GL_TEXTURE_2D);
}

static HRENDERCONTEXT rs_CreateContext()
{
	return (HRENDERCONTEXT)(uintptr_t)1;
}

static void rs_DeleteContext(HRENDERCONTEXT) {}

static void rs_Clear(LTRect *pRect, uint32 flags, LTRGBColor& ClearColor)
{
	(void)pRect;
	(void)flags;
	g_ClearR = ClearColor.rgb.r / 255.0f;
	g_ClearG = ClearColor.rgb.g / 255.0f;
	g_ClearB = ClearColor.rgb.b / 255.0f;
	glClearColor(g_ClearR, g_ClearG, g_ClearB, ClearColor.rgb.a / 255.0f);
	glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
}

static bool rs_Start3D() { g_bIn3D = 1; if (g_pStruct) g_pStruct->m_nIn3D++; return true; }
static bool rs_End3D() { g_bIn3D = 0; if (g_pStruct && g_pStruct->m_nIn3D) g_pStruct->m_nIn3D--; return true; }
static bool rs_IsIn3D() { return g_bIn3D != 0; }
static bool rs_StartOptimized2D() { g_bInOpt2D = 1; if (g_pStruct) g_pStruct->m_nInOptimized2D++; return true; }
static void rs_EndOptimized2D() { g_bInOpt2D = 0; if (g_pStruct && g_pStruct->m_nInOptimized2D) g_pStruct->m_nInOptimized2D--; }
static bool rs_IsInOptimized2D() { return g_bInOpt2D != 0; }
static bool rs_SetOptimized2DBlend(LTSurfaceBlend blend) { g_OptBlend = blend; return true; }
static bool rs_GetOptimized2DBlend(LTSurfaceBlend &blend) { blend = g_OptBlend; return true; }
static bool rs_SetOptimized2DColor(HLTCOLOR color) { g_OptColor = color; return true; }
static bool rs_GetOptimized2DColor(HLTCOLOR &color) { color = g_OptColor; return true; }

static void ApplyCamera(SceneDesc *pScene)
{
	float aspect = (pScene->m_yFov > 0.001f) ? (pScene->m_xFov / pScene->m_yFov) : (4.0f / 3.0f);
	float fovY = pScene->m_yFov > 0.001f ? pScene->m_yFov * (180.0f / 3.14159265f) : 75.0f;

	glMatrixMode(GL_PROJECTION);
	glLoadIdentity();
	float n = 4.0f, f = 50000.0f;
	float t = n * (float)tan(fovY * 3.14159265f / 360.0f);
	float r = t * aspect;
	glFrustum(-r, r, -t, t, n, f);

	LTVector fdir = pScene->m_Rotation.Forward();
	LTVector up = pScene->m_Rotation.Up();
	LTVector pos = pScene->m_Pos;
	LTVector at;
	at.x = pos.x + fdir.x;
	at.y = pos.y + fdir.y;
	at.z = pos.z + fdir.z;

	glMatrixMode(GL_MODELVIEW);
	glLoadIdentity();
	/* gluLookAt replacement */
	LTVector zaxis;
	zaxis.x = pos.x - at.x; zaxis.y = pos.y - at.y; zaxis.z = pos.z - at.z;
	float zl = (float)sqrt(zaxis.x * zaxis.x + zaxis.y * zaxis.y + zaxis.z * zaxis.z);
	if (zl > 0.0001f) { zaxis.x /= zl; zaxis.y /= zl; zaxis.z /= zl; }
	LTVector xaxis;
	xaxis.x = up.y * zaxis.z - up.z * zaxis.y;
	xaxis.y = up.z * zaxis.x - up.x * zaxis.z;
	xaxis.z = up.x * zaxis.y - up.y * zaxis.x;
	float xl = (float)sqrt(xaxis.x * xaxis.x + xaxis.y * xaxis.y + xaxis.z * xaxis.z);
	if (xl > 0.0001f) { xaxis.x /= xl; xaxis.y /= xl; xaxis.z /= xl; }
	LTVector yaxis;
	yaxis.x = zaxis.y * xaxis.z - zaxis.z * xaxis.y;
	yaxis.y = zaxis.z * xaxis.x - zaxis.x * xaxis.z;
	yaxis.z = zaxis.x * xaxis.y - zaxis.y * xaxis.x;
	float m[16] = {
		xaxis.x, yaxis.x, zaxis.x, 0,
		xaxis.y, yaxis.y, zaxis.y, 0,
		xaxis.z, yaxis.z, zaxis.z, 0,
		-(xaxis.x * pos.x + xaxis.y * pos.y + xaxis.z * pos.z),
		-(yaxis.x * pos.x + yaxis.y * pos.y + yaxis.z * pos.z),
		-(zaxis.x * pos.x + zaxis.y * pos.y + zaxis.z * pos.z),
		1
	};
	glLoadMatrixf(m);
}

static int rs_RenderScene(SceneDesc *pScene)
{
	if (!pScene)
		return 0;
	glEnable(GL_DEPTH_TEST);
	glEnable(GL_CULL_FACE);
	glCullFace(GL_BACK);
	ApplyCamera(pScene);

	size_t i;
	glBegin(GL_TRIANGLES);
	for (i = 0; i < g_WorldTris.size(); ++i) {
		SWorldTri &t = g_WorldTris[i];
		int v;
		for (v = 0; v < 3; ++v) {
			uint32 c = t.v[v].m_nColor;
			glColor4ub((uint8)((c >> 16) & 0xFF), (uint8)((c >> 8) & 0xFF), (uint8)(c & 0xFF), (uint8)((c >> 24) & 0xFF));
			glTexCoord2f(t.v[v].m_fU0, t.v[v].m_fV0);
			glNormal3f(t.v[v].m_vNormal.x, t.v[v].m_vNormal.y, t.v[v].m_vNormal.z);
			glVertex3f(t.v[v].m_vPos.x, t.v[v].m_vPos.y, t.v[v].m_vPos.z);
		}
	}
	glEnd();
	return (int)g_WorldTris.size();
}

static void rs_RenderCommand(int, char **) {}

static void rs_SwapBuffers(uint)
{
	SDL_Window *w = (SDL_Window*)dsi_GetMainWindow();
	if (w)
		SDL_GL_SwapWindow(w);
}

static bool rs_GetScreenFormat(PFormat *pFormat)
{
	if (!pFormat)
		return false;
	pFormat->Init(BPP_32, 0xFF000000, 0x00FF0000, 0x0000FF00, 0x000000FF);
	return true;
}

static HLTBUFFER rs_CreateSurface(int width, int height)
{
	SGLSurf *s = new SGLSurf;
	s->w = width;
	s->h = height;
	s->pitch = width * 4;
	s->px = new uint8[s->pitch * height];
	memset(s->px, 0, s->pitch * height);
	s->tex = 0;
	s->optimized = 0;
	return (HLTBUFFER)s;
}

static void rs_DeleteSurface(HLTBUFFER hSurf)
{
	SGLSurf *s = (SGLSurf*)hSurf;
	if (!s)
		return;
	if (s->tex)
		glDeleteTextures(1, &s->tex);
	delete [] s->px;
	delete s;
}

static void rs_GetSurfaceInfo(HLTBUFFER hSurf, uint32 *pWidth, uint32 *pHeight)
{
	SGLSurf *s = (SGLSurf*)hSurf;
	if (!s)
		return;
	if (pWidth) *pWidth = (uint32)s->w;
	if (pHeight) *pHeight = (uint32)s->h;
}

static void* rs_LockSurface(HLTBUFFER hSurf, uint32& Pitch)
{
	SGLSurf *s = (SGLSurf*)hSurf;
	if (!s)
		return NULL;
	Pitch = (uint32)s->pitch;
	return s->px;
}

static void rs_UnlockSurface(HLTBUFFER hSurf)
{
	SGLSurf *s = (SGLSurf*)hSurf;
	if (!s)
		return;
	if (!s->tex)
		glGenTextures(1, &s->tex);
	UploadSurfacePixels(s->tex, s->w, s->h, s->px);
}

static bool rs_OptimizeSurface(HLTBUFFER hSurf, uint32)
{
	SGLSurf *s = (SGLSurf*)hSurf;
	if (!s)
		return false;
	if (!s->tex)
		glGenTextures(1, &s->tex);
	UploadSurfacePixels(s->tex, s->w, s->h, s->px);
	s->optimized = 1;
	return true;
}

static void rs_UnoptimizeSurface(HLTBUFFER hSurf)
{
	SGLSurf *s = (SGLSurf*)hSurf;
	if (s)
		s->optimized = 0;
}

static bool rs_LockScreen(int, int, int, int, void **pData, long *pPitch)
{
	if (!g_pScreen)
		return false;
	if (pData) *pData = g_pScreen;
	if (pPitch) *pPitch = g_nScreenPitch;
	g_bScreenLocked = 1;
	return true;
}

static void rs_UnlockScreen()
{
	g_bScreenLocked = 0;
}

static void rs_BlitToScreen(BlitRequest *pRequest)
{
	if (!pRequest || !pRequest->m_hBuffer)
		return;
	SGLSurf *s = (SGLSurf*)pRequest->m_hBuffer;
	if (!s->tex) {
		glGenTextures(1, &s->tex);
		UploadSurfacePixels(s->tex, s->w, s->h, s->px);
	}

	int dx0 = 0, dy0 = 0, dx1 = g_nWidth, dy1 = g_nHeight;
	if (pRequest->m_pDestRect) {
		dx0 = pRequest->m_pDestRect->left;
		dy0 = pRequest->m_pDestRect->top;
		dx1 = pRequest->m_pDestRect->right;
		dy1 = pRequest->m_pDestRect->bottom;
	}

	static int s_nBlitLog = 0;
	if (s_nBlitLog < 3) {
		fprintf(stderr, "BlitToScreen surf=%dx%d dest=(%d,%d)-(%d,%d) tex=%u\n",
			s->w, s->h, dx0, dy0, dx1, dy1, (unsigned)s->tex);
		++s_nBlitLog;
	}

	glDisable(GL_DEPTH_TEST);
	glEnable(GL_TEXTURE_2D);
	glEnable(GL_BLEND);
	glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
	glBindTexture(GL_TEXTURE_2D, s->tex);
	glMatrixMode(GL_PROJECTION);
	glPushMatrix();
	glLoadIdentity();
	glOrtho(0, g_nWidth, g_nHeight, 0, -1, 1);
	glMatrixMode(GL_MODELVIEW);
	glPushMatrix();
	glLoadIdentity();
	glColor4f(1, 1, 1, pRequest->m_Alpha);
	glBegin(GL_QUADS);
	glTexCoord2f(0, 0); glVertex2f((float)dx0, (float)dy0);
	glTexCoord2f(1, 0); glVertex2f((float)dx1, (float)dy0);
	glTexCoord2f(1, 1); glVertex2f((float)dx1, (float)dy1);
	glTexCoord2f(0, 1); glVertex2f((float)dx0, (float)dy1);
	glEnd();
	glPopMatrix();
	glMatrixMode(GL_PROJECTION);
	glPopMatrix();
	glMatrixMode(GL_MODELVIEW);
}

static bool rs_WarpToScreen(BlitRequest *pRequest)
{
	rs_BlitToScreen(pRequest);
	return true;
}

static void rs_MakeScreenShot(const char *) {}
static void rs_MakeCubicEnvMap(const char*, uint32, const SceneDesc&) {}
static void rs_ReadConsoleVariables() {}
static void rs_GetRenderInfo(RenderInfoStruct *p)
{
	if (p) {
		p->m_dwWorldPolysDrawn = (uint32)g_WorldTris.size();
		p->m_dwWorldPolysProcessed = p->m_dwWorldPolysDrawn;
		p->m_dwModelPolysDrawn = 0;
	}
}

static void rs_BlitFromScreen(BlitRequest *) {}

static CRenderObject* rs_CreateRenderObject(CRenderObject::RENDER_OBJECT_TYPES)
{
	return new CRenderObject();
}
static bool rs_DestroyRenderObject(CRenderObject *p)
{
	delete p;
	return true;
}

static bool SkipGeometryPoly(ILTStream *p)
{
	uint8 nVertCount = 0;
	*p >> nVertCount;
	uint8 i;
	for (i = 0; i < nVertCount; ++i) {
		LTVector v;
		*p >> v;
	}
	LTVector n;
	float d;
	*p >> n;
	*p >> d;
	return p->ErrorStatus() == LT_OK;
}

static bool SkipOccluder(ILTStream *p)
{
	if (!SkipGeometryPoly(p))
		return false;
	uint32 id;
	*p >> id;
	return p->ErrorStatus() == LT_OK;
}

static bool SkipSubLM(ILTStream *p)
{
	uint32 a, b, c, d, nDataSize;
	*p >> a >> b >> c >> d >> nDataSize;
	if (nDataSize) {
		std::vector<uint8> tmp(nDataSize);
		p->Read(&tmp[0], nDataSize);
	}
	return p->ErrorStatus() == LT_OK;
}

static bool SkipLightGroup(ILTStream *p)
{
	uint16 nLength = 0;
	*p >> nLength;
	uint16 i;
	for (i = 0; i < nLength; ++i) {
		uint8 ch;
		*p >> ch;
	}
	LTVector col;
	*p >> col;
	uint32 nDataLength = 0;
	*p >> nDataLength;
	if (nDataLength) {
		std::vector<uint8> tmp(nDataLength);
		p->Read(&tmp[0], nDataLength);
	}
	uint32 nSectionLMSize = 0;
	*p >> nSectionLMSize;
	uint32 s;
	for (s = 0; s < nSectionLMSize; ++s) {
		uint32 nSubLMSize = 0;
		*p >> nSubLMSize;
		uint32 k;
		for (k = 0; k < nSubLMSize; ++k) {
			if (!SkipSubLM(p))
				return false;
		}
	}
	return p->ErrorStatus() == LT_OK;
}

static bool LoadOneRenderBlock(ILTStream *pStream)
{
	LTVector center, half;
	*pStream >> center;
	*pStream >> half;

	uint32 nSectionCount = 0;
	*pStream >> nSectionCount;
	std::vector<SRenderSect> sections;
	uint32 nIndexOffset = 0;
	uint32 si;
	for (si = 0; si < nSectionCount; ++si) {
		char sTextureName[2][261];
		int t;
		for (t = 0; t < 2; ++t)
			pStream->ReadString(sTextureName[t], sizeof(sTextureName[t]));
		uint8 nShaderCode;
		uint32 nTriCount;
		char sTextureEffect[261];
		*pStream >> nShaderCode;
		*pStream >> nTriCount;
		pStream->ReadString(sTextureEffect, sizeof(sTextureEffect));

		SRenderSect s;
		s.startIndex = nIndexOffset;
		s.triCount = nTriCount;
		s.tex = NULL;
		if (sTextureName[0][0] && g_pStruct && g_pStruct->GetSharedTexture)
			s.tex = g_pStruct->GetSharedTexture(sTextureName[0]);
		sections.push_back(s);
		nIndexOffset += nTriCount * 3;

		uint32 lmW, lmH, lmSize;
		*pStream >> lmW >> lmH >> lmSize;
		if (lmSize) {
			std::vector<uint8> lm(lmSize);
			pStream->Read(&lm[0], lmSize);
		}
	}

	uint32 nVertexCount = 0;
	*pStream >> nVertexCount;
	std::vector<SRBVert> verts;
	if (nVertexCount) {
		verts.resize(nVertexCount);
		pStream->Read(&verts[0], sizeof(SRBVert) * nVertexCount);
	}

	uint32 nTriCount = 0;
	*pStream >> nTriCount;
	std::vector<uint16> indices;
	if (nTriCount) {
		indices.resize(nTriCount * 3);
		uint32 tri;
		uint32 off = 0;
		for (tri = 0; tri < nTriCount; ++tri) {
			uint32 i0, i1, i2, poly;
			*pStream >> i0 >> i1 >> i2 >> poly;
			indices[off++] = (uint16)i0;
			indices[off++] = (uint16)i1;
			indices[off++] = (uint16)i2;
		}
	}

	uint32 nSkyPortalCount = 0;
	*pStream >> nSkyPortalCount;
	uint32 sp;
	for (sp = 0; sp < nSkyPortalCount; ++sp) {
		if (!SkipGeometryPoly(pStream))
			return false;
	}

	uint32 nOccluderCount = 0;
	*pStream >> nOccluderCount;
	for (sp = 0; sp < nOccluderCount; ++sp) {
		if (!SkipOccluder(pStream))
			return false;
	}

	uint32 nLightGroupCount = 0;
	*pStream >> nLightGroupCount;
	for (sp = 0; sp < nLightGroupCount; ++sp) {
		if (!SkipLightGroup(pStream))
			return false;
	}

	uint8 nChildFlags = 0;
	*pStream >> nChildFlags;
	int c;
	for (c = 0; c < 2; ++c) {
		uint32 idx;
		*pStream >> idx;
	}

	if (pStream->ErrorStatus() != LT_OK)
		return false;

	size_t sec;
	for (sec = 0; sec < sections.size(); ++sec) {
		uint32 t;
		for (t = 0; t < sections[sec].triCount; ++t) {
			uint32 base = sections[sec].startIndex + t * 3;
			if (base + 2 >= indices.size())
				break;
			SWorldTri tri;
			tri.tex = sections[sec].tex;
			int v;
			for (v = 0; v < 3; ++v) {
				uint16 idx = indices[base + v];
				if (idx < verts.size())
					tri.v[v] = verts[idx];
			}
			g_WorldTris.push_back(tri);
		}
	}
	return true;
}

static bool LoadWorldRecursive(ILTStream *pStream)
{
	uint32 nRenderBlockCount = 0;
	*pStream >> nRenderBlockCount;
	if (pStream->ErrorStatus() != LT_OK)
		return false;

	uint32 i;
	for (i = 0; i < nRenderBlockCount; ++i) {
		if (!LoadOneRenderBlock(pStream)) {
			uint32 len = 0, pos = 0;
			pStream->GetLen(&len);
			pStream->GetPos(&pos);
			if (pos < len)
				pStream->SeekTo(len);
			return false;
		}
	}

	uint32 nNumWorldModels = 0;
	*pStream >> nNumWorldModels;
	for (i = 0; i < nNumWorldModels; ++i) {
		char name[65];
		pStream->ReadString(name, sizeof(name));
		if (!LoadWorldRecursive(pStream))
			return false;
	}
	return pStream->ErrorStatus() == LT_OK;
}

static bool rs_LoadWorldData(ILTStream *pStream)
{
	g_WorldTris.clear();
	if (!pStream)
		return false;
	bool ok = LoadWorldRecursive(pStream);
	if (!ok) {
		uint32 len = 0;
		pStream->GetLen(&len);
		pStream->SeekTo(len);
		dsi_PrintToConsole("LoadWorldData: parse stopped, skipped remainder (%u tris kept)",
			(unsigned)g_WorldTris.size());
		return false;
	}
	dsi_PrintToConsole("LoadWorldData: %u world triangles", (unsigned)g_WorldTris.size());
	return true;
}

static bool rs_SetLightGroupColor(uint32, const LTVector &) { return true; }
static LTRESULT rs_SetOccluderEnabled(uint32, bool) { return LT_OK; }
static LTRESULT rs_GetOccluderEnabled(uint32, bool *p) { if (p) *p = true; return LT_OK; }
static uint32 rs_GetTextureEffectVarID(const char*, uint32) { return 0; }
static bool rs_SetTextureEffectVar(uint32, uint32, float) { return true; }
static bool rs_IsObjectGroupEnabled(uint32) { return true; }
static void rs_SetObjectGroupEnabled(uint32, bool) {}
static void rs_SetAllObjectGroupEnabled() {}
static bool rs_AddGlowRenderStyleMapping(const char*, const char*) { return true; }
static bool rs_SetGlowDefaultRenderStyle(const char*) { return true; }
static bool rs_SetNoGlowRenderStyle(const char*) { return true; }

RMode* rdll_GetSupportedModes()
{
	RMode *p = new RMode;
	memset(p, 0, sizeof(*p));
	p->m_Width = 1024;
	p->m_Height = 768;
	p->m_BitDepth = 32;
	p->m_bHWTnL = true;
	LTStrCpy(p->m_InternalName, "SDL/OpenGL", sizeof(p->m_InternalName));
	LTStrCpy(p->m_Description, "SDL OpenGL", sizeof(p->m_Description));
	p->m_pNext = NULL;
	return p;
}

void rdll_FreeModeList(RMode *pModes)
{
	while (pModes) {
		RMode *n = pModes->m_pNext;
		delete pModes;
		pModes = n;
	}
}

void rdll_RenderDLLSetup(RenderStruct *pStruct)
{
	g_pStruct = pStruct;
	pStruct->Init = rs_Init;
	pStruct->Term = rs_Term;
	pStruct->GetD3DDevice = rs_GetD3DDevice;
	pStruct->BindTexture = rs_BindTexture;
	pStruct->UnbindTexture = rs_UnbindTexture;
	pStruct->GetTextureDDFormat1 = rs_GetTextureDDFormat1;
	pStruct->QueryDDSupport = rs_QueryDDSupport;
	pStruct->GetTextureDDFormat2 = rs_GetTextureDDFormat2;
	pStruct->ConvertTexDataToDD = rs_ConvertTexDataToDD;
	pStruct->DrawPrimSetTexture = rs_DrawPrimSetTexture;
	pStruct->DrawPrimDisableTextures = rs_DrawPrimDisableTextures;
	pStruct->CreateContext = rs_CreateContext;
	pStruct->DeleteContext = rs_DeleteContext;
	pStruct->Clear = rs_Clear;
	pStruct->Start3D = rs_Start3D;
	pStruct->End3D = rs_End3D;
	pStruct->IsIn3D = rs_IsIn3D;
	pStruct->StartOptimized2D = rs_StartOptimized2D;
	pStruct->EndOptimized2D = rs_EndOptimized2D;
	pStruct->IsInOptimized2D = rs_IsInOptimized2D;
	pStruct->SetOptimized2DBlend = rs_SetOptimized2DBlend;
	pStruct->GetOptimized2DBlend = rs_GetOptimized2DBlend;
	pStruct->SetOptimized2DColor = rs_SetOptimized2DColor;
	pStruct->GetOptimized2DColor = rs_GetOptimized2DColor;
	pStruct->RenderScene = rs_RenderScene;
	pStruct->RenderCommand = rs_RenderCommand;
	pStruct->SwapBuffers = rs_SwapBuffers;
	pStruct->GetScreenFormat = rs_GetScreenFormat;
	pStruct->CreateSurface = rs_CreateSurface;
	pStruct->DeleteSurface = rs_DeleteSurface;
	pStruct->GetSurfaceInfo = rs_GetSurfaceInfo;
	pStruct->LockSurface = rs_LockSurface;
	pStruct->UnlockSurface = rs_UnlockSurface;
	pStruct->OptimizeSurface = rs_OptimizeSurface;
	pStruct->UnoptimizeSurface = rs_UnoptimizeSurface;
	pStruct->LockScreen = rs_LockScreen;
	pStruct->UnlockScreen = rs_UnlockScreen;
	pStruct->BlitToScreen = rs_BlitToScreen;
	pStruct->WarpToScreen = rs_WarpToScreen;
	pStruct->MakeScreenShot = rs_MakeScreenShot;
	pStruct->MakeCubicEnvMap = rs_MakeCubicEnvMap;
	pStruct->ReadConsoleVariables = rs_ReadConsoleVariables;
	pStruct->GetRenderInfo = rs_GetRenderInfo;
	pStruct->BlitFromScreen = rs_BlitFromScreen;
	pStruct->CreateRenderObject = rs_CreateRenderObject;
	pStruct->DestroyRenderObject = rs_DestroyRenderObject;
	pStruct->LoadWorldData = rs_LoadWorldData;
	pStruct->SetLightGroupColor = rs_SetLightGroupColor;
	pStruct->SetOccluderEnabled = rs_SetOccluderEnabled;
	pStruct->GetOccluderEnabled = rs_GetOccluderEnabled;
	pStruct->GetTextureEffectVarID = rs_GetTextureEffectVarID;
	pStruct->SetTextureEffectVar = rs_SetTextureEffectVar;
	pStruct->IsObjectGroupEnabled = rs_IsObjectGroupEnabled;
	pStruct->SetObjectGroupEnabled = rs_SetObjectGroupEnabled;
	pStruct->SetAllObjectGroupEnabled = rs_SetAllObjectGroupEnabled;
	pStruct->AddGlowRenderStyleMapping = rs_AddGlowRenderStyleMapping;
	pStruct->SetGlowDefaultRenderStyle = rs_SetGlowDefaultRenderStyle;
	pStruct->SetNoGlowRenderStyle = rs_SetNoGlowRenderStyle;
}

SharedTexture *sdl_render_GetDrawPrimTexture()
{
	return g_pDrawPrimTex;
}

int sdl_render_Width() { return g_nWidth; }
int sdl_render_Height() { return g_nHeight; }
