// Reuse the offscreen GL shader/reference utilities, not its test entry point.
#define main q4_unused_border_sampling_main
#include "gl-border-sampling.c"
#undef main

int main(int argc, char **argv) {
    if (argc != 2) fail("expected border helper source");
    EGLDisplay display=eglGetDisplay(EGL_DEFAULT_DISPLAY);
    if(display==EGL_NO_DISPLAY||!eglInitialize(display,NULL,NULL)||!eglBindAPI(EGL_OPENGL_API))fail("EGL init");
    const EGLint attrs[]={EGL_SURFACE_TYPE,EGL_PBUFFER_BIT,EGL_RENDERABLE_TYPE,EGL_OPENGL_BIT,
        EGL_RED_SIZE,8,EGL_GREEN_SIZE,8,EGL_BLUE_SIZE,8,EGL_ALPHA_SIZE,8,EGL_NONE};
    EGLConfig config;EGLint count=0;
    if(!eglChooseConfig(display,attrs,&config,1,&count)||count!=1)fail("EGL config");
    const EGLint surface_attrs[]={EGL_WIDTH,SIDE,EGL_HEIGHT,SIDE,EGL_NONE};
    EGLSurface surface=eglCreatePbufferSurface(display,config,surface_attrs);
    EGLContext context=eglCreateContext(display,config,EGL_NO_CONTEXT,NULL);
    if(surface==EGL_NO_SURFACE||context==EGL_NO_CONTEXT||!eglMakeCurrent(display,surface,surface,context))fail("GL context");
    char *helper=read_source(argv[1]);GLuint p=program(helper,0,NULL),vao;free(helper);
    glUseProgram(p);glUniform1i(glGetUniformLocation(p,"image"),0);
    glGenVertexArrays(1,&vao);glBindVertexArray(vao);glViewport(0,0,SIDE,SIDE);glDisable(GL_DITHER);
    const struct {
        const char *name;GLint internal;GLenum format;GLint swizzle[4];
    } formats[]={
        {"rgba8",GL_RGBA8,GL_RGBA,{GL_RED,GL_GREEN,GL_BLUE,GL_ALPHA}},
        {"xrgb8",GL_RGB8,GL_RGB,{GL_RED,GL_GREEN,GL_BLUE,GL_ALPHA}},
        {"rgb565",GL_RGB565,GL_RGB,{GL_RED,GL_GREEN,GL_BLUE,GL_ALPHA}},
        {"compat-luminance8",GL_LUMINANCE8,GL_LUMINANCE,{GL_RED,GL_GREEN,GL_BLUE,GL_ALPHA}},
        {"compat-luminance-alpha8",GL_LUMINANCE8_ALPHA8,GL_LUMINANCE_ALPHA,{GL_RED,GL_GREEN,GL_BLUE,GL_ALPHA}},
        {"compat-intensity8",GL_INTENSITY8,GL_LUMINANCE,{GL_RED,GL_GREEN,GL_BLUE,GL_ALPHA}},
        {"compat-alpha8-swizzle",GL_ALPHA8,GL_ALPHA,{GL_ONE,GL_ONE,GL_ONE,GL_RED}},
        {"core-alpha8-swizzle",GL_R8,GL_RED,{GL_ONE,GL_ONE,GL_ONE,GL_RED}},
        {"core-luminance8-swizzle",GL_R8,GL_RED,{GL_RED,GL_RED,GL_RED,GL_ONE}},
        {"core-luminance-alpha8-swizzle",GL_RG8,GL_RG,{GL_RED,GL_RED,GL_RED,GL_GREEN}},
        {"core-intensity8-swizzle",GL_R8,GL_RED,{GL_RED,GL_RED,GL_RED,GL_RED}},
        {"green-alpha-swizzle",GL_RGBA8,GL_RGBA,{GL_ONE,GL_ONE,GL_ONE,GL_GREEN}},
        {"rgb-normal-swizzle",GL_RGBA8,GL_RGBA,{GL_RED,GL_GREEN,GL_BLUE,GL_RED}},
        {"rgba16f",GL_RGBA16F,GL_RGBA,{GL_RED,GL_GREEN,GL_BLUE,GL_ALPHA}},
        {"srgb8",GL_SRGB8,GL_RGB,{GL_RED,GL_GREEN,GL_BLUE,GL_ALPHA}},
        {"srgb8-alpha8",GL_SRGB8_ALPHA8,GL_RGBA,{GL_RED,GL_GREEN,GL_BLUE,GL_ALPHA}},
        {"depth24",GL_DEPTH_COMPONENT24,GL_DEPTH_COMPONENT,{GL_RED,GL_GREEN,GL_BLUE,GL_ALPHA}},
        {"depth24-stencil8",GL_DEPTH24_STENCIL8,GL_DEPTH_STENCIL,{GL_RED,GL_GREEN,GL_BLUE,GL_ALPHA}},
        {"compat-intensity16",GL_INTENSITY16,GL_LUMINANCE,{GL_RED,GL_GREEN,GL_BLUE,GL_ALPHA}},
        {"compat-luminance-alpha16",GL_LUMINANCE16_ALPHA16,GL_LUMINANCE_ALPHA,{GL_RED,GL_GREEN,GL_BLUE,GL_ALPHA}}
    };
    const GLfloat texel[]={0.25f,0.5f,0.75f,0.4f};
    printf("{\"driver\":\"%s\",\"version\":\"%s\",\"cases\":[",glGetString(GL_RENDERER),glGetString(GL_VERSION));
    for(size_t i=0;i<sizeof(formats)/sizeof(formats[0]);++i){
        GLuint texture;glGenTextures(1,&texture);glBindTexture(GL_TEXTURE_2D,texture);
        const GLuint packed_depth=0x40000000;
        glTexImage2D(GL_TEXTURE_2D,0,formats[i].internal,1,1,0,formats[i].format,
            formats[i].format==GL_DEPTH_STENCIL?GL_UNSIGNED_INT_24_8:GL_FLOAT,
            formats[i].format==GL_DEPTH_STENCIL?(const void *)&packed_depth:(const void *)texel);
        glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MAX_LEVEL,0);
        glTexParameteriv(GL_TEXTURE_2D,GL_TEXTURE_SWIZZLE_RGBA,formats[i].swizzle);
        for(int alpha=0;alpha<2;++alpha){
            GLubyte pixels[BYTES];render(p,0,0,1,1,0,0,alpha,NULL,0,pixels);
            const int outside=5*SIDE*4,center=(5*SIDE+5)*4;
            printf("%s{\"format\":\"%s\",\"requestedAlpha\":%d,\"border\":[%u,%u,%u,%u],\"center\":[%u,%u,%u,%u]}",
                i||alpha?",":"",formats[i].name,alpha,pixels[outside],pixels[outside+1],pixels[outside+2],pixels[outside+3],
                pixels[center],pixels[center+1],pixels[center+2],pixels[center+3]);
        }
        glDeleteTextures(1,&texture);
    }
    printf("]}\n");glDeleteVertexArrays(1,&vao);glDeleteProgram(p);
    eglMakeCurrent(display,EGL_NO_SURFACE,EGL_NO_SURFACE,EGL_NO_CONTEXT);eglDestroyContext(display,context);eglDestroySurface(display,surface);eglTerminate(display);
    return 0;
}
