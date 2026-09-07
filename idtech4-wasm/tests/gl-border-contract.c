// Record the unchanged production sampler's pixels for an independent CPU
// oracle. Reuse texture allocation/context utilities, not the CPU equations.
#define main border_sampling_fixture_main
#include "gl-border-sampling.c"
#undef main
int main(int argc,char **argv) {
    if(argc!=3)fail("expected production helper and converted fragment");
    char *helper=read_source(argv[1]),*converted=read_source(argv[2]);
    EGLDisplay display=eglGetDisplay(EGL_DEFAULT_DISPLAY);
    if(display==EGL_NO_DISPLAY||!eglInitialize(display,NULL,NULL))fail("EGL init");
    const int dimensions[][2]={{8,8},{16,4},{7,5},{1,8}};
    printf("{\"contexts\":[");
    for(int es=0;es<2;++es) {
        if(!eglBindAPI(es?EGL_OPENGL_ES_API:EGL_OPENGL_API))fail("API bind");
        const EGLint attrs[]={EGL_SURFACE_TYPE,EGL_PBUFFER_BIT,EGL_RENDERABLE_TYPE,es?EGL_OPENGL_ES3_BIT:EGL_OPENGL_BIT,
            EGL_RED_SIZE,8,EGL_GREEN_SIZE,8,EGL_BLUE_SIZE,8,EGL_ALPHA_SIZE,8,EGL_NONE};
        EGLConfig config;EGLint count;
        if(!eglChooseConfig(display,attrs,&config,1,&count)||count!=1)fail("EGL config");
        // An even-sized window target aligns bottom-up and top-down 2x2
        // derivative grids. Read the same 11x11 UV samples, with a helper lane.
        const EGLint surface_attrs[]={EGL_WIDTH,SIDE+1,EGL_HEIGHT,SIDE+1,EGL_NONE};
        const EGLint context_attrs[]={EGL_CONTEXT_CLIENT_VERSION,3,EGL_NONE};
        EGLSurface surface=eglCreatePbufferSurface(display,config,surface_attrs);
        EGLContext context=eglCreateContext(display,config,EGL_NO_CONTEXT,es?context_attrs:NULL);
        if(surface==EGL_NO_SURFACE||context==EGL_NO_CONTEXT||!eglMakeCurrent(display,surface,surface,context))fail("GL context");
        GLuint p=program(helper,es,es?converted:NULL),vao;
        glUseProgram(p);glUniform1i(glGetUniformLocation(p,"image"),0);
        glGenVertexArrays(1,&vao);glBindVertexArray(vao);glViewport(0,0,SIDE+1,SIDE+1);
        glDisable(GL_BLEND);glDisable(GL_DITHER);glDisable(GL_DEPTH_TEST);glDisable(GL_CULL_FACE);
        printf("%s{\"driver\":\"%s\",\"version\":\"%s\",\"cases\":[",es?",":"",glGetString(GL_RENDERER),glGetString(GL_VERSION));
        int rows=0;
        for(int shape=0;shape<4;++shape) {
            int width=dimensions[shape][0],height=dimensions[shape][1],last;
            GLuint t=texture(width,height,&last);
            for(int alpha=0;alpha<2;++alpha)for(int mode=2;mode<=3;++mode) {
                GLubyte pixels[BYTES];render(p,5,2,width,height,last,0,alpha,NULL,mode,pixels);
                printf("%s{\"size\":[%d,%d],\"borderAlpha\":%d,\"gradientMode\":%d,\"pixels\":[",rows++?",":"",width,height,alpha,mode);
                for(int i=0;i<BYTES;++i)printf("%s%u",i?",":"",pixels[i]);
                printf("]}");
            }
            glDeleteTextures(1,&t);
        }
        printf("]}");glDeleteVertexArrays(1,&vao);glDeleteProgram(p);
        eglMakeCurrent(display,EGL_NO_SURFACE,EGL_NO_SURFACE,EGL_NO_CONTEXT);
        eglDestroyContext(display,context);eglDestroySurface(display,surface);
    }
    printf("]}\n");free(helper);free(converted);eglTerminate(display);return 0;
}
