#include "bdefs.h"
#include "ltrendermgr_impl.h"

define_interface(CLTRenderMgr, ILTRenderMgr);

void CLTRenderMgr::Init() {}
void CLTRenderMgr::Term() {}

LTRESULT CLTRenderMgr::AddEffectShader(const char *, int, const uint32 *, uint32, HEFFECTPOOL)
{ return LT_ERROR; }
LTEffectShader *CLTRenderMgr::GetEffectShader(int) { return NULL; }
LTRESULT CLTRenderMgr::CreateEffectPool(HEFFECTPOOL) { return LT_ERROR; }
LTRESULT CLTRenderMgr::CreateRenderTarget(uint32, uint32, ERenderTargetFormat, EStencilBufferFormat, HRENDERTARGET)
{ return LT_ERROR; }
LTRESULT CLTRenderMgr::InstallRenderTarget(HRENDERTARGET) { return LT_ERROR; }
LTRESULT CLTRenderMgr::RemoveRenderTarget(HRENDERTARGET) { return LT_ERROR; }
LTRESULT CLTRenderMgr::StretchRectRenderTargetToBackBuffer(HRENDERTARGET) { return LT_ERROR; }
LTRESULT CLTRenderMgr::GetRenderTargetDims(HRENDERTARGET, uint32 &, uint32) { return LT_ERROR; }
LTRESULT CLTRenderMgr::StoreDefaultRenderTarget() { return LT_OK; }
LTRESULT CLTRenderMgr::RestoreDefaultRenderTarget() { return LT_OK; }
LTRESULT CLTRenderMgr::UploadCurrentFrameToEffect(LTEffectShader *, const char *) { return LT_ERROR; }
LTRESULT CLTRenderMgr::UploadPreviousFrameToEffect(LTEffectShader *, const char *) { return LT_ERROR; }
LTRESULT CLTRenderMgr::SnapshotCurrentFrame() { return LT_OK; }
LTRESULT CLTRenderMgr::SaveCurrentFrameToPrevious() { return LT_OK; }
