#ifndef PORT_ENGINE_D3D9TYPES_H
#define PORT_ENGINE_D3D9TYPES_H

#include <d3d9.h>

#ifndef D3DVECTOR_DEFINED
#define D3DVECTOR_DEFINED
typedef struct _D3DVECTOR {
	float x, y, z;
} D3DVECTOR;
#endif

#ifndef D3DMATRIX_DEFINED
#define D3DMATRIX_DEFINED
typedef struct _D3DMATRIX {
	union {
		struct {
			float _11, _12, _13, _14;
			float _21, _22, _23, _24;
			float _31, _32, _33, _34;
			float _41, _42, _43, _44;
		};
		float m[4][4];
	};
} D3DMATRIX;
#endif

#ifndef D3DCOLOR_ARGB
#define D3DCOLOR_ARGB(a,r,g,b) \
	((D3DCOLOR)((((a)&0xff)<<24)|(((r)&0xff)<<16)|(((g)&0xff)<<8)|((b)&0xff)))
#endif

#endif
