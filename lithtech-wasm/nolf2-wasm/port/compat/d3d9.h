#ifndef PORT_D3D9_H
#define PORT_D3D9_H

/* Minimal D3D9 types so renderstruct.h can compile without DirectX. */

#include <stdint.h>

#ifndef __D3D9_H__
#define __D3D9_H__
#endif

struct IDirect3DDevice9;
struct IDirect3DTexture9;
struct IDirect3DSurface9;
struct IDirect3DVertexBuffer9;
struct IDirect3DIndexBuffer9;

typedef struct IDirect3DDevice9 *LPDIRECT3DDEVICE9;

typedef enum _D3DFORMAT {
	D3DFMT_UNKNOWN = 0,
	D3DFMT_R8G8B8 = 20,
	D3DFMT_A8R8G8B8 = 21,
	D3DFMT_X8R8G8B8 = 22,
	D3DFMT_R5G6B5 = 23,
	D3DFMT_X1R5G5B5 = 24,
	D3DFMT_A1R5G5B5 = 25,
	D3DFMT_A4R4G4B4 = 26,
	D3DFMT_P8 = 41,
	D3DFMT_A8P8 = 40,
	D3DFMT_DXT1 = 827611204,
	D3DFMT_DXT3 = 861165636,
	D3DFMT_DXT5 = 894720068,
	D3DFMT_D16 = 80,
	D3DFMT_D24S8 = 75
} D3DFORMAT;

#ifndef D3DCOLOR_DEFINED
#define D3DCOLOR_DEFINED
typedef uint32_t D3DCOLOR;
#endif

#ifndef D3DCOLOR_ARGB
#define D3DCOLOR_ARGB(a,r,g,b) \
	((D3DCOLOR)((((a)&0xff)<<24)|(((r)&0xff)<<16)|(((g)&0xff)<<8)|((b)&0xff)))
#endif

#ifndef D3D_OK
#define D3D_OK 0
#endif

#ifndef D3DCAPS9_DEFINED
#define D3DCAPS9_DEFINED
typedef struct _D3DCAPS9 {
	uint32_t PixelShaderVersion;
	uint32_t VertexShaderVersion;
} D3DCAPS9;
#endif

struct IDirect3DDevice9 {
	HRESULT GetDeviceCaps(D3DCAPS9 *pCaps) {
		if (!pCaps)
			return -1;
		pCaps->PixelShaderVersion = 0;
		pCaps->VertexShaderVersion = 0;
		return D3D_OK;
	}
};

#endif
