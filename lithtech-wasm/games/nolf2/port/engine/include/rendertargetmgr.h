#ifndef PORT_RENDERTARGETMGR_H
#define PORT_RENDERTARGETMGR_H
class CRenderTargetMgr {
public:
	static CRenderTargetMgr &GetSingleton() { static CRenderTargetMgr s; return s; }
};
#endif
