#include "idlib/precompiled.h"
// Test-only access to configure encoded image metadata without invoking a
// retail file loader. Allocation, upload, conversion and DXT decoding remain
// the actual linked engine's implementations.
#define private public
#include "renderer/tr_local.h"
#undef private
#include <emscripten.h>
#include "sys/emscripten/webgl_compat.h"

static idImage *image;
static idImage *copySourceImage;
static idRenderTexture *copySourceTarget;

static void Q4TestCompressedImage(unsigned target, int level, unsigned format,
    int width, int height, int border, int size, const void *pixels) {
    EM_ASM({ GLctx.compressedTexImage2D($0,$1,$2,$3,$4,$5,HEAPU8,$7>>>0,$6); },
        target, level, format, width, height, border, size, pixels);
}
static void Q4TestCompressedSubImage(unsigned target, int level, int x, int y,
    int width, int height, unsigned format, int size, const void *pixels) {
    EM_ASM({ GLctx.compressedTexSubImage2D($0,$1,$2,$3,$4,$5,$6,HEAPU8,$8>>>0,$7); },
        target, level, x, y, width, height, format, size, pixels);
}

extern "C" EMSCRIPTEN_KEEPALIVE void Q4ImageInit() {
    idLib::common = common;
    idLib::sys = sys;
    idLib::cvarSystem = cvarSystem;
    idLib::fileSystem = fileSystem;
    idStr::InitMemory();
    cvarSystem->Init();
    idCVar::RegisterStaticVars();
    glConfig.isInitialized = true;
    glConfig.maxTextureAnisotropy = 1;
    // Only the final GL submission is intercepted by the recording sink.
    __glewCompressedTexImage2DARB = Q4TestCompressedImage;
    __glewCompressedTexSubImage2DARB = Q4TestCompressedSubImage;
    __glewGenFramebuffers = reinterpret_cast<PFNGLGENFRAMEBUFFERSPROC>(Q4WASM_GetGLProcAddress("glGenFramebuffers"));
    __glewDeleteFramebuffers = reinterpret_cast<PFNGLDELETEFRAMEBUFFERSPROC>(Q4WASM_GetGLProcAddress("glDeleteFramebuffers"));
    __glewBindFramebuffer = reinterpret_cast<PFNGLBINDFRAMEBUFFERPROC>(Q4WASM_GetGLProcAddress("glBindFramebuffer"));
    __glewFramebufferTexture2D = reinterpret_cast<PFNGLFRAMEBUFFERTEXTURE2DPROC>(Q4WASM_GetGLProcAddress("glFramebufferTexture2D"));
    __glewBlitFramebuffer = reinterpret_cast<PFNGLBLITFRAMEBUFFERPROC>(Q4WASM_GetGLProcAddress("glBlitFramebuffer"));
    glConfig.vidWidth = 640;
    glConfig.vidHeight = 480;
}

extern "C" EMSCRIPTEN_KEEPALIVE void Q4ImageBegin(int scenario, int width, int height, int levels, int cube) {
    if (image) { image->PurgeImage(); delete image; }
    image = new idImage("q4-native-image-probe");
    image->opts.width = width;
    image->opts.height = height;
    image->opts.numLevels = levels;
    image->opts.textureType = cube ? TT_CUBIC : TT_2D;
    image->opts.format = FMT_RGBA8;
    image->repeat = TR_CLAMP;
    switch (scenario) {
        case 0: image->opts.format = FMT_ALPHA; break;
        case 1: image->opts.format = FMT_LUM8; break;
        case 2: image->opts.format = FMT_INT8; break;
        case 3: image->opts.format = FMT_L8A8; break;
        case 4: image->opts.format = FMT_RGB565; break;
        case 5: image->opts.format = FMT_XRGB8; break;
        case 6: image->usage = TD_BUMP; break;
        case 7: image->opts.colorFormat = CFM_GREEN_ALPHA; break;
        case 8: image->opts.format = FMT_DXT1; break;
        case 9: image->opts.format = FMT_DXT5; break;
        case 10: image->opts.format = FMT_DXT1; image->opts.colorFormat = CFM_GREEN_ALPHA; break;
        case 11: image->opts.format = FMT_DXT1; image->usage = TD_BUMP; break;
        case 12: image->opts.format = FMT_DXT5; image->opts.colorFormat = CFM_NORMAL_DXT5; image->usage = TD_BUMP; break;
        case 13: image->opts.format = FMT_DXT5; image->opts.colorFormat = CFM_YCOCG_DXT5; break;
        case 14: image->opts.format = FMT_RGBA16F; break;
        case 15: image->opts.format = FMT_DEPTH; break;
        case 16: image->opts.format = FMT_DEPTH_STENCIL; break;
        default: break;
    }
    image->AllocImage();
}

