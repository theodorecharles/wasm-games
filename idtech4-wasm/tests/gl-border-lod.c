// Separate native-driver LOD selection from border texel filtering. No game
// helper or transformed shader is loaded; reuse only fixture GL utilities.
#define main border_sampling_fixture_main
#include "gl-border-sampling.c"
#undef main

int main(void) {
    EGLDisplay display = eglGetDisplay(EGL_DEFAULT_DISPLAY);
    if (display == EGL_NO_DISPLAY || !eglInitialize(display, NULL, NULL) || !eglBindAPI(EGL_OPENGL_API)) fail("EGL init");
    const EGLint attrs[] = {EGL_SURFACE_TYPE,EGL_PBUFFER_BIT,EGL_RENDERABLE_TYPE,EGL_OPENGL_BIT,
        EGL_RED_SIZE,8,EGL_GREEN_SIZE,8,EGL_BLUE_SIZE,8,EGL_ALPHA_SIZE,8,EGL_NONE};
    EGLConfig config; EGLint count;
    if (!eglChooseConfig(display,attrs,&config,1,&count) || count != 1) fail("EGL config");
    const EGLint surface_attrs[] = {EGL_WIDTH,SIDE,EGL_HEIGHT,SIDE,EGL_NONE};
    EGLSurface surface = eglCreatePbufferSurface(display,config,surface_attrs);
    EGLContext context = eglCreateContext(display,config,EGL_NO_CONTEXT,NULL);
    if (surface == EGL_NO_SURFACE || context == EGL_NO_CONTEXT || !eglMakeCurrent(display,surface,surface,context)) fail("GL context");
    const char *fragment =
        "#version 400 core\n"
        "uniform sampler2D image; uniform vec2 levelSize; uniform int projected; uniform int probeMode;\n"
        "out vec4 color;\n"
        "float axis(int i,float size) {\n"
        " if(i==0)return -1.; if(i==1)return -.5/size; if(i==2)return 0.;\n"
        " if(i==3)return .25/size; if(i==4)return .5/size; if(i==5)return .5;\n"
        " if(i==6)return 1.-.25/size; if(i==7)return 1.;\n"
        " if(i==8)return 1.+.25/size; if(i==9)return 1.+.5/size; return 2.; }\n"
        "vec2 coordinate(vec2 frag) {\n"
        " vec2 uv=vec2(axis(int(frag.x),levelSize.x),axis(int(frag.y),levelSize.y));\n"
        " return projected!=0?uv/(.75+frag.x*.04):uv; }\n"
        // Diagnostic model of Mesa's documented piecewise-linear fast log2,
        // not a proposed game change or an independent filtering reference.
        "float fastLog2(float x) { uint bits=floatBitsToUint(max(x,1e-12));\n"
        " return float(int(bits>>23u)-127)-1.+uintBitsToFloat((bits&0x7fffffu)|0x3f800000u); }\n"
        "void main() {\n"
        " vec2 raw=vec2(axis(int(gl_FragCoord.x),levelSize.x),axis(int(gl_FragCoord.y),levelSize.y));\n"
        " vec4 projection=vec4(raw,0.,.75+gl_FragCoord.x*.04); vec2 uv=coordinate(gl_FragCoord.xy);\n"
        " vec2 dx=dFdx(uv)*levelSize,dy=dFdy(uv)*levelSize;\n"
        " float rho2=max(max(dot(dx,dx),dot(dy,dy)),1e-12);float exactLod=.5*log2(rho2);\n"
        " vec2 origin=floor(gl_FragCoord.xy/2.)*2.+.5,base=coordinate(origin);\n"
        " vec2 cdx=(coordinate(origin+vec2(1,0))-base)*levelSize,cdy=(coordinate(origin+vec2(0,1))-base)*levelSize;\n"
        " float coarseRho2=max(max(dot(cdx,cdx),dot(cdy,cdy)),1e-12);\n"
        " float coarseExact=.5*log2(coarseRho2),coarseFast=.5*fastLog2(coarseRho2),fineFast=.5*fastLog2(rho2);\n"
        " vec2 nativeLod=textureQueryLod(image,uv);\n"
        " if(probeMode==6)color=vec4(coarseExact,coarseFast,fineFast,rho2);\n"
        " else if(probeMode==5)color=textureLod(image,uv,fineFast);\n"
        " else if(probeMode==4)color=textureLod(image,uv,coarseFast);\n"
        " else if(probeMode==3)color=vec4(nativeLod,exactLod,0.);\n"
        " else if(probeMode==2)color=textureLod(image,uv,exactLod);\n"
        " else if(probeMode==1)color=textureLod(image,uv,nativeLod.y);\n"
        " else if(projected!=0)color=textureProj(image,projection);\n"
        " else color=texture(image,uv);\n"
        "}\n";
    GLuint p=program("",0,fragment),vao,fbo,target;
    glUseProgram(p);glUniform1i(glGetUniformLocation(p,"image"),0);
    glGenVertexArrays(1,&vao);glBindVertexArray(vao);
    glGenFramebuffers(1,&fbo);glBindFramebuffer(GL_FRAMEBUFFER,fbo);
    glGenTextures(1,&target);glActiveTexture(GL_TEXTURE1);glBindTexture(GL_TEXTURE_2D,target);
    glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA32F,SIDE,SIDE,0,GL_RGBA,GL_FLOAT,NULL);
    glFramebufferTexture2D(GL_FRAMEBUFFER,GL_COLOR_ATTACHMENT0,GL_TEXTURE_2D,target,0);
    if(glCheckFramebufferStatus(GL_FRAMEBUFFER)!=GL_FRAMEBUFFER_COMPLETE)fail("float framebuffer");
    glActiveTexture(GL_TEXTURE0);glViewport(0,0,SIDE,SIDE);glDisable(GL_DITHER);glDisable(GL_BLEND);
    const int dimensions[][2]={{8,8},{16,4},{7,5},{1,8}};
    printf("{\"driver\":\"%s\",\"version\":\"%s\",\"cases\":[",glGetString(GL_RENDERER),glGetString(GL_VERSION));
    int rows=0;
    for(int shape=0;shape<4;++shape) {
        int width=dimensions[shape][0],height=dimensions[shape][1],last;
        GLuint t=texture(width,height,&last);
        glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_S,GL_CLAMP_TO_BORDER);
        glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_T,GL_CLAMP_TO_BORDER);
        glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MIN_FILTER,GL_LINEAR_MIPMAP_LINEAR);
        glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MAG_FILTER,GL_LINEAR);
        glUniform2f(glGetUniformLocation(p,"levelSize"),width,height);
        for(int alpha=0;alpha<2;++alpha)for(int projected=0;projected<2;++projected) {
            GLfloat border[]={0,0,0,alpha?1.0f:0.0f},samples[7][BYTES];
            glTexParameterfv(GL_TEXTURE_2D,GL_TEXTURE_BORDER_COLOR,border);
            glUniform1i(glGetUniformLocation(p,"projected"),projected);
            for(int mode=0;mode<7;++mode) {
                glUniform1i(glGetUniformLocation(p,"probeMode"),mode);glDrawArrays(GL_TRIANGLES,0,3);
                glReadPixels(0,0,SIDE,SIDE,GL_RGBA,GL_FLOAT,samples[mode]);
                if(glGetError()!=GL_NO_ERROR)fail("LOD readback");
            }
            printf("%s{\"size\":[%d,%d],\"borderAlpha\":%d,\"projected\":%d,\"samples\":[",rows++?",":"",width,height,alpha,projected);
            for(int y=0;y<SIDE;++y)for(int x=0;x<SIDE;++x) {
                int i=(y*SIDE+x)*4;
                printf("%s{\"pixel\":[%d,%d],\"query\":[%.9g,%.9g],\"exactLod\":%.9g",x||y?",":"",x,y,samples[3][i],samples[3][i+1],samples[3][i+2]);
                const char *names[]={"implicit","queryLod","exactLodSample"};
                for(int mode=0;mode<3;++mode)printf(",\"%s\":[%.9g,%.9g,%.9g,%.9g]",names[mode],samples[mode][i],samples[mode][i+1],samples[mode][i+2],samples[mode][i+3]);
                const char *more[]={"coarseFastSample","fineFastSample","modelLods"};
                for(int mode=4;mode<7;++mode)printf(",\"%s\":[%.9g,%.9g,%.9g,%.9g]",more[mode-4],samples[mode][i],samples[mode][i+1],samples[mode][i+2],samples[mode][i+3]);
                printf("}");
            }
            printf("]}");
        }
        glDeleteTextures(1,&t);
    }
    printf("]}\n");
    glDeleteTextures(1,&target);glDeleteFramebuffers(1,&fbo);glDeleteVertexArrays(1,&vao);glDeleteProgram(p);
    eglMakeCurrent(display,EGL_NO_SURFACE,EGL_NO_SURFACE,EGL_NO_CONTEXT);
    eglDestroyContext(display,context);eglDestroySurface(display,surface);eglTerminate(display);return 0;
}
