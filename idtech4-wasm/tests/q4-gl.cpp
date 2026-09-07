#include <assert.h>
#include <stdlib.h>
#include <GL/glew.h>
#include <algorithm>
#include <string>
#include <string.h>
#include <emscripten.h>
#include <emscripten/html5_webgl.h>
#include "RendererCaps.h"
#include "webgl_compat.h"

// Minimal engine state around the production functions extracted by the test.
using std::min;
using std::max;
#define Min min
#define Max max
#define MAX_MULTITEXTURE_UNITS 8
struct Clearable { void Clear() {} } rg_extensionTokens;
struct ExtensionString : std::string { void Clear() { clear(); } } rg_extensionString;
static void GLCapabilityProbe_AddLegacyExtensions(const char *extensions) {
    if (extensions) rg_extensionString.append(extensions);
}
static bool R_CheckExtension(const char *name) {
    return (" " + rg_extensionString + " ").find(" " + std::string(name) + " ") != std::string::npos;
}
struct Cvar { bool value = false; bool GetBool() const { return value; } } r_inhibitFragmentProgram;
struct Cvars { int dedicated = 0; int GetCVarInteger(const char *) const { return dedicated; } } cvarFixture;
static Cvars *cvarSystem = &cvarFixture;
struct Common {
    bool initialized = false;
    bool IsInitialized() const { return initialized; }
    void Printf(const char *, ...) {}
} commonFixture;
static Common *common = &commonFixture;
// Surrounding SDL/session state only; focus setter and query are production.
#define OPENQ4_SDL3_EMSCRIPTEN_HOST 1
static bool s_browserPageFocused = false, s_sdlFocusInputReleased = false;
static bool s_browserPointerCaptured = false;
struct WindowState { bool activeApp = false, mouseGrabbed = false, mouseReleased = true; } win32;
struct SessionState {
    int updates = 0;
    void SetPlayingSoundWorld() { ++updates; }
} sessionFixture;
static SessionState *session = &sessionFixture;
static int focusReleases = 0;
static int Sys_Milliseconds() { return 123; }
static void SDL3_ReleaseFocusInputState(int time) {
    assert(time == 123);
    s_sdlFocusInputReleased = true;
    ++focusReleases;
}
struct Config {
    renderBackendCaps_t backendCaps;
    bool ARBVertexProgramAvailable = false, ARBFragmentProgramAvailable = false;
    int maxTextureImageUnits;
} glConfig;
#include "q4-gl-production.h"

extern "C" EMSCRIPTEN_KEEPALIVE int Q4GLFocusProbe() {
    assert(!Sys_SDL_IsGameWindowFocused());
    Q4WASM_BrowserFocus(1);
    assert(Sys_SDL_IsGameWindowFocused());
    assert(sessionFixture.updates == 0 && focusReleases == 0);
    commonFixture.initialized = true;
    Q4WASM_BrowserFocus(0);
    assert(!Sys_SDL_IsGameWindowFocused() && !win32.activeApp);
    assert(sessionFixture.updates == 1 && focusReleases == 1 && s_sdlFocusInputReleased);
    Q4WASM_BrowserFocus(0);
    assert(sessionFixture.updates == 1 && focusReleases == 1);
    Q4WASM_BrowserFocus(1);
    assert(Sys_SDL_IsGameWindowFocused() && win32.activeApp && !s_sdlFocusInputReleased);
    assert(sessionFixture.updates == 2);
    assert(!SDL3_IsMouseCaptured());
    Q4WASM_BrowserCapture(1);
    assert(SDL3_IsMouseCaptured() && win32.mouseGrabbed && !win32.mouseReleased);
    Q4WASM_BrowserCapture(0);
    assert(!SDL3_IsMouseCaptured() && !win32.mouseGrabbed && win32.mouseReleased);
    return 1;
}

extern "C" void (*OpenQ4_GlewGetProcAddress(const unsigned char *name))(void) {
    return reinterpret_cast<void (*)(void)>(Q4WASM_GetGLProcAddress(reinterpret_cast<const char *>(name)));
}

EM_JS(void, Q4GLRecordProbe, (), {
    Module.collected = {
        color: Array.from(GLImmediate.clientColor),
        matrixCount: GLImmediate.matrix.length,
        vertices: Array.from(GLImmediate.vertexData.subarray(0, GLImmediate.vertexCounter)),
        texture0: {...GLImmediate.clientAttributes[GLImmediate.TEXTURE0]},
        texture1: {...GLImmediate.clientAttributes[GLImmediate.TEXTURE0 + 1]},
        position: {...GLImmediate.clientAttributes[GLImmediate.VERTEX]}
    };
});

