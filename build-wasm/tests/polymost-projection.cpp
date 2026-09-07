// Exercise the extracted production matrix through GLES rasterization.
#include <EGL/egl.h>
#include <EGL/eglext.h>
#include <GLES3/gl3.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <initializer_list>
#define Bmemset std::memset
#define __EMSCRIPTEN__ 1
static void require(bool ok) { if (!ok) std::exit(2); }
static GLuint shader(GLenum type, const char *source) {
    GLuint id = glCreateShader(type); glShaderSource(id,1,&source,nullptr); glCompileShader(id);
    GLint ok; glGetShaderiv(id,GL_COMPILE_STATUS,&ok); require(ok); return id;
}
int main() {
    EGLDisplay display = eglGetPlatformDisplay(EGL_PLATFORM_SURFACELESS_MESA, EGL_DEFAULT_DISPLAY, nullptr);
    require(display != EGL_NO_DISPLAY && eglInitialize(display,nullptr,nullptr));
    require(eglBindAPI(EGL_OPENGL_ES_API));
    EGLint attributes[] = {EGL_SURFACE_TYPE,EGL_PBUFFER_BIT,EGL_RENDERABLE_TYPE,EGL_OPENGL_ES3_BIT,
        EGL_RED_SIZE,8,EGL_GREEN_SIZE,8,EGL_BLUE_SIZE,8,EGL_NONE};
    EGLConfig config; EGLint count; require(eglChooseConfig(display,attributes,&config,1,&count) && count == 1);
    EGLint ca[] = {EGL_CONTEXT_CLIENT_VERSION,3,EGL_NONE};
    EGLContext context = eglCreateContext(display,config,EGL_NO_CONTEXT,ca);
    EGLint sa[] = {EGL_WIDTH,4,EGL_HEIGHT,4,EGL_NONE};
    EGLSurface surface = eglCreatePbufferSurface(display,config,sa);
    require(eglMakeCurrent(display,surface,surface,context));
    const char *vertex = "#version 300 es\nprecision highp float;uniform mat4 projection;uniform float depth;"
        "const vec2 p[3]=vec2[3](vec2(-1,-1),vec2(3,-1),vec2(-1,3));"
        "void main(){gl_Position=projection*vec4(p[gl_VertexID]*abs(depth),depth,1);}";
    const char *fragment = "#version 300 es\nprecision highp float;out vec4 color;void main(){color=vec4(1,0,0,1);}";
    GLuint program = glCreateProgram(), vs = shader(GL_VERTEX_SHADER,vertex), fs = shader(GL_FRAGMENT_SHADER,fragment);
    glAttachShader(program,vs); glAttachShader(program,fs); glLinkProgram(program);
    GLint ok; glGetProgramiv(program,GL_LINK_STATUS,&ok); require(ok); glUseProgram(program);
    GLuint vao; glGenVertexArrays(1,&vao); glBindVertexArray(vao);
    glViewport(0,0,4,4); glDisable(GL_DITHER); glClearColor(0,0,0,1);
    unsigned checks = 0;
    for (float width : {640.f,800.f,1920.f}) {
        float const gxyaspect = 1.f, gyxscale = 1.5625f, fxdimen = width, fydimen = width*.75f;
        float const ratio = 1.f, ghoriz2 = 0.f, gstang = 0.f, gctang = 1.f, ghorizcorrect = 0.f;
        #include "projection.inc"
        glUniformMatrix4fv(glGetUniformLocation(program,"projection"),1,GL_FALSE,&m[0][0]);
        for (float depth : {-1.f,0.0025f,0.01f,1.f,7.9f,8.1f,1.f/(width*.0000001f*1024.f),32.f,1024.f}) {
            glClear(GL_COLOR_BUFFER_BIT); glUniform1f(glGetUniformLocation(program,"depth"),depth);
            glDrawArrays(GL_TRIANGLES,0,3);
            unsigned char pixel[4]; glReadPixels(2,2,1,1,GL_RGBA,GL_UNSIGNED_BYTE,pixel);
            require(glGetError() == GL_NO_ERROR);
            bool visible = pixel[0] == 255 && pixel[1] == 0 && pixel[2] == 0;
            if (visible != (depth >= nearclip)) {
                std::printf("projection mismatch at depth %g (width %g): visible=%d\n",depth,width,visible); return 1;
            }
            ++checks;
        }
    }
    std::printf("{\"checks\":%u,\"renderer\":\"%s\"}\n",checks,glGetString(GL_RENDERER));
    glDeleteVertexArrays(1,&vao); glDeleteProgram(program); glDeleteShader(vs); glDeleteShader(fs);
    eglMakeCurrent(display,EGL_NO_SURFACE,EGL_NO_SURFACE,EGL_NO_CONTEXT);
    eglDestroySurface(display,surface); eglDestroyContext(display,context); eglTerminate(display);
}
