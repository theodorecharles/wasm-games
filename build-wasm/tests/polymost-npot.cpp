// Production capability/coordinate code and translated Polymost shaders.
// Generated indexed artwork only: no proprietary game data.
#include <EGL/egl.h>
#include <EGL/eglext.h>
#include <GLES3/gl3.h>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#if FIXTURE_BROWSER
#define __EMSCRIPTEN__ 1
#endif
#define Bstrstr std::strstr
#define LOG_F(...) ((void)0)
struct vec2_t { int x, y; };
static struct { const char *extensions; unsigned texnpot; } glinfo;
static struct { int major, minor; } GLVersion;
static bool detect(int major, const char *extensions) {
    GLVersion = {major, 0}; glinfo.extensions = extensions;
    #include "capability.inc"
    return glinfo.texnpot;
}
static vec2_t coordinateSize(vec2_t tsiz) {
    #include "coordinates.inc"
    return tsiz2;
}
static void require(bool ok, const char *message) {
    if (!ok) { std::fprintf(stderr, "%s\n", message); std::exit(1); }
}
static GLuint compile(GLenum type, const char *file) {
    std::ifstream input(file); require(bool(input), "shader file unavailable");
    std::ostringstream data; data << input.rdbuf();
    std::string text = data.str(); const char *source = text.c_str();
    GLuint shader = glCreateShader(type); glShaderSource(shader, 1, &source, nullptr); glCompileShader(shader);
    GLint ok; glGetShaderiv(shader, GL_COMPILE_STATUS, &ok);
    if (!ok) { char log[8192]; glGetShaderInfoLog(shader, sizeof(log), nullptr, log); std::fprintf(stderr, "%s", log); }
    require(ok, "shader compilation failed"); return shader;
}
static GLuint texture(int unit, int w, int h, bool red, const void *pixels) {
    glActiveTexture(GL_TEXTURE0 + unit); GLuint id; glGenTextures(1, &id); glBindTexture(GL_TEXTURE_2D, id);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glTexImage2D(GL_TEXTURE_2D, 0, red ? GL_R8 : GL_RGBA8, w, h, 0, red ? GL_RED : GL_RGBA, GL_UNSIGNED_BYTE, pixels);
    return id;
}
int main(int argc, char **argv) {
    require(argc >= 3, "shader paths required");
    bool renderOnly = argc > 3 && !std::strcmp(argv[3], "render-only");
    unsigned capabilityChecks = 0, renderCases = 0, pixelChecks = 0;
    if (!renderOnly) {
        for (int major : {2, 3, 4}) for (const char *extensions : {"", "GL_ARB_texture_non_power_of_two", "GL_OES_texture_npot"}) {
            bool expected = *extensions || (FIXTURE_BROWSER && major >= 3);
            require(detect(major, extensions) == expected, "NPOT capability mismatch"); ++capabilityChecks;
        }
    }
    if (argc > 3 && !std::strcmp(argv[3], "caps-only")) {
        std::printf("{\"capabilityChecks\":%u,\"desktopPreserved\":true}\n", capabilityChecks); return 0;
    }
    detect(3, "");
    EGLDisplay display = eglGetPlatformDisplay(EGL_PLATFORM_SURFACELESS_MESA, EGL_DEFAULT_DISPLAY, nullptr);
    require(display != EGL_NO_DISPLAY && eglInitialize(display, nullptr, nullptr), "EGL initialization failed");
    require(eglBindAPI(EGL_OPENGL_ES_API), "GLES unavailable");
    EGLint attrs[] = {EGL_SURFACE_TYPE, EGL_PBUFFER_BIT, EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT,
        EGL_RED_SIZE,8,EGL_GREEN_SIZE,8,EGL_BLUE_SIZE,8,EGL_NONE};
    EGLConfig config; EGLint count; require(eglChooseConfig(display,attrs,&config,1,&count) && count == 1, "EGL config unavailable");
    EGLint ca[] = {EGL_CONTEXT_CLIENT_VERSION,3,EGL_NONE}, sa[] = {EGL_WIDTH,4,EGL_HEIGHT,4,EGL_NONE};
    EGLContext context = eglCreateContext(display,config,EGL_NO_CONTEXT,ca);
    EGLSurface surface = eglCreatePbufferSurface(display,config,sa);
    require(eglMakeCurrent(display,surface,surface,context), "GLES context unavailable");
    GLuint program = glCreateProgram(), vs = compile(GL_VERTEX_SHADER,argv[1]), fs = compile(GL_FRAGMENT_SHADER,argv[2]);
    glAttachShader(program,vs); glAttachShader(program,fs); glLinkProgram(program);
    GLint ok; glGetProgramiv(program,GL_LINK_STATUS,&ok); require(ok, "shader linking failed"); glUseProgram(program);
    auto loc = [&](const char *name) { return glGetUniformLocation(program,name); };
    float const identity[] = {1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1};
    for (auto name : {"u_projection", "u_modelView", "u_rotMatrix", "u_textureMatrix0"}) glUniformMatrix4fv(loc(name),1,GL_FALSE,identity);
    glUniform1i(loc("s_texture"),0); glUniform1i(loc("s_palswap"),1); glUniform1i(loc("s_palette"),2);
    glUniform1f(loc("u_usePalette"),1); glUniform1f(loc("u_brightness"),1);
    glUniform4f(loc("u_npotEmulation"),1,1,0,1); glUniform2f(loc("u_clamp"),1,1);
    glUniform4f(loc("u_colorCorrection"),1,1,1,0);
    glUniform2f(loc("u_numShades"),32,1.f/32); glUniform2f(loc("u_palswapSize"),1,1);
    glUniform2f(loc("u_palswapPos"),0,0);
    glPixelStorei(GL_UNPACK_ALIGNMENT,1); glPixelStorei(GL_PACK_ALIGNMENT,1);
    glDisable(GL_DITHER); glDisable(GL_DEPTH_TEST); glDisable(GL_BLEND);
    std::vector<uint8_t> palette(256*4), swaps(256*32);
    for (int i=0;i<256;++i) {
        palette[i*4] = i; palette[i*4+1] = 255-i; palette[i*4+2] = (i*37)&255; palette[i*4+3] = 255;
    }
    for (int i=0;i<256*32;++i) swaps[i] = i&255;
    GLuint swapTexture = texture(1,256,32,true,swaps.data()), paletteTexture = texture(2,256,1,false,palette.data());
    GLuint vao, buffer, framebuffer; glGenVertexArrays(1,&vao); glBindVertexArray(vao);
    glGenBuffers(1,&buffer); glBindBuffer(GL_ARRAY_BUFFER,buffer);
    GLint position = glGetAttribLocation(program,"a_position"), uv = glGetAttribLocation(program,"a_texCoord0");
    glEnableVertexAttribArray(position); glVertexAttribPointer(position,3,GL_FLOAT,GL_FALSE,5*sizeof(float),nullptr);
    glEnableVertexAttribArray(uv); glVertexAttribPointer(uv,2,GL_FLOAT,GL_FALSE,5*sizeof(float),(void*)(3*sizeof(float)));
    glVertexAttrib4f(glGetAttribLocation(program,"a_color"),1,1,1,1);
    glGenFramebuffers(1,&framebuffer); glBindFramebuffer(GL_FRAMEBUFFER,framebuffer);
    for (auto size : {vec2_t{1,1},{2,2},{5,7},{7,5},{19,31},{20,27},{63,84},{84,63},{128,64}}) {
        vec2_t padded = coordinateSize(size);
        float u = float(size.x)/padded.x, v = float(size.y)/padded.y;
        float vertices[] = {-1,-1,0,0,0, 1,-1,0,u,0, 1,1,0,u,v, -1,1,0,0,v};
        glBufferData(GL_ARRAY_BUFFER,sizeof(vertices),vertices,GL_STATIC_DRAW);
        std::vector<uint8_t> pixels(size.x*size.y), expected(size.x*size.y*4);
        for (int y=0;y<size.y;++y) for (int x=0;x<size.x;++x) {
            uint8_t index = 1+(x*11+y*23)%253;
            pixels[x*size.y+y] = index; // Build's column-major indexed layout.
            std::memcpy(&expected[(y*size.x+x)*4], &palette[index*4], 4);
        }
        for (bool atlas : {false,true}) {
            int tw = atlas ? 256 : size.y, th = atlas ? 256 : size.x, ox = atlas ? 9 : 0, oy = atlas ? 13 : 0;
            GLuint art = texture(0,tw,th,true,nullptr);
            glTexSubImage2D(GL_TEXTURE_2D,0,ox,oy,size.y,size.x,GL_RED,GL_UNSIGNED_BYTE,pixels.data());
            GLuint output = texture(5,size.x,size.y,false,nullptr);
            glFramebufferTexture2D(GL_FRAMEBUFFER,GL_COLOR_ATTACHMENT0,GL_TEXTURE_2D,output,0);
            require(glCheckFramebufferStatus(GL_FRAMEBUFFER) == GL_FRAMEBUFFER_COMPLETE, "readback framebuffer incomplete");
            glUniform4f(loc("u_texturePosSize"),float(ox)/tw,float(oy)/th,float(size.y)/tw,float(size.x)/th);
            glUniform2f(loc("u_halfTexelSize"),0.5f/tw,0.5f/th);
            glViewport(0,0,size.x,size.y); glClearColor(0,0,0,0); glClear(GL_COLOR_BUFFER_BIT);
            glDrawArrays(GL_TRIANGLE_FAN,0,4);
            std::vector<uint8_t> actual(expected.size());
            glReadPixels(0,0,size.x,size.y,GL_RGBA,GL_UNSIGNED_BYTE,actual.data());
            require(glGetError() == GL_NO_ERROR, "NPOT draw generated a GL error");
            for (size_t i=0;i<actual.size();++i) if (std::abs(int(actual[i])-expected[i]) > 1) {
                std::fprintf(stderr,"NPOT pixel mismatch: %dx%d atlas=%d byte=%zu got=%d expected=%d\n",size.x,size.y,atlas,i,actual[i],expected[i]); return 1;
            }
            pixelChecks += size.x*size.y; ++renderCases;
            glDeleteTextures(1,&art); glDeleteTextures(1,&output);
        }
    }
    std::printf("{\"capabilityChecks\":%u,\"renderCases\":%u,\"pixelChecks\":%u,\"renderer\":\"%s\"}\n",capabilityChecks,renderCases,pixelChecks,glGetString(GL_RENDERER));
    glDeleteFramebuffers(1,&framebuffer); glDeleteBuffers(1,&buffer); glDeleteVertexArrays(1,&vao);
    glDeleteTextures(1,&swapTexture); glDeleteTextures(1,&paletteTexture);
    glDeleteProgram(program); glDeleteShader(vs); glDeleteShader(fs);
    eglMakeCurrent(display,EGL_NO_SURFACE,EGL_NO_SURFACE,EGL_NO_CONTEXT);
    eglDestroySurface(display,surface); eglDestroyContext(display,context); eglTerminate(display);
}
