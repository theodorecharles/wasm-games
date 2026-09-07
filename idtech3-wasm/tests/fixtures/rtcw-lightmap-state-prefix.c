/* Test boundary for the complete native tr_es2.c, not a replacement renderer. */
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
typedef unsigned GLenum;
typedef unsigned char GLboolean;
#define GL_VERTEX_ARRAY 0x8074
#define GL_NORMAL_ARRAY 0x8075
#define GL_COLOR_ARRAY 0x8076
#define GL_TEXTURE_COORD_ARRAY 0x8078
#define GL_FLOAT 0x1406
#define GL_UNSIGNED_BYTE 0x1401
#define GL_TEXTURE_2D 0x0de1
#define GL_TRIANGLES 4

typedef int qboolean;
enum { qfalse, qtrue, PRINT_ALL, GLS_DEFAULT, FUNCTABLE_SIZE = 1024, FUNCTABLE_SIZE2 = 10 };
typedef unsigned short glIndex_t;
typedef struct { unsigned texnum; } image_t;
typedef struct { image_t *image[4]; int numImageAnimations; float imageAnimationSpeed; } textureBundle_t;
typedef struct {
    int numIndexes, numVertexes;
    glIndex_t indexes[2048];
    float xyz[1024][4], texCoords[1024][2][2], shaderTime;
    struct { unsigned char colors[1024][4]; } svars;
} shaderCommands_t;
static shaderCommands_t tess;
static struct { image_t *defaultImage; } tr;
static struct { struct { float projectionMatrix[16]; } viewParms; struct { float modelMatrix[16]; } or; } backEnd;
static struct { int currenttextures[2]; } glState;
static void printIgnored(int level, const char *format, ...) { (void)level; (void)format; }
static struct { void (*Printf)(int, const char *, ...); } ri = { printIgnored };
#define Com_Memcpy memcpy
static void GL_State(unsigned bits) { (void)bits; }
static unsigned enableMask, drawCalls, verticesDrawn, uploaded;
static unsigned nativeDrawMask;
static int checkIsolation = 1;
static int capIndex(GLenum cap) {
    switch (cap) {
        case GL_VERTEX_ARRAY: return 0;
        case GL_NORMAL_ARRAY: return 1;
        case GL_COLOR_ARRAY: return 2;
        case GL_TEXTURE_COORD_ARRAY: return 3;
        default: assert(0); return -1;
    }
}
static void qglGetBooleanv(GLenum cap, GLboolean *value) { *value = !!(enableMask & (1u << capIndex(cap))); }
static void qglEnableClientState(GLenum cap) { enableMask |= 1u << capIndex(cap); }
static void qglDisableClientState(GLenum cap) { enableMask &= ~(1u << capIndex(cap)); }