extern "C" EMSCRIPTEN_KEEPALIVE int Q4ImageMetadata(int field) {
    switch (field) {
        case 0: return image->internalFormat;
        case 1: return image->dataFormat;
        case 2: return image->dataType;
        case 3: return image->opts.format;
        case 4: return image->IsCompressed();
        case 6: return image->StorageSize();
        default: return image->opts.colorFormat;
    }
}

extern "C" EMSCRIPTEN_KEEPALIVE void Q4ImageUpload(int level, int x, int y, int side,
    int width, int height, const void *pixels, int pitch) {
    image->SubImageUpload(level, x, y, side, width, height, pixels, pitch);
}

extern "C" EMSCRIPTEN_KEEPALIVE void Q4ImageResize(int width, int height) {
    image->Resize(width, height);
}

extern "C" EMSCRIPTEN_KEEPALIVE void Q4ImageSampler(int repeat, int filter, int anisotropy, int maximum) {
    const textureRepeat_t repeats[] = {TR_CLAMP, TR_CLAMP_TO_ZERO, TR_CLAMP_TO_ZERO_ALPHA, TR_REPEAT, TR_MIRRORED_REPEAT};
    const textureFilter_t filters[] = {TF_DEFAULT, TF_LINEAR, TF_NEAREST};
    assert(repeat >= 0 && repeat < 5 && filter >= 0 && filter < 3);
    glConfig.maxTextureAnisotropy = maximum;
    cvarSystem->SetCVarInteger("image_anisotropy", anisotropy);
    image->SetSamplerState(filters[filter], repeats[repeat]);
}

extern "C" EMSCRIPTEN_KEEPALIVE void Q4ImageRefreshSampler() {
    R_BindTextureForDirectAccess(GL_TEXTURE_2D, image->texnum);
    image->SetTexParameters();
}

extern "C" EMSCRIPTEN_KEEPALIVE int Q4ImageTestFramebuffer() {
    GLuint name = 0;
    glGenFramebuffers(1, &name);
    return name;
}

extern "C" EMSCRIPTEN_KEEPALIVE int Q4ImageCopySource(int kind) {
    backEnd.renderTexture = NULL;
    if (copySourceTarget) { delete copySourceTarget; copySourceTarget = NULL; }
    if (copySourceImage) { delete copySourceImage; copySourceImage = NULL; }
    if (kind < 0) return 0;
    copySourceImage = new idImage("q4-copy-source-probe");
    copySourceImage->opts.width = 640;
    copySourceImage->opts.height = 480;
    copySourceImage->opts.numLevels = 1;
    copySourceImage->opts.format = kind ? FMT_RGBA16F : FMT_RGBA8;
    copySourceImage->repeat = TR_CLAMP;
    copySourceImage->AllocImage();
    copySourceTarget = new idRenderTexture(copySourceImage, NULL);
    // Only source FBO contents are a fixture; copying, source format selection,
    // resolve allocation and state restoration use the actual linked engine.
    copySourceTarget->deviceHandle = Q4ImageTestFramebuffer();
    copySourceTarget->deviceHandleGeneration = tr.videoRestartCount;
    copySourceTarget->CaptureAttachmentHandles();
    backEnd.renderTexture = copySourceTarget;
    return copySourceTarget->GetDeviceHandle();
}

extern "C" EMSCRIPTEN_KEEPALIVE void Q4ImageCopy(int x, int y, int width, int height) {
    image->CopyFramebuffer(x, y, width, height);
}

extern "C" EMSCRIPTEN_KEEPALIVE void Q4ImageCopyPurge() {
    R_PurgeFramebufferCopyFBOs();
}

extern "C" EMSCRIPTEN_KEEPALIVE int Q4ImageError() {
    return glGetError();
}

extern "C" EMSCRIPTEN_KEEPALIVE void Q4ImageFinish() {
    Q4ImageCopySource(-1);
    R_PurgeFramebufferCopyFBOs();
    if (image) { image->PurgeImage(); delete image; image = NULL; }
    glConfig.isInitialized = false;
}
