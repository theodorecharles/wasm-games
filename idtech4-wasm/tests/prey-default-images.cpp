#include <EGL/egl.h>
#include <GLES2/gl2.h>
#include <cstdio>
#include <stdexcept>
#include <string>
#include <vector>

using byte=unsigned char;
enum { TT_2D, TT_CUBIC, TF_NEAREST, TR_REPEAT, TD_HIGH_QUALITY };
struct Cvar { bool value=false; bool GetBool() const {return value;} } com_developer;
struct Common { void Error(const char *,int) {throw std::runtime_error("bad format");} } commonInstance;
Common *common=&commonInstance;
struct idImage {
    static constexpr GLuint TEXTURE_NOT_LOADED=GLuint(-1);
    GLuint texnum=TEXTURE_NOT_LOADED;
    int type=TT_2D,uploadWidth=0,uploadHeight=0,internalFormat=0;
    bool defaulted=false;
    std::string imgName;
    void MakeDefault();
    void PurgeImage();
    int BitsForInternalFormat(int) const;
    int StorageSize() const;
    // Driver-backed surroundings for the production functions under test.
    void GenerateImage(const byte *pixels,int width,int height,int,bool,int,int) {
        PurgeImage();
        glGenTextures(1,&texnum);
        glBindTexture(GL_TEXTURE_2D,texnum);
        glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA,width,height,0,GL_RGBA,GL_UNSIGNED_BYTE,pixels);
        glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MIN_FILTER,GL_NEAREST);
        glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MAG_FILTER,GL_NEAREST);
        uploadWidth=width; uploadHeight=height; type=TT_2D; internalFormat=GL_RGBA;
    }
};
struct Images {idImage *defaultImage;} images;
Images *globalImages=&images;
#define qglDeleteTextures glDeleteTextures
#define DEFAULT_SIZE 16
#define BLOCK_SIZE 4
#include "prey-default-production.h"

static bool first=true;
void check(const char *label,bool passed) {
    std::printf("%s{\"label\":\"%s\",\"passed\":%s}",first?"":",",label,passed?"true":"false");
    first=false;
}
bool pixelsMatch(const idImage &image,bool checker) {
    if (!glIsTexture(image.texnum)) return false;
    GLuint fbo; glGenFramebuffers(1,&fbo); glBindFramebuffer(GL_FRAMEBUFFER,fbo);
    glFramebufferTexture2D(GL_FRAMEBUFFER,GL_COLOR_ATTACHMENT0,GL_TEXTURE_2D,image.texnum,0);
    bool valid=glCheckFramebufferStatus(GL_FRAMEBUFFER)==GL_FRAMEBUFFER_COMPLETE;
    std::vector<byte> pixels(16*16*4,77);
    if (valid) glReadPixels(0,0,16,16,GL_RGBA,GL_UNSIGNED_BYTE,pixels.data());
    glBindFramebuffer(GL_FRAMEBUFFER,0); glDeleteFramebuffers(1,&fbo);
    for(int y=0;y<16;y++) for(int x=0;x<16;x++) for(int c=0;c<4;c++) {
        const bool pink=((x/4+y/4)&1)==0;
        const int expected=checker ? (c==3 || (pink && (c==0 || c==2)) ? 255 : 0) : 0;
        valid=valid && pixels[(y*16+x)*4+c]==expected;
    }
    return valid;
}
int main() {
    EGLDisplay display=eglGetDisplay(EGL_DEFAULT_DISPLAY);
    if (!eglInitialize(display,nullptr,nullptr) || !eglBindAPI(EGL_OPENGL_ES_API)) return 2;
    const EGLint attrs[]={EGL_SURFACE_TYPE,EGL_PBUFFER_BIT,EGL_RENDERABLE_TYPE,EGL_OPENGL_ES2_BIT,
        EGL_RED_SIZE,8,EGL_GREEN_SIZE,8,EGL_BLUE_SIZE,8,EGL_ALPHA_SIZE,8,EGL_NONE};
    EGLConfig config; EGLint count;
    if (!eglChooseConfig(display,attrs,&config,1,&count) || count!=1) return 3;
    const EGLint surfaceAttrs[]={EGL_WIDTH,16,EGL_HEIGHT,16,EGL_NONE};
    const EGLint contextAttrs[]={EGL_CONTEXT_CLIENT_VERSION,2,EGL_NONE};
    EGLSurface surface=eglCreatePbufferSurface(display,config,surfaceAttrs);
    EGLContext context=eglCreateContext(display,config,EGL_NO_CONTEXT,contextAttrs);
    if (!eglMakeCurrent(display,surface,surface,context)) return 4;
    std::printf("{\"driver\":\"%s\",\"cases\":[",glGetString(GL_RENDERER));
    idImage fallback; fallback.imgName="_default"; images.defaultImage=&fallback;
    fallback.MakeDefault();
    check("generated-default-valid",glIsTexture(fallback.texnum) && fallback.defaulted && fallback.internalFormat==GL_RGBA);
    idImage a,b; a.imgName="missing/a"; b.imgName="missing/b";
    a.MakeDefault(); b.MakeDefault();
    check("first-missing-owns-texture",a.texnum!=fallback.texnum && glIsTexture(a.texnum));
    check("second-missing-owns-texture",b.texnum!=a.texnum && b.texnum!=fallback.texnum && glIsTexture(b.texnum));
    bool accounted=false;
    try {accounted=a.StorageSize()==1365 && b.StorageSize()==1365;} catch(const std::runtime_error &) {}
    check("missing-images-have-rgba-accounting",accounted);
    check("transparent-fallback-pixels-preserved",pixelsMatch(a,false) && pixelsMatch(b,false));
    a.PurgeImage();
    check("purged-image-marked-unloaded",a.texnum==idImage::TEXTURE_NOT_LOADED && a.StorageSize()==0);
    check("purge-preserves-other-images",glIsTexture(fallback.texnum) && glIsTexture(b.texnum));
    fallback.MakeDefault();
    check("default-regeneration-preserves-missing-image",b.texnum!=fallback.texnum && glIsTexture(b.texnum) && pixelsMatch(b,false));
    const byte replacement[4]={70,120,180,255};
    a.GenerateImage(replacement,1,1,TF_NEAREST,false,TR_REPEAT,TD_HIGH_QUALITY);
    check("replacement-preserves-other-images",a.texnum!=b.texnum && a.texnum!=fallback.texnum && b.texnum!=fallback.texnum && glIsTexture(b.texnum) && glIsTexture(fallback.texnum));
    com_developer.value=true;
    idImage debug; debug.imgName="missing/debug"; debug.MakeDefault();
    check("developer-checker-pixels-preserved",pixelsMatch(debug,true));
    check("no-gl-errors",glGetError()==GL_NO_ERROR);
    std::printf("]}\n");
    eglMakeCurrent(display,EGL_NO_SURFACE,EGL_NO_SURFACE,EGL_NO_CONTEXT);
    eglDestroyContext(display,context); eglDestroySurface(display,surface); eglTerminate(display);
}
