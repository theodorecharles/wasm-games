#include <EGL/egl.h>
#include <GLES3/gl3.h>
#include <stdio.h>
#include <stdlib.h>

#define main q4_unused_shader_link_main
#include "glsl-es-link.c"
#undef main

enum { SIDE = 16, BYTES = SIDE * SIDE * 4 };

static GLuint load_program(const char *vertex_path, const char *fragment_path) {
    char *vertex = read_file(vertex_path), *fragment = read_file(fragment_path);
    if (!vertex || !fragment) exit(7);
    GLuint vs = compile_shader(GL_VERTEX_SHADER, vertex, vertex_path);
    GLuint fs = compile_shader(GL_FRAGMENT_SHADER, fragment, fragment_path);
    free(vertex); free(fragment);
    if (!vs || !fs) exit(8);
    GLuint program = glCreateProgram();
    glAttachShader(program, vs); glAttachShader(program, fs); glLinkProgram(program);
    GLint linked = GL_FALSE; glGetProgramiv(program, GL_LINK_STATUS, &linked);
    if (!linked) {
        char log[8192] = {0}; glGetProgramInfoLog(program, sizeof(log), NULL, log);
        fprintf(stderr, "%s\n", log); exit(9);
    }
    glDeleteShader(vs); glDeleteShader(fs);
    return program;
}

static void uniform1(GLuint program, const char *name, GLfloat value) {
    glUniform1f(glGetUniformLocation(program, name), value);
}
static void uniform4(GLuint program, const char *name, GLfloat x, GLfloat y, GLfloat z, GLfloat w) {
    glUniform4f(glGetUniformLocation(program, name), x,y,z,w);
}

static void render(GLuint program, int mode, int direction, GLubyte *pixels) {
    static const GLfloat identity[16] = {1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1};
    static const GLfloat lights[4][3] = {{0,0,2},{5,1,2},{0,0,-2},{-3,2,0.1f}};
    const char *samplers[] = {"uBumpMap","uLightFalloffMap","uLightProjectionMap","uDiffuseMap","uSpecularMap","uAmbientNormalMap"};
    glUseProgram(program);
    for (int i = 0; i < 6; i++) glUniform1i(glGetUniformLocation(program, samplers[i]), i);
    glUniformMatrix4fv(glGetUniformLocation(program,"uModelViewMatrix"),1,GL_FALSE,identity);
    glUniformMatrix4fv(glGetUniformLocation(program,"uProjectionMatrix"),1,GL_FALSE,identity);
    uniform4(program,"uLocalLightOrigin",lights[direction][0],lights[direction][1],lights[direction][2],1);
    uniform4(program,"uLocalViewOrigin",0,0,3,1);
    uniform4(program,"uLightProjectionS",0,0,0,0.5f);
    uniform4(program,"uLightProjectionT",0,0,0,0.5f);
    uniform4(program,"uLightProjectionQ",0,0,0,1);
    uniform4(program,"uLightFalloffS",0,0,0,0.5f);
    const char *matrix_s[] = {"uBumpMatrixS","uDiffuseMatrixS","uSpecularMatrixS"};
    const char *matrix_t[] = {"uBumpMatrixT","uDiffuseMatrixT","uSpecularMatrixT"};
    for (int i=0;i<3;i++) { uniform4(program,matrix_s[i],1,0,0,0); uniform4(program,matrix_t[i],0,1,0,0); }
    glUniform2f(glGetUniformLocation(program,"uVertexColorParams"),1,0);
    uniform4(program,"uDiffuseColor",0.8f,0.6f,0.9f,1);
    uniform4(program,"uSpecularColor",0.7f,0.5f,0.8f,1);
    uniform1(program,"uStockInteraction",mode < 2 ? 1 : 0);
    uniform1(program,"uAmbientLight",mode == 1 || mode == 3 ? 1 : 0);
    uniform1(program,"uMaterialNormalScale",mode == 4 ? 1.7f : 1);
    uniform1(program,"uMaterialSpecularBoost",mode == 4 ? 2.2f : 1);
    uniform1(program,"uMaterialFresnel",mode == 4 ? 0.75f : 0);
    uniform4(program,"uCelParams",mode == 5 || mode == 6 ? 1 : 0,4,1,mode == 6 ? 0.6f : 0);
    uniform4(program,"uFlatDiffuseParams",mode == 7 ? 0.8f : 0,-0.5f,1,0.5f);
    glClear(GL_COLOR_BUFFER_BIT); glDrawArrays(GL_TRIANGLES,0,3);
    glReadPixels(0,0,SIDE,SIDE,GL_RGBA,GL_UNSIGNED_BYTE,pixels);
    GLenum error=glGetError(); if(error) {fprintf(stderr,"GL error %x\n",error);exit(10);}
}