extern "C" EMSCRIPTEN_KEEPALIVE int Q4GLProbe() {
    assert(Q4WASM_CreateDirectWebGLContext(0, 1, 1, 0));
    // Do not initialize emulation in the fixture: the production context
    // path must do it before the renderer's first fixed-function operation.
    glColor4f(0.25f, 0.5f, 0.75f, 1.0f);
    assert(!Q4WASM_GetGLProcAddress(NULL));
    assert(!Q4WASM_GetGLProcAddress(""));
    assert(!emscripten_webgl_get_proc_address("glClientActiveTextureARB"));
    assert(!emscripten_webgl_get_proc_address("glCreateShaderObjectARB"));
    glewExperimental = GL_TRUE;
    assert(glewInit() == GLEW_OK);
    assert(glClientActiveTextureARB && glMultiTexCoord2fARB && glCreateShaderObjectARB);
    assert(glGenFramebuffers && glBindFramebuffer && glFramebufferTexture2D && glBlitFramebuffer);
    glDrawBuffer(GL_BACK);
    glDrawBuffer(GL_NONE);
    glDrawBuffer(GL_COLOR_ATTACHMENT0);
    reinterpret_cast<void (*)(GLenum)>(Q4WASM_GetGLProcAddress("glDrawBuffer"))(GL_BACK);
    const char *names[] = {
        "glActiveTextureARB", "glClientActiveTextureARB", "glMultiTexCoord2fARB",
        "glCreateShaderObjectARB", "glShaderSourceARB", "glCompileShaderARB",
        "glCreateProgramObjectARB", "glUseProgramObjectARB", "glAttachObjectARB",
        "glGetObjectParameterivARB", "glGetInfoLogARB", "glDeleteObjectARB",
        "glBindBufferARB", "glUniformMatrix4fvARB", "glVertexAttribPointerARB"
    };
    for (const char *name : names) assert(Q4WASM_GetGLProcAddress(name));
    assert(!Q4WASM_GetGLProcAddress("glProgramStringARB"));
    assert(!Q4WASM_GetGLProcAddress("glThisFunctionDoesNotExist"));
    typedef void (*MultiTex)(GLenum, GLfloat, GLfloat);
    const MultiTex multi = reinterpret_cast<MultiTex>(Q4WASM_GetGLProcAddress("glMultiTexCoord2fARB"));
    while (glGetError() != GL_NO_ERROR) {}
    multi(GL_TEXTURE0 - 1, 0, 0);
    assert(glGetError() == GL_INVALID_ENUM);
    multi(GL_TEXTURE1, 0, 0);
    assert(glGetError() == GL_INVALID_OPERATION);
    glBegin(GL_QUADS);
    glTexCoord2f(0.25f, 0.75f);
    multi(GL_TEXTURE1, 0.5f, 0.125f);
    glVertex2f(10, 20);
    glTexCoord2f(0.75f, 0.25f);
    multi(GL_TEXTURE1, 0.125f, 0.5f);
    glVertex2f(30, 40);
    // Inspect the actual immediate vertex stream before GPU submission. This
    // is a compatibility regression, not a substitute for browser rendering.
    Q4GLRecordProbe();
    return 1;
}

EM_JS(void, Q4GLDrawFixture, (int enabled), {
    if (enabled) {
        Module.drawRanges = [];
        Module.realGetRenderer = GLImmediate.getRenderer;
        GLImmediate.mode = -1;
        GLImmediate.disableBeginEndClientAttributes();
        // GPU shader execution is outside this native diagnostic. Attribute
        // layout/range preparation and index uploads remain production code.
        GLImmediate.getRenderer = () => ({prepare() {
            Module.drawRanges.push({first: GLImmediate.firstVertex, last: GLImmediate.lastVertex});
        }});
    } else {
        GLImmediate.getRenderer = Module.realGetRenderer;
    }
});

