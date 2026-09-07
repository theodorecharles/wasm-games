// Isolate per-fragment textureSize LOD behavior without the border sampler.
// Reuse only the EGL/GL compilation and texture-allocation fixture utilities.
#define main border_sampling_fixture_main
#include "gl-border-sampling.c"
#undef main

int main(void) {
    EGLDisplay display = eglGetDisplay(EGL_DEFAULT_DISPLAY);
    if (display == EGL_NO_DISPLAY || !eglInitialize(display, NULL, NULL)) fail("EGL init");
    const int dimensions[][2] = {{8,8}, {16,4}, {7,5}, {1,8}};
    const char *fragment =
        "uniform sampler2D image;\n"
        "uniform int lastLevel;\n"
        "uniform int derived;\n"
        "out vec4 color;\n"
        "void main() {\n"
        " int level = (int(gl_FragCoord.x) + int(gl_FragCoord.y)) % (lastLevel + 1);\n"
        " ivec2 dims = textureSize(image, level);\n"
        " if (derived != 0) dims = max(textureSize(image, 0) >> level, ivec2(1));\n"
        " color = vec4(vec2(dims),float(level),255.0) / 255.0;\n"
        "}\n";
    printf("{\"scope\":\"Native per-fragment mip-size query versus base-size integer derivation; no game or border helper\",\"contexts\":[");
    for (int es = 0; es < 2; ++es) {
        if (!eglBindAPI(es ? EGL_OPENGL_ES_API : EGL_OPENGL_API)) fail("API bind");
        const EGLint attrs[] = {EGL_SURFACE_TYPE,EGL_PBUFFER_BIT,EGL_RENDERABLE_TYPE,
            es ? EGL_OPENGL_ES3_BIT : EGL_OPENGL_BIT,EGL_RED_SIZE,8,EGL_GREEN_SIZE,8,
            EGL_BLUE_SIZE,8,EGL_ALPHA_SIZE,8,EGL_NONE};
        EGLConfig config; EGLint count;
        if (!eglChooseConfig(display, attrs, &config, 1, &count) || count != 1) fail("config");
        const EGLint surface_attrs[] = {EGL_WIDTH,SIDE,EGL_HEIGHT,SIDE,EGL_NONE};
        const EGLint context_attrs[] = {EGL_CONTEXT_CLIENT_VERSION,3,EGL_NONE};
        EGLSurface surface = eglCreatePbufferSurface(display, config, surface_attrs);
        EGLContext context = eglCreateContext(display, config, EGL_NO_CONTEXT, es ? context_attrs : NULL);
        if (surface == EGL_NO_SURFACE || context == EGL_NO_CONTEXT || !eglMakeCurrent(display,surface,surface,context)) fail("context");
        char joined[2048];
        snprintf(joined,sizeof(joined),"%s%s",es ? "#version 300 es\nprecision highp float;\nprecision highp int;\n" : "#version 330 core\n",fragment);
        GLuint p = program("", es, joined), vao;
        glUseProgram(p); glUniform1i(glGetUniformLocation(p,"image"),0);
        glGenVertexArrays(1,&vao); glBindVertexArray(vao);
        glViewport(0,0,SIDE,SIDE); glDisable(GL_DITHER); glDisable(GL_BLEND);
        printf("%s{\"driver\":\"%s\",\"version\":\"%s\",\"cases\":[",es ? "," : "",glGetString(GL_RENDERER),glGetString(GL_VERSION));
        int rows = 0;
        for (int shape = 0; shape < 4; ++shape) {
            int width = dimensions[shape][0],height = dimensions[shape][1],last_level;
            GLuint t = texture(width,height,&last_level);
            glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MIN_FILTER,GL_NEAREST_MIPMAP_NEAREST);
            glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MAG_FILTER,GL_NEAREST);
            glUniform1i(glGetUniformLocation(p,"lastLevel"),last_level);
            for (int derived = 0; derived < 2; ++derived) {
                glUniform1i(glGetUniformLocation(p,"derived"),derived);
                glDrawArrays(GL_TRIANGLES,0,3);
                GLubyte pixels[BYTES];
                glReadPixels(0,0,SIDE,SIDE,GL_RGBA,GL_UNSIGNED_BYTE,pixels);
                if (glGetError() != GL_NO_ERROR) fail("size readback");
                printf("%s{\"size\":[%d,%d],\"method\":\"%s\",\"samples\":[",rows++ ? "," : "",width,height,derived ? "base-size-shift" : "varying-size-query");
                for (int y = 0; y < SIDE; ++y) for (int x = 0; x < SIDE; ++x) {
                    const int i = (y * SIDE + x) * 4, level = (x + y) % (last_level + 1);
                    printf("%s{\"pixel\":[%d,%d],\"lod\":%d,\"expected\":[%d,%d],\"actual\":[%u,%u],\"observedLod\":%u}",
                        x || y ? "," : "",x,y,level,mip_size(width,level),mip_size(height,level),pixels[i],pixels[i+1],pixels[i+2]);
                }
                printf("]}");
            }
            glDeleteTextures(1,&t);
        }
        printf("]}");
        glDeleteVertexArrays(1,&vao); glDeleteProgram(p);
        eglMakeCurrent(display,EGL_NO_SURFACE,EGL_NO_SURFACE,EGL_NO_CONTEXT);
        eglDestroyContext(display,context); eglDestroySurface(display,surface);
    }
    printf("]}\n"); eglTerminate(display); return 0;
}
