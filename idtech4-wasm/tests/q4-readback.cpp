#include <EGL/egl.h>
#ifdef Q4_READBACK_DESKTOP
#define GL_GLEXT_PROTOTYPES
#include <GL/gl.h>
#include <GL/glext.h>
#else
#include <GLES3/gl3.h>
#endif
#include <algorithm>
#include <array>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <string>
#include <vector>

using byte=unsigned char;
// Native scene/window surroundings only; the two tested functions are copied
// verbatim from production. Every GL call goes to the real EGL driver.
struct renderView_t {};
struct renderCrop_t { int x=0,y=0,width=0,height=0; };
struct { bool isInitialized=true; int vidWidth=640,vidHeight=480; } glConfig;
struct Cvar { bool value=false; bool GetBool() const { return value; } void SetBool(bool v){value=v;} };
static Cvar r_useScissor{true},r_skipBackEnd,r_frontBuffer;
static void paintFrame();
struct Gui { void EmitFullScreen(){} void Clear(){} } gui;
struct World { void RenderScene(renderView_t*,int=0){paintFrame();} } world;
struct idRenderSystemLocal {
    bool takingScreenshot=false;
    int tiledViewport[2]={0,0},viewportOffset[2]={0,0};
    renderCrop_t renderCrops[1]; int currentRenderCrop=0;
    Gui *guiModel=&gui; World *primaryWorld=&world;
    bool (*portalSkyCaptureViewCallback)(renderView_t*,renderView_t*)=nullptr;
    void BeginFrame(int,int){}
    void CaptureRenderToFile(const char*,bool);
} tr;
struct Session { void UpdateScreen(){paintFrame();} } sessionValue;
static Session *session=&sessionValue;
struct Command { int commandId=0; Command *next=nullptr; } command;
struct Frame { Command *cmdHead=&command; } frame;
static Frame *frameData=&frame;
enum { RC_NOP=0,RF_DEFER_COMMAND_SUBMIT=1,RF_PORTAL_SKY=2 };
static void RB_ExecuteBackEndCommands(Command*){paintFrame();}
static void R_ClearCommandChain(){}
static void R_IssueRenderCommands(){paintFrame();}
static bool guardsIntact=true;
static std::map<void*,std::vector<byte>> allocations;
static constexpr size_t guard=8192;
static void *R_StaticAlloc(size_t bytes) {
    std::vector<byte> storage(bytes+2*guard,0xcc);
    void *pointer=storage.data()+guard;
    allocations.emplace(pointer,std::move(storage));
    return pointer;
}
static void R_StaticFree(void *pointer) {
    const auto &storage=allocations.at(pointer);
    guardsIntact &= std::all_of(storage.begin(),storage.begin()+guard,[](byte v){return v==0xcc;}) &&
        std::all_of(storage.end()-guard,storage.end(),[](byte v){return v==0xcc;});
    allocations.erase(pointer);
}
static std::vector<byte> written;
static bool writerFlip=false;
static void R_WriteTGA(const char*,const byte *data,int width,int height,bool flip) {
    written.assign(data,data+size_t(width)*height*4); writerFlip=flip;
}
#ifndef GL_PIXEL_PACK_BUFFER_ARB
#define GL_PIXEL_PACK_BUFFER_ARB GL_PIXEL_PACK_BUFFER
#define GL_PIXEL_PACK_BUFFER_BINDING_ARB GL_PIXEL_PACK_BUFFER_BINDING
#endif
#ifndef Q4_READBACK_DESKTOP
#define glBindBufferARB glBindBuffer
#endif
#include "q4-readback-production.h"