extern "C" EMSCRIPTEN_KEEPALIVE int Q4GLIndexedProbe() {
    Q4GLDrawFixture(1);
    float *vertices = static_cast<float *>(calloc(70001 * 3, sizeof(float)));
    assert(vertices);
    const GLuint wide[] = {65536, 70000, 3};
    glEnableClientState(GL_VERTEX_ARRAY);
    glVertexPointer(3, GL_FLOAT, 3 * sizeof(float), vertices);
    glDrawElements(GL_TRIANGLES, 3, GL_UNSIGNED_INT, wide);

    GLuint buffers[2]; glGenBuffers(2, buffers);
    glBindBuffer(GL_ARRAY_BUFFER, buffers[0]);
    glVertexPointer(3, GL_FLOAT, 3 * sizeof(float), NULL);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, buffers[1]);
    glDrawElements(GL_TRIANGLES, 3, GL_UNSIGNED_INT, reinterpret_cast<void *>(16));
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, 0);
    glBindBuffer(GL_ARRAY_BUFFER, 0);
    glDisableClientState(GL_VERTEX_ARRAY);
    const GLushort narrow[] = {2, 1, 0};
    const GLubyte small[] = {0, 2, 1};
    glDrawElements(GL_TRIANGLES, 3, GL_UNSIGNED_SHORT, narrow);
    reinterpret_cast<void (*)(GLenum, GLsizei, GLenum, const void *)>(Q4WASM_GetGLProcAddress("glDrawElements"))(
        GL_TRIANGLES, 3, GL_UNSIGNED_BYTE, small);
    glDrawElements(GL_TRIANGLES, 3, GL_FLOAT, wide);
    assert(glGetError() == GL_INVALID_ENUM);
    glDrawElements(GL_TRIANGLES, -1, GL_UNSIGNED_INT, wide);
    assert(glGetError() == GL_INVALID_VALUE);
    glDrawElements(GL_TRIANGLES, 128, GL_UNSIGNED_INT, reinterpret_cast<void *>(0x7ffffff0));
    assert(glGetError() == GL_INVALID_OPERATION);
    free(vertices);
    Q4GLDrawFixture(0);
    return 1;
}

extern "C" EMSCRIPTEN_KEEPALIVE int Q4GLCanUseProbe() {
    GLCapabilityProbe_Build(glConfig.backendCaps, "OpenGL ES 3.0 (WebGL 2.0)",
        reinterpret_cast<const char *>(glGetString(GL_EXTENSIONS)));
    glConfig.maxTextureImageUnits = glConfig.backendCaps.maxTextureImageUnits;
    return R_CanUseGLSLPrograms();
}

EM_JS(void, Q4GLCacheCase, (const char *label, unsigned int buffer, int offset, int size, int type, int textureOffset), {
    Module.cacheLabel = UTF8ToString(label);
    Module.cacheExpected = {buffer, offset, size, type, textureOffset};
});