int main(int argc, char **argv) {
    if(argc != 5) return 2;
    EGLDisplay display=eglGetDisplay(EGL_DEFAULT_DISPLAY);
    if(display==EGL_NO_DISPLAY || !eglInitialize(display,NULL,NULL) || !eglBindAPI(EGL_OPENGL_ES_API)) return 3;
    const EGLint attrs[]={EGL_SURFACE_TYPE,EGL_PBUFFER_BIT,EGL_RENDERABLE_TYPE,EGL_OPENGL_ES3_BIT,
        EGL_RED_SIZE,8,EGL_GREEN_SIZE,8,EGL_BLUE_SIZE,8,EGL_ALPHA_SIZE,8,EGL_NONE};
    EGLConfig config; EGLint count=0;
    if(!eglChooseConfig(display,attrs,&config,1,&count) || count != 1) return 4;
    const EGLint surface_attrs[]={EGL_WIDTH,SIDE,EGL_HEIGHT,SIDE,EGL_NONE};
    const EGLint context_attrs[]={EGL_CONTEXT_CLIENT_VERSION,3,EGL_NONE};
    EGLSurface surface=eglCreatePbufferSurface(display,config,surface_attrs);
    EGLContext context=eglCreateContext(display,config,EGL_NO_CONTEXT,context_attrs);
    if(surface==EGL_NO_SURFACE || context==EGL_NO_CONTEXT || !eglMakeCurrent(display,surface,surface,context)) return 5;
    GLuint actual=load_program(argv[1],argv[2]), reference=load_program(argv[3],argv[4]);
    GLuint vao,buffer,textures[6]; glGenVertexArrays(1,&vao);glBindVertexArray(vao);
    glGenBuffers(1,&buffer);glBindBuffer(GL_ARRAY_BUFFER,buffer);
    const GLfloat triangle[]={-1,-1,0,3,-1,0,-1,3,0};
    glBufferData(GL_ARRAY_BUFFER,sizeof(triangle),triangle,GL_STATIC_DRAW);
    glEnableVertexAttribArray(0);glVertexAttribPointer(0,3,GL_FLOAT,GL_FALSE,0,NULL);
    glVertexAttrib4f(2,0.7f,0.4f,0.9f,1);glVertexAttrib4f(8,0.5f,0.5f,0,1);
    glVertexAttrib4f(9,1,0,0,0);glVertexAttrib4f(10,0,1,0,0);glVertexAttrib4f(11,0,0,1,0);
    const GLubyte texels[6][4]={{128,128,255,128},{192,144,96,255},{160,208,128,255},
        {128,96,176,255},{90,64,40,255},{170,210,255,255}};
    glGenTextures(6,textures);
    for(int i=0;i<6;i++) {
        glActiveTexture(GL_TEXTURE0+i); GLenum target=i==5?GL_TEXTURE_CUBE_MAP:GL_TEXTURE_2D;
        glBindTexture(target,textures[i]);
        for(int face=0;face<(i==5?6:1);face++) glTexImage2D(i==5?GL_TEXTURE_CUBE_MAP_POSITIVE_X+face:target,
            0,GL_RGBA8,1,1,0,GL_RGBA,GL_UNSIGNED_BYTE,texels[i]);
        glTexParameteri(target,GL_TEXTURE_MIN_FILTER,GL_NEAREST);glTexParameteri(target,GL_TEXTURE_MAG_FILTER,GL_NEAREST);
        glTexParameteri(target,GL_TEXTURE_WRAP_S,GL_CLAMP_TO_EDGE);glTexParameteri(target,GL_TEXTURE_WRAP_T,GL_CLAMP_TO_EDGE);
    }
    glViewport(0,0,SIDE,SIDE);glDisable(GL_BLEND);glDisable(GL_DEPTH_TEST);glDisable(GL_CULL_FACE);glDisable(GL_DITHER);
    glClearColor(0,0,0,0);
    const GLubyte bumps[4][4]={{128,128,255,128},{128,180,200,180},{128,96,160,150},{255,240,0,220}};
    const char *modes[]={"stock-point","stock-ambient","enhanced-point","enhanced-ambient","enhancement-controls","cel-hard","cel-soft","flat-diffuse"};
    printf("{\"driver\":\"%s\",\"cases\":[",glGetString(GL_RENDERER));
    for(int bump=0;bump<4;bump++) for(int direction=0;direction<4;direction++) for(int mode=0;mode<8;mode++) {
        glActiveTexture(GL_TEXTURE0);glTexSubImage2D(GL_TEXTURE_2D,0,0,0,1,1,GL_RGBA,GL_UNSIGNED_BYTE,bumps[bump]);
        GLubyte actual_pixels[BYTES],reference_pixels[BYTES];
        render(actual,mode,direction,actual_pixels);render(reference,mode,direction,reference_pixels);
        int maximum=0,changed=0,peak=0;
        for(int i=0;i<BYTES;i++) {
            int delta=abs((int)actual_pixels[i]-(int)reference_pixels[i]);
            if(delta>maximum)maximum=delta;
            if(delta>1)changed++;
            if(reference_pixels[i]>peak)peak=reference_pixels[i];
        }
        const int center=(SIDE/2*SIDE+SIDE/2)*4;
        printf("%s{\"mode\":\"%s\",\"bump\":%d,\"direction\":%d,\"maximumChannelDifference\":%d,\"differentChannels\":%d,\"referencePeak\":%d,\"actualCenter\":[%u,%u,%u],\"referenceCenter\":[%u,%u,%u]}",
            bump||direction||mode?",":"",modes[mode],bump,direction,maximum,changed,peak,
            actual_pixels[center],actual_pixels[center+1],actual_pixels[center+2],reference_pixels[center],reference_pixels[center+1],reference_pixels[center+2]);
    }
    printf("]}\n");
    glDeleteProgram(actual);glDeleteProgram(reference);glDeleteTextures(6,textures);
    glDeleteBuffers(1,&buffer);glDeleteVertexArrays(1,&vao);
    eglMakeCurrent(display,EGL_NO_SURFACE,EGL_NO_SURFACE,EGL_NO_CONTEXT);
    eglDestroyContext(display,context);eglDestroySurface(display,surface);eglTerminate(display);
    return 0;
}
