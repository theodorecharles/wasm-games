#include <algorithm>
#include <cstdio>
#include <cstring>
#include <vector>

using GLuint = unsigned;
using GLsync = unsigned;
using GLbitfield = unsigned;
enum { GL_ARRAY_BUFFER = 1, GL_STREAM_DRAW = 2, GL_MAP_WRITE_BIT = 4,
       GL_MAP_PERSISTENT_BIT = 8, GL_MAP_COHERENT_BIT = 16 };
#define ARRAY_SSIZE(a) (int(sizeof(a) / sizeof((a)[0])))
#define Bmemset std::memset
#define VLOG_F(...) ((void)0)
#define USE_GLEXT 1

static struct { bool bufferstorage, sync; } glinfo;
static int r_persistentStreamBuffer, r_drawpolyVertsBufferLength = 8;
static int drawpolyVertsBufferLength, drawpolyVertsOffset, drawpolyVertsSubBufferIndex;
static bool persistentStreamBuffer;
static GLuint drawpolyVertsID;
static GLsync drawpolyVertsSync[3];
static float defaultDrawpolyVertsArray[40], mapped[120];
static float *drawpolyVerts;
static int syncQueries, syncDeletes, unsupportedCalls, buffersDeleted, streamed, stored, mappedCalls;
static std::vector<unsigned> bindings;
static bool glIsBuffer(GLuint id) { return id == 7; }
static void glDeleteBuffers(int n, GLuint *id) { buffersDeleted += n; *id = 0; }
static void glGenBuffers(int n, GLuint *id) { if (n == 1) *id = 42; }
static bool glIsSync(GLsync id) {
    syncQueries++;
    // Recorder remains callable so a missing-capability call can be reported
    // deterministically. The actual browser's absent function pointer crashes.
    if (!glinfo.sync) unsupportedCalls++;
    return id == 11 || id == 12;
}
static void glDeleteSync(GLsync) { syncDeletes++; if (!glinfo.sync) unsupportedCalls++; }
static void buildgl_bindBuffer(unsigned target, GLuint id) {
    if (target == GL_ARRAY_BUFFER) bindings.push_back(id);
}
static void glBufferData(unsigned target, unsigned bytes, const void *data, unsigned usage) {
    streamed += target == GL_ARRAY_BUFFER && bytes == 8*5*sizeof(float) && !data && usage == GL_STREAM_DRAW;
}
static void glBufferStorage(unsigned target, unsigned bytes, const void *data, GLbitfield flags) {
    stored += target == GL_ARRAY_BUFFER && bytes == 3*8*5*sizeof(float) && !data && flags == 28;
}
static void *glMapBufferRange(unsigned target, unsigned offset, unsigned bytes, GLbitfield flags) {
    mappedCalls += target == GL_ARRAY_BUFFER && offset == 0 && bytes == 3*8*5*sizeof(float) && flags == 28;
    return mapped;
}

#include "polymost-stream-production.h"

int main() {
    int failed = 0, count = 0;
    for (bool sync : {false, true}) for (bool storage : {false, true})
    for (bool request : {false, true}) for (bool oldBuffer : {false, true}) {
        glinfo = {storage, sync};
        r_persistentStreamBuffer = request;
        drawpolyVertsBufferLength = 0;
        drawpolyVertsOffset = drawpolyVertsSubBufferIndex = 99;
        drawpolyVertsID = oldBuffer ? 7 : 0;
        drawpolyVertsSync[0] = 11; drawpolyVertsSync[1] = 0; drawpolyVertsSync[2] = 12;
        syncQueries = syncDeletes = unsupportedCalls = buffersDeleted = streamed = stored = mappedCalls = 0;
        bindings.clear();
        polymost_initdrawpoly();
        const bool persistent = sync && storage && request;
        bool passed = unsupportedCalls == 0 && syncQueries == (sync ? 3 : 0) &&
            syncDeletes == (sync ? 2 : 0) && buffersDeleted == oldBuffer &&
            drawpolyVertsID == 42 && drawpolyVertsBufferLength == 8 &&
            drawpolyVertsOffset == 0 && drawpolyVertsSubBufferIndex == 0 &&
            std::all_of(std::begin(drawpolyVertsSync), std::end(drawpolyVertsSync), [](GLsync s){return s == 0;}) &&
            bindings == std::vector<unsigned>({42, 0}) && persistentStreamBuffer == persistent &&
            bool(r_persistentStreamBuffer) == persistent && streamed == !persistent && stored == persistent &&
            mappedCalls == persistent && drawpolyVerts == (persistent ? mapped : defaultDrawpolyVertsArray);
        std::printf("{\"case\":%d,\"sync\":%s,\"storage\":%s,\"requested\":%s,\"oldBuffer\":%s,\"passed\":%s,\"unsupportedCalls\":%d}\n",
            count++, sync?"true":"false", storage?"true":"false", request?"true":"false", oldBuffer?"true":"false", passed?"true":"false", unsupportedCalls);
        failed += !passed;
    }
    return failed ? 1 : 0;
}