extern "C" EMSCRIPTEN_KEEPALIVE int Q4GLVertexCacheProbe() {
    // No getRenderer/prepare substitution: exercise the actual SDK cache with
    // unchanged matrices, shader and stride, as in the game's depth prepass.
    GLuint buffers[2]; glGenBuffers(2, buffers);
    const GLuint indices[] = {0, 1, 2};
    const float vertices[64] = {};
    for (GLuint buffer : buffers) {
        glBindBuffer(GL_ARRAY_BUFFER, buffer);
        glBufferData(GL_ARRAY_BUFFER, sizeof(vertices), vertices, GL_STATIC_DRAW);
    }
    glClientActiveTexture(GL_TEXTURE0);
    glEnable(GL_TEXTURE_2D);
    glEnableClientState(GL_VERTEX_ARRAY);
    glEnableClientState(GL_TEXTURE_COORD_ARRAY);
    glBindBuffer(GL_ARRAY_BUFFER, buffers[0]);
    glVertexPointer(3, GL_FLOAT, 32, nullptr);
    glTexCoordPointer(2, GL_FLOAT, 32, reinterpret_cast<void *>(12));
    Q4GLCacheCase("first-buffer", buffers[0], 0, 3, GL_FLOAT, 12);
    glDrawElements(GL_TRIANGLES, 3, GL_UNSIGNED_INT, indices);
    Q4GLCacheCase("unchanged-fast-path", buffers[0], 0, 3, GL_FLOAT, 12);
    glDrawElements(GL_TRIANGLES, 3, GL_UNSIGNED_INT, indices);
    glBindBuffer(GL_ARRAY_BUFFER, buffers[1]);
    glVertexPointer(3, GL_FLOAT, 32, nullptr);
    glTexCoordPointer(2, GL_FLOAT, 32, reinterpret_cast<void *>(12));
    Q4GLCacheCase("different-buffer-same-layout", buffers[1], 0, 3, GL_FLOAT, 12);
    glDrawElements(GL_TRIANGLES, 3, GL_UNSIGNED_INT, indices);
    glVertexPointer(3, GL_FLOAT, 32, reinterpret_cast<void *>(32));
    glTexCoordPointer(2, GL_FLOAT, 32, reinterpret_cast<void *>(44));
    Q4GLCacheCase("same-buffer-new-offsets", buffers[1], 32, 3, GL_FLOAT, 44);
    glDrawElements(GL_TRIANGLES, 3, GL_UNSIGNED_INT, indices);
    glVertexPointer(2, GL_FLOAT, 32, reinterpret_cast<void *>(32));
    Q4GLCacheCase("same-stride-new-component-count", buffers[1], 32, 2, GL_FLOAT, 44);
    glDrawElements(GL_TRIANGLES, 3, GL_UNSIGNED_INT, indices);
    glVertexPointer(2, GL_SHORT, 32, reinterpret_cast<void *>(32));
    Q4GLCacheCase("same-stride-new-component-type", buffers[1], 32, 2, GL_SHORT, 44);
    glDrawElements(GL_TRIANGLES, 3, GL_UNSIGNED_INT, indices);
    glTexCoordPointer(2, GL_FLOAT, 32, reinterpret_cast<void *>(48));
    Q4GLCacheCase("texture-offset-only", buffers[1], 32, 2, GL_SHORT, 48);
    glDrawElements(GL_TRIANGLES, 3, GL_UNSIGNED_INT, indices);
    glBindBuffer(GL_ARRAY_BUFFER, buffers[0]);
    glVertexPointer(3, GL_FLOAT, 32, nullptr);
    glTexCoordPointer(2, GL_FLOAT, 32, reinterpret_cast<void *>(12));
    Q4GLCacheCase("return-to-first-buffer", buffers[0], 0, 3, GL_FLOAT, 12);
    glDrawElements(GL_TRIANGLES, 3, GL_UNSIGNED_INT, indices);
    glBindBuffer(GL_ARRAY_BUFFER, 0);
    glVertexPointer(3, GL_FLOAT, 32, vertices);
    glTexCoordPointer(2, GL_FLOAT, 32, vertices + 3);
    Q4GLCacheCase("cpu-interleaved", 0, 0, 3, GL_FLOAT, 12);
    glDrawElements(GL_TRIANGLES, 3, GL_UNSIGNED_INT, indices);
    glTexCoordPointer(2, GL_FLOAT, 32, vertices + 5);
    Q4GLCacheCase("cpu-new-texture-offset", 0, 0, 3, GL_FLOAT, 20);
    glDrawElements(GL_TRIANGLES, 3, GL_UNSIGNED_INT, indices);
    glDisableClientState(GL_TEXTURE_COORD_ARRAY);
    glDisableClientState(GL_VERTEX_ARRAY);
    glDisable(GL_TEXTURE_2D);
    return 1;
}

EM_JS(void, Q4GLSplitCase, (const char *label, int positionBuffer, int textureBuffer,
        int positionStride, int textureStride, int currentBuffer), {
    Module.splitLabel = UTF8ToString(label);
    Module.splitExpected = {positionBuffer, textureBuffer, positionStride, textureStride, currentBuffer};
});