static std::array<byte,4> pattern(int x,int y) {
    if(x%7==0)return {byte(13+x%223),109,211,17};
    return {byte(y%251),byte(43+y%127),39,53};
}
static void clearColor(const std::array<byte,4> &color) {
    glClearColor(color[0]/255.0f,color[1]/255.0f,color[2]/255.0f,color[3]/255.0f);
    glClear(GL_COLOR_BUFFER_BIT);
}
static void paintFrame() {
    glEnable(GL_SCISSOR_TEST);
    for(int y=0;y<glConfig.vidHeight;++y) {
        glScissor(0,y,glConfig.vidWidth,1);
        clearColor(pattern(1,y-tr.viewportOffset[1]));
    }
    for(int x=0;x<glConfig.vidWidth;++x)if((x-tr.viewportOffset[0])%7==0) {
        glScissor(x,0,1,glConfig.vidHeight);
        clearColor(pattern(x-tr.viewportOffset[0],0));
    }
    glDisable(GL_SCISSOR_TEST);
}
static std::array<GLint,5> packState() {
    const GLenum names[]={GL_PACK_ALIGNMENT,GL_PACK_ROW_LENGTH,GL_PACK_SKIP_PIXELS,
        GL_PACK_SKIP_ROWS,GL_PIXEL_PACK_BUFFER_BINDING};
    std::array<GLint,5> state={};
    for(int i=0;i<5;++i)glGetIntegerv(names[i],&state[i]);
    return state;
}
static void setPack(int alignment,bool offsets,GLuint buffer) {
    glPixelStorei(GL_PACK_ALIGNMENT,alignment);
    glPixelStorei(GL_PACK_ROW_LENGTH,offsets?400:0);
    glPixelStorei(GL_PACK_SKIP_PIXELS,offsets?3:0);
    glPixelStorei(GL_PACK_SKIP_ROWS,offsets?2:0);
    glBindBuffer(GL_PIXEL_PACK_BUFFER,buffer);
}
static bool firstCase=true;
static void report(const char *kind,int width,int height,int alignment,bool offsets,bool pbo,
    bool pixelsMatch,bool restored,GLenum error) {
    if(!firstCase)std::printf(",");firstCase=false;
    std::printf("{\"kind\":\"%s\",\"width\":%d,\"height\":%d,\"alignment\":%d,\"offsets\":%s,\"pbo\":%s,\"pixels\":%s,\"stateRestored\":%s,\"guards\":%s,\"glError\":%u,\"passed\":%s}",
      kind,width,height,alignment,offsets?"true":"false",pbo?"true":"false",pixelsMatch?"true":"false",
      restored?"true":"false",guardsIntact?"true":"false",unsigned(error),
      pixelsMatch&&restored&&guardsIntact&&error==GL_NO_ERROR?"true":"false");
}
int main() {
    EGLDisplay display=eglGetDisplay(EGL_DEFAULT_DISPLAY);
    if(display==EGL_NO_DISPLAY||!eglInitialize(display,nullptr,nullptr))return 2;
#ifdef Q4_READBACK_DESKTOP
    if(!eglBindAPI(EGL_OPENGL_API))return 3;
    const EGLint renderable=EGL_OPENGL_BIT;
    const EGLint contextAttributes[]={EGL_NONE};
#else
    if(!eglBindAPI(EGL_OPENGL_ES_API))return 3;
    const EGLint renderable=EGL_OPENGL_ES3_BIT;
    const EGLint contextAttributes[]={EGL_CONTEXT_CLIENT_VERSION,3,EGL_NONE};
#endif
    const EGLint attributes[]={EGL_SURFACE_TYPE,EGL_PBUFFER_BIT,EGL_RENDERABLE_TYPE,renderable,
        EGL_RED_SIZE,8,EGL_GREEN_SIZE,8,EGL_BLUE_SIZE,8,EGL_ALPHA_SIZE,8,EGL_NONE};
    EGLConfig config; EGLint count=0;
    if(!eglChooseConfig(display,attributes,&config,1,&count)||count!=1)return 4;
    const EGLint surfaceAttributes[]={EGL_WIDTH,640,EGL_HEIGHT,480,EGL_NONE};
    EGLSurface surface=eglCreatePbufferSurface(display,config,surfaceAttributes);
    EGLContext context=eglCreateContext(display,config,EGL_NO_CONTEXT,contextAttributes);
    if(surface==EGL_NO_SURFACE||context==EGL_NO_CONTEXT||!eglMakeCurrent(display,surface,surface,context))return 5;
    glDisable(GL_DITHER);
    GLuint packBuffer;glGenBuffers(1,&packBuffer);glBindBuffer(GL_PIXEL_PACK_BUFFER,packBuffer);
    glBufferData(GL_PIXEL_PACK_BUFFER,640*480*4,nullptr,GL_STREAM_READ);glBindBuffer(GL_PIXEL_PACK_BUFFER,0);
    std::printf("{\"driver\":\"%s\",\"version\":\"%s\",\"cases\":[",glGetString(GL_RENDERER),glGetString(GL_VERSION));
    for(int stress=0;stress<3;++stress)for(int alignment:{1,2,4,8}) {
#ifdef Q4_READBACK_DESKTOP
        if(stress||alignment!=4)continue; // Existing desktop/Vulkan contract remains RGB/default pack state.
#endif
        for(int width:{1,7,320}) {
#ifdef Q4_READBACK_DESKTOP
            if(width!=320)continue; // Native odd-width capture is outside this browser patch's scope.
#endif
            const int height=width==320?240:9;
            setPack(alignment,stress==1,stress==2?packBuffer:0);
            const auto before=packState();guardsIntact=true;written.clear();writerFlip=false;
            tr.viewportOffset[0]=tr.viewportOffset[1]=0;glConfig.vidWidth=640;glConfig.vidHeight=480;
            tr.renderCrops[0]={2,3,width,height};tr.takingScreenshot=alignment==2;
            const bool taking=tr.takingScreenshot;
            while(glGetError()!=GL_NO_ERROR){}
            tr.CaptureRenderToFile("fixture.tga",true);
            GLenum error=glGetError();bool pixels=writerFlip&&written.size()==size_t(width)*height*4;
            for(int y=0;y<height&&pixels;++y)for(int x=0;x<width;++x) {
                auto expected=pattern(x+2,y+3);expected[3]=255;
                for(int c=0;c<4;++c)if(written[(y*width+x)*4+c]!=expected[c])pixels=false;
            }
            report("save-crop",width,height,alignment,stress==1,stress==2,pixels,
                packState()==before&&tr.takingScreenshot==taking&&allocations.empty(),error);
        }
        for(bool ref:{false,true}) {
            const int width=37,height=25;
            setPack(alignment,stress==1,stress==2?packBuffer:0);
            const auto before=packState();guardsIntact=true;glConfig.vidWidth=17;glConfig.vidHeight=11;
            std::vector<byte> output(width*height*3+32,0xcc);renderView_t view;
            tr.takingScreenshot=true;r_useScissor.SetBool(true);
            while(glGetError()!=GL_NO_ERROR){}
            R_ReadTiledPixels(width,height,output.data()+16,ref?&view:nullptr);
            GLenum error=glGetError();bool pixels=true;
            for(int y=0;y<height;++y)for(int x=0;x<width;++x) {
                const auto expected=pattern(x,y);
                for(int c=0;c<3;++c)if(output[16+(y*width+x)*3+c]!=expected[c])pixels=false;
            }
            guardsIntact &= std::all_of(output.begin(),output.begin()+16,[](byte v){return v==0xcc;}) &&
                std::all_of(output.end()-16,output.end(),[](byte v){return v==0xcc;});
            report(ref?"tiled-view":"tiled-session",width,height,alignment,stress==1,stress==2,pixels,
                packState()==before&&glConfig.vidWidth==17&&glConfig.vidHeight==11&&
                tr.viewportOffset[0]==0&&tr.viewportOffset[1]==0&&tr.tiledViewport[0]==0&&
                tr.tiledViewport[1]==0&&r_useScissor.GetBool()&&allocations.empty(),error);
        }
    }
    std::printf("]}\n");
    setPack(4,false,0);glDeleteBuffers(1,&packBuffer);
    eglMakeCurrent(display,EGL_NO_SURFACE,EGL_NO_SURFACE,EGL_NO_CONTEXT);
    eglDestroyContext(display,context);eglDestroySurface(display,surface);eglTerminate(display);
}
