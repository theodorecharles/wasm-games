// Real production shaders: test both color rejection and subsequent depth occlusion.
#include <EGL/egl.h>
#include <EGL/eglext.h>
#include <GLES3/gl3.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <sstream>
#include <string>

static void require(bool ok, const char *message) {
    if (!ok) { std::fprintf(stderr, "%s\n", message); std::exit(1); }
}
static GLuint compile(GLenum type, const char *file) {
    std::ifstream input(file); require(bool(input), "shader unavailable");
    std::ostringstream data; data << input.rdbuf(); std::string text = data.str(); const char *source = text.c_str();
    GLuint shader = glCreateShader(type); glShaderSource(shader,1,&source,nullptr); glCompileShader(shader);
    GLint ok; glGetShaderiv(shader,GL_COMPILE_STATUS,&ok);
    if (!ok) { char log[8192]; glGetShaderInfoLog(shader,sizeof(log),nullptr,log); std::fprintf(stderr,"%s",log); }
    require(ok,"shader compilation failed"); return shader;
}
static bool passes(bool enabled, int func, float a, float ref) {
    if (!enabled) return true;
    ref = std::clamp(ref,0.f,1.f);
    switch (func) {
        case 0x200: return false; case 0x201: return a < ref; case 0x202: return a == ref;
        case 0x203: return a <= ref; case 0x204: return a > ref; case 0x205: return a != ref;
        case 0x206: return a >= ref; case 0x207: return true;
    }
    std::abort();
}
int main(int argc, char **argv) {
    require(argc >= 3,"vertex/fragment paths required");
    bool depthOnly = argc > 3 && !std::strcmp(argv[3],"depth-only");
    EGLDisplay display = eglGetPlatformDisplay(EGL_PLATFORM_SURFACELESS_MESA,EGL_DEFAULT_DISPLAY,nullptr);
    require(display != EGL_NO_DISPLAY && eglInitialize(display,nullptr,nullptr),"EGL unavailable");
    require(eglBindAPI(EGL_OPENGL_ES_API),"GLES unavailable");
    EGLint attrs[] = {EGL_SURFACE_TYPE,EGL_PBUFFER_BIT,EGL_RENDERABLE_TYPE,EGL_OPENGL_ES3_BIT,
        EGL_RED_SIZE,8,EGL_GREEN_SIZE,8,EGL_BLUE_SIZE,8,EGL_ALPHA_SIZE,8,EGL_DEPTH_SIZE,24,EGL_NONE};
    EGLConfig config; EGLint count; require(eglChooseConfig(display,attrs,&config,1,&count) && count == 1,"EGL config unavailable");
    EGLint ca[] = {EGL_CONTEXT_CLIENT_VERSION,3,EGL_NONE}, sa[] = {EGL_WIDTH,1,EGL_HEIGHT,1,EGL_NONE};
    EGLContext context = eglCreateContext(display,config,EGL_NO_CONTEXT,ca);
    EGLSurface surface = eglCreatePbufferSurface(display,config,sa);
    require(eglMakeCurrent(display,surface,surface,context),"GLES context unavailable");
    GLuint program = glCreateProgram(), vs = compile(GL_VERTEX_SHADER,argv[1]), fs = compile(GL_FRAGMENT_SHADER,argv[2]);
    glAttachShader(program,vs); glAttachShader(program,fs); glLinkProgram(program);
    GLint ok; glGetProgramiv(program,GL_LINK_STATUS,&ok); require(ok,"shader linking failed"); glUseProgram(program);
    auto loc = [&](const char *name) { return glGetUniformLocation(program,name); };
    float identity[] = {1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1};
    for (auto name : {"u_projection","u_modelView","u_rotMatrix","u_textureMatrix0","u_textureMatrix3","u_textureMatrix4"})
        glUniformMatrix4fv(loc(name),1,GL_FALSE,identity);
    GLuint tex[5]; glGenTextures(5,tex); unsigned char white[] = {255,255,255,255};
    for (int i=0;i<5;++i) {
        glActiveTexture(GL_TEXTURE0+i); glBindTexture(GL_TEXTURE_2D,tex[i]);
        glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA8,1,1,0,GL_RGBA,GL_UNSIGNED_BYTE,white);
        glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MIN_FILTER,GL_NEAREST); glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MAG_FILTER,GL_NEAREST);
    }
    glUniform1i(loc("s_texture"),0); glUniform1i(loc("s_palswap"),1); glUniform1i(loc("s_palette"),2);
    glUniform1i(loc("s_detail"),3); glUniform1i(loc("s_glow"),4);
    glUniform1f(loc("u_useColorOnly"),1); glUniform1f(loc("u_brightness"),1);
    glUniform4f(loc("u_npotEmulation"),1,1,0,1); glUniform2f(loc("u_clamp"),1,1);
    glUniform4f(loc("u_texturePosSize"),0,0,1,1); glUniform2f(loc("u_halfTexelSize"),.5,.5);
    glUniform4f(loc("u_colorCorrection"),1,1,1,0); glUniform2f(loc("u_numShades"),32,1.f/32);
    glUniform2f(loc("u_palswapSize"),1,1);
    GLuint vao, buffer; glGenVertexArrays(1,&vao); glBindVertexArray(vao); glGenBuffers(1,&buffer); glBindBuffer(GL_ARRAY_BUFFER,buffer);
    GLint position = glGetAttribLocation(program,"a_position"), color = glGetAttribLocation(program,"a_color");
    glEnableVertexAttribArray(position); glVertexAttribPointer(position,3,GL_FLOAT,GL_FALSE,0,nullptr);
    glViewport(0,0,1,1); glDisable(GL_DITHER); glEnable(GL_DEPTH_TEST); glDepthFunc(GL_LESS); glDepthMask(GL_TRUE);
    auto draw = [&](float z, float r, float g, float b, float a) {
        float vertices[] = {-1,-1,z,1,-1,z,1,1,z,-1,1,z};
        glVertexAttrib4f(color,r,g,b,a); glBufferData(GL_ARRAY_BUFFER,sizeof(vertices),vertices,GL_STREAM_DRAW); glDrawArrays(GL_TRIANGLE_FAN,0,4);
    };
    auto check = [&](std::array<int,4> expected, const char *stage, int func, float alpha, float ref, bool enabled, bool blend) {
        unsigned char actual[4]; glReadPixels(0,0,1,1,GL_RGBA,GL_UNSIGNED_BYTE,actual);
        require(glGetError() == GL_NO_ERROR,"alpha draw generated GL error");
        for (int i=0;i<4;++i) if (std::abs(actual[i]-expected[i]) > 1) {
            std::fprintf(stderr,"alpha %s mismatch: func=%x alpha=%g ref=%g enabled=%d blend=%d channel=%d got=%d expected=%d\n",
                stage,func,alpha,ref,enabled,blend,i,actual[i],expected[i]); std::exit(1);
        }
    };
    unsigned cases = 0;
    // Color-only alpha; RGBA texture alpha multiplied by vertex alpha; and
    // actual R8 indexed artwork with ordinary versus transparent index 255.
    for (int mode=0;mode<4;++mode) {
    unsigned char rgba[] = {255,255,255,128}, index = mode == 3 ? 255 : 0;
    glActiveTexture(GL_TEXTURE0); glBindTexture(GL_TEXTURE_2D,tex[0]);
    glTexImage2D(GL_TEXTURE_2D,0,mode >= 2 ? GL_R8 : GL_RGBA8,1,1,0,
        mode >= 2 ? GL_RED : GL_RGBA,GL_UNSIGNED_BYTE,mode >= 2 ? &index : rgba);
    unsigned char redPalette[] = {255,0,0,0};
    glActiveTexture(GL_TEXTURE2); glBindTexture(GL_TEXTURE_2D,tex[2]);
    glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA8,1,1,0,GL_RGBA,GL_UNSIGNED_BYTE,redPalette);
    for (bool enabled : {false,true}) for (int func=0x200;func<=0x207;++func)
    for (float ref : {-1.f,0.f,.25f,.5f,1.f,2.f}) for (float alpha : {0.f,.25f,.5f,.75f,1.f})
    for (bool blend : {false,true}) {
        glClearColor(0,1,0,1); glClearDepthf(1); glClear(GL_COLOR_BUFFER_BIT|GL_DEPTH_BUFFER_BIT);
        glUniform1i(loc("u_buildAlphaFunc"),enabled ? func : 0);
        glUniform1f(loc("u_buildAlphaRef"),std::clamp(ref,0.f,1.f));
        glUniform1f(loc("u_useColorOnly"),mode == 0 ? 1 : 0);
        glUniform1f(loc("u_usePalette"),mode >= 2 ? 1 : 0);
        if (blend) glEnable(GL_BLEND); else glDisable(GL_BLEND);
        glBlendFuncSeparate(GL_SRC_ALPHA,GL_ONE_MINUS_SRC_ALPHA,GL_ONE,GL_ZERO);
        draw(-.5f,1,0,0,alpha);
        float outputAlpha = alpha * (mode == 1 ? 128.f/255 : mode == 3 ? 0 : 1);
        bool pass = passes(enabled,func,outputAlpha,ref);
        std::array<int,4> expected = pass ? std::array<int,4>{blend ? int(std::lround(outputAlpha*255)) : 255,
            blend ? int(std::lround((1-outputAlpha)*255)) : 0,0,int(std::lround(outputAlpha*255))} : std::array<int,4>{0,255,0,255};
        if (!depthOnly) check(expected,"color",func,outputAlpha,ref,enabled,blend);
        // A farther opaque surface must show through a rejected fragment, but
        // remain occluded by an accepted fragment even when that alpha is zero.
        glDisable(GL_BLEND); glUniform1i(loc("u_buildAlphaFunc"),0);
        glUniform1f(loc("u_useColorOnly"),1); glUniform1f(loc("u_usePalette"),0);
        draw(.5f,0,0,1,1);
        if (!pass) expected = {0,0,255,255};
        check(expected,"depth",func,outputAlpha,ref,enabled,blend); ++cases;
    }
    }
    std::printf("{\"alphaCases\":%u,\"colorChecks\":%u,\"depthChecks\":%u,\"renderer\":\"%s\"}\n",cases,cases,cases,glGetString(GL_RENDERER));
    glDeleteBuffers(1,&buffer); glDeleteVertexArrays(1,&vao); glDeleteTextures(5,tex);
    glDeleteProgram(program); glDeleteShader(vs); glDeleteShader(fs);
    eglMakeCurrent(display,EGL_NO_SURFACE,EGL_NO_SURFACE,EGL_NO_CONTEXT);
    eglDestroySurface(display,surface); eglDestroyContext(display,context); eglTerminate(display);
}
