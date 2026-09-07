unsigned glCreateShader(unsigned type) { (void)type; return 1; }
void glShaderSource(unsigned a,int b,const char *const *c,const int *d) {(void)a;(void)b;(void)c;(void)d;}
void glCompileShader(unsigned a) {(void)a;}
void glGetShaderiv(unsigned a,unsigned b,int *p) {(void)a;(void)b;*p=1;}
void glGetShaderInfoLog(unsigned a,int b,int *c,char *d) {(void)a;(void)b;(void)c;(void)d;}
unsigned glCreateProgram(void) {return 1;}
void glAttachShader(unsigned a,unsigned b) {(void)a;(void)b;}
void glLinkProgram(unsigned a) {(void)a;}
void glGetProgramiv(unsigned a,unsigned b,int *p) {(void)a;(void)b;*p=1;}
void glGetProgramInfoLog(unsigned a,int b,int *c,char *d) {(void)a;(void)b;(void)c;(void)d;}
void glUseProgram(unsigned a) {(void)a;}
int glGetAttribLocation(unsigned a,const char *n) {
    (void)a;
    if (!strcmp(n,"a_pos")) return 0;
    if (!strcmp(n,"a_uv0")) return 1;
    if (!strcmp(n,"a_uv1")) return 2;
    assert(!strcmp(n,"a_color")); return 3;
}
int glGetUniformLocation(unsigned a,const char *n) {(void)a;(void)n;return 1;}
void glUniformMatrix4fv(int a,int b,unsigned char c,const float *v) {
    (void)a;assert(b==1 && !c);
    for(int i=0;i<16;i++) assert(v[i]==(i%5==0 ? 1.f : 0.f));
}
void glUniform1i(int a,int b) {(void)a;(void)b;}
void glUniform1f(int a,float b) {(void)a;(void)b;}
void glEnableVertexAttribArray(unsigned a) {assert(a<4);}
void glDisableVertexAttribArray(unsigned a) {assert(a<4);}
void glVertexAttribPointer(unsigned a,int b,unsigned c,unsigned char d,int e,const void *p) {
    static const uintptr_t offsets[]={0,12,20,28};
    assert(a<4 && e==32 && (uintptr_t)p==offsets[a]);
    assert(b==(a==0?3:a==3?4:2));
    assert(c==(a==3?GL_UNSIGNED_BYTE:GL_FLOAT) && d==(a==3));
}
void glBindBuffer(unsigned a,unsigned b) {assert(a==GL_ARRAY_BUFFER && b<=1);}
void glGenBuffers(int a,unsigned *p) {assert(a==1);*p=1;}
void glBufferData(unsigned a,long bytes,const void *p,unsigned d) {
    assert(a==GL_ARRAY_BUFFER && d==GL_STREAM_DRAW && bytes>0 && bytes%32==0);
    uploaded=(unsigned)(bytes/32);
    const es2LmVert_t *v=p;
    for(unsigned i=0;i<uploaded;i++) {
        unsigned id=tess.indexes[verticesDrawn+i];
        assert(v[i].x==tess.xyz[id][0] && v[i].y==tess.xyz[id][1] && v[i].z==tess.xyz[id][2]);
        assert(v[i].u0==tess.texCoords[id][0][0] && v[i].v0==tess.texCoords[id][0][1]);
        assert(v[i].u1==tess.texCoords[id][1][0] && v[i].v1==tess.texCoords[id][1][1]);
        assert(!memcmp(&v[i].r,tess.svars.colors[id],4));
    }
}
void glActiveTexture(unsigned a) {assert(a==GL_TEXTURE0 || a==GL_TEXTURE1);}
void glBindTexture(unsigned a,unsigned b) {assert(a==GL_TEXTURE_2D && b<=2);}
void glDrawArrays(unsigned mode,int first,int count) {
    assert(mode==GL_TRIANGLES && first==0 && count>0 && count%3==0 && (unsigned)count==uploaded);
    nativeDrawMask |= enableMask;
    if(checkIsolation) assert(enableMask==0 && "legacy arrays would hijack the explicit shader draw");
    drawCalls++; verticesDrawn+=(unsigned)count;
}
int main(int argc,char **argv) {
    (void)argv;
    checkIsolation=argc==1;
    image_t diffuse={1},lightmap={2};
    textureBundle_t diff={.image={&diffuse}},lm={.image={&lightmap}};
    tr.defaultImage=&diffuse;
    for(int i=0;i<16;i++) backEnd.viewParms.projectionMatrix[i]=backEnd.or.modelMatrix[i]=(i%5==0?1.f:0.f);
    for(int i=0;i<1024;i++) {
        for(int j=0;j<3;j++) tess.xyz[i][j]=(float)(i+j);
        for(int j=0;j<2;j++) for(int k=0;k<2;k++) tess.texCoords[i][j][k]=(float)(i+2*j+k)/1024.f;
        for(int j=0;j<4;j++) tess.svars.colors[i][j]=(unsigned char)(i+j);
    }
    for(int i=0;i<2048;i++) tess.indexes[i]=(glIndex_t)((i*7)%1024);
    const int counts[]={0,2,3,6,1536,1539};
    unsigned cases=0;
    for(unsigned mask=0;mask<16;mask++) for(unsigned n=0;n<sizeof(counts)/sizeof(counts[0]);n++) {
        enableMask=mask; drawCalls=verticesDrawn=0;
        tess.numVertexes=1024; tess.numIndexes=counts[n];
        int result=RB_ES2_DrawLightmap(&tess,&diff,NULL,&lm,NULL,qfalse);
        assert(result==(counts[n]>=3));
        assert(verticesDrawn==(counts[n]>=3?(unsigned)counts[n]:0));
        assert(drawCalls==(counts[n]<3?0:counts[n]>1536?2:1));
        assert(enableMask==mask && "following legacy stages must retain their original mask");
        cases++;
    }
    printf("{\"cases\":%u,\"nativeDrawMask\":%u,\"isolationRequired\":%d}\n",cases,nativeDrawMask,checkIsolation);
    return 0;
}