extern "C" EMSCRIPTEN_KEEPALIVE int Q4GLSplitBufferProbe() {
    // Sky positions and generated cube coordinates reside in different VBOs.
    // A later GL_ARRAY_BUFFER bind must not retarget either saved array pointer.
    GLuint buffers[3]; glGenBuffers(3, buffers);
    const GLuint indices[] = {0, 1, 2};
    const float vertices[64] = {};
    for (GLuint buffer : buffers) {
        glBindBuffer(GL_ARRAY_BUFFER, buffer);
        glBufferData(GL_ARRAY_BUFFER, sizeof(vertices), vertices, GL_STATIC_DRAW);
    }
    glClientActiveTexture(GL_TEXTURE0);
    glEnable(GL_TEXTURE_CUBE_MAP);
    glEnableClientState(GL_VERTEX_ARRAY);
    glEnableClientState(GL_TEXTURE_COORD_ARRAY);
    glBindBuffer(GL_ARRAY_BUFFER, buffers[0]);
    glVertexPointer(3, GL_FLOAT, 64, nullptr);
    glBindBuffer(GL_ARRAY_BUFFER, buffers[1]);
    glTexCoordPointer(3, GL_FLOAT, 0, nullptr);
    Q4GLSplitCase("split-sky-streams", buffers[0], buffers[1], 64, 0, buffers[1]);
    glDrawElements(GL_TRIANGLES, 3, GL_UNSIGNED_INT, indices);
    glBindBuffer(GL_ARRAY_BUFFER, buffers[0]);
    glVertexPointer(3, GL_FLOAT, 32, nullptr);
    glBindBuffer(GL_ARRAY_BUFFER, buffers[1]);
    glTexCoordPointer(3, GL_FLOAT, 32, nullptr);
    Q4GLSplitCase("split-same-stride", buffers[0], buffers[1], 32, 32, buffers[1]);
    glDrawElements(GL_TRIANGLES, 3, GL_UNSIGNED_INT, indices);
    glBindBuffer(GL_ARRAY_BUFFER, buffers[2]);
    Q4GLSplitCase("unrelated-array-buffer-bind", buffers[0], buffers[1], 32, 32, buffers[2]);
    glDrawElements(GL_TRIANGLES, 3, GL_UNSIGNED_INT, indices);
    glBindBuffer(GL_ARRAY_BUFFER, 0);
    Q4GLSplitCase("unbind-retains-vbo-pointers", buffers[0], buffers[1], 32, 32, 0);
    glDrawElements(GL_TRIANGLES, 3, GL_UNSIGNED_INT, indices);
    Q4GLSplitCase("draw-arrays-after-unbind", buffers[0], buffers[1], 32, 32, 0);
    glDrawArrays(GL_TRIANGLES, 0, 3);
    glBindBuffer(GL_ARRAY_BUFFER, buffers[2]);
    Q4GLSplitCase("draw-arrays-after-unrelated-bind", buffers[0], buffers[1], 32, 32, buffers[2]);
    glDrawArrays(GL_TRIANGLES, 0, 3);
    glBindBuffer(GL_ARRAY_BUFFER, buffers[0]);
    glVertexPointer(3, GL_FLOAT, 32, nullptr);
    glTexCoordPointer(3, GL_FLOAT, 32, nullptr);
    Q4GLSplitCase("return-to-one-buffer", buffers[0], buffers[0], 32, 32, buffers[0]);
    glDrawElements(GL_TRIANGLES, 3, GL_UNSIGNED_INT, indices);
    glDisableClientState(GL_TEXTURE_COORD_ARRAY);
    glDisableClientState(GL_VERTEX_ARRAY);
    glDisable(GL_TEXTURE_CUBE_MAP);
    return 1;
}

extern "C" EMSCRIPTEN_KEEPALIVE int Q4GLCapabilitiesProbe() {
    assert(Q4GLCanUseProbe());
    const renderBackendCaps_t &caps = glConfig.backendCaps;
    assert(caps.contextCreated && caps.glMajor == 3 && caps.glMinor == 0);
    assert(caps.profile == RENDERER_CONTEXT_PROFILE_ES);
    assert(caps.hasFixedFunctionCompatibility && caps.hasGLSL && caps.hasVBO && caps.hasFBO);
    assert(caps.maxTextureUnits == 8 && caps.maxTextureCoords == 13 && caps.maxTextureImageUnits == 16);
    assert(caps.hasMRT && caps.maxTextureSize == 4096);
    assert(!caps.hasARBVertexProgram && !caps.hasARBFragmentProgram && !caps.hasPBO);
    assert(!caps.hasFramebufferSRGB && !caps.hasMapBufferRange && !caps.hasCompute);
    assert(!glConfig.ARBVertexProgramAvailable && !glConfig.ARBFragmentProgramAvailable);
    const auto savedCompile = glCompileShaderARB;
    glCompileShaderARB = NULL;
    assert(!R_CanUseGLSLPrograms());
    glCompileShaderARB = savedCompile;
    r_inhibitFragmentProgram.value = true;
    assert(!R_CanUseGLSLPrograms());
    r_inhibitFragmentProgram.value = false;
    cvarFixture.dedicated = 1;
    assert(!R_CanUseGLSLPrograms());
    cvarFixture.dedicated = 0;
    glConfig.backendCaps.glMajor = 2;
    assert(!R_CanUseGLSLPrograms());
    glConfig.backendCaps.glMajor = 3;
    rg_extensionString.Clear();
    assert(!R_CanUseGLSLPrograms());
    return 1;
}

extern "C" EMSCRIPTEN_KEEPALIVE int Q4GLBorderProbe() {
    const char *vertexSource = "#version 300 es\nprecision highp float;\nvoid main(){gl_Position=vec4(0,0,0,1);}";
    const char *fragmentSource = "#version 300 es\nprecision highp float;\nuniform sampler2D q4ProbeTexture;\nout vec4 color;\nvoid main(){color=texture(q4ProbeTexture,vec2(0.5));}";
    GLuint vertex = glCreateShader(GL_VERTEX_SHADER), fragment = glCreateShader(GL_FRAGMENT_SHADER);
    glShaderSource(vertex,1,&vertexSource,NULL); glCompileShader(vertex);
    glShaderSource(fragment,1,&fragmentSource,NULL); glCompileShader(fragment);
    GLuint program = glCreateProgram();
    glAttachShader(program,vertex); glAttachShader(program,fragment); glLinkProgram(program);
    glUseProgram(program);
    GLint sampler = glGetUniformLocation(program,"q4ProbeTexture");
    assert(sampler >= 0);
    GLuint texture; glGenTextures(1,&texture);
    glActiveTexture(GL_TEXTURE0); glBindTexture(GL_TEXTURE_2D,texture);
    Q4WASM_SetBorderSampler(texture,1,2,3,16,0,0,0,1);
    glUniform1i(sampler,0);
    glDrawArrays(GL_TRIANGLES,0,3);
    const GLint unit = 3;
    glUniform1iv(sampler,1,&unit);
    glDrawArrays(GL_TRIANGLES,0,3);
    glActiveTexture(GL_TEXTURE3); glBindTexture(GL_TEXTURE_2D,texture);
    glDrawArrays(GL_TRIANGLES,0,3);
    Q4WASM_SetBorderSampler(texture,1,1,0,1,0,0,0,0);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER,0);
    const GLuint indices[] = {0,1,2};
    glDrawElements(GL_TRIANGLES,3,GL_UNSIGNED_INT,indices);
    glDrawElements(GL_TRIANGLES,3,GL_UNSIGNED_INT,indices);
    glDeleteTextures(1,&texture);
    glDrawArrays(GL_TRIANGLES,0,3);
    glUseProgram(0); glDeleteProgram(program); glDeleteShader(vertex); glDeleteShader(fragment);
    glActiveTexture(GL_TEXTURE0);
    return 1;
}

extern "C" EMSCRIPTEN_KEEPALIVE int Q4GLNormalMatrixProbe() {
    // u_modelView is absent from the executable: only the derived normal
    // matrix is consumed. Fixed-function lighting is intentionally disabled.
    const char *vertexSource = "#version 110\nvarying vec3 normal;void main(){normal=gl_NormalMatrix*gl_Normal;gl_Position=gl_ProjectionMatrix*gl_Vertex;}";
    const char *fragmentSource = "#version 110\nvarying vec3 normal;void main(){gl_FragColor=vec4(normal,1.);}";
    GLuint vertex=glCreateShader(GL_VERTEX_SHADER),fragment=glCreateShader(GL_FRAGMENT_SHADER);
    glShaderSource(vertex,1,&vertexSource,NULL);glCompileShader(vertex);
    glShaderSource(fragment,1,&fragmentSource,NULL);glCompileShader(fragment);
    GLuint program=glCreateProgram();glAttachShader(program,vertex);glAttachShader(program,fragment);
    glLinkProgram(program);glUseProgram(program);
    GLuint buffer;glGenBuffers(1,&buffer);glBindBuffer(GL_ARRAY_BUFFER,buffer);
    const float vertices[18]={};glBufferData(GL_ARRAY_BUFFER,sizeof(vertices),vertices,GL_STATIC_DRAW);
    glEnableClientState(GL_VERTEX_ARRAY);glEnableClientState(GL_NORMAL_ARRAY);
    glVertexPointer(3,GL_FLOAT,24,nullptr);glNormalPointer(GL_FLOAT,24,reinterpret_cast<void *>(12));
    glMatrixMode(GL_MODELVIEW);glLoadIdentity();glScalef(2,4,8);
    const GLuint indices[]={0,1,2};glDrawElements(GL_TRIANGLES,3,GL_UNSIGNED_INT,indices);
    glLoadIdentity();glScalef(4,8,16);glDrawElements(GL_TRIANGLES,3,GL_UNSIGNED_INT,indices);
    glLoadIdentity();glDisableClientState(GL_VERTEX_ARRAY);glDisableClientState(GL_NORMAL_ARRAY);
    glUseProgram(0);glDeleteProgram(program);glDeleteShader(vertex);glDeleteShader(fragment);
    return 1;
}
