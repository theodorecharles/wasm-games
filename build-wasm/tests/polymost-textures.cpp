// Exact production functions are extracted by test-polymost-textures.mjs.
#include <EGL/egl.h>
#include <EGL/eglext.h>
#include <GLES3/gl3.h>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>
#define GL_BGRA 0x80E1
#define GL_UNSIGNED_INT_8_8_8_8_REV 0x8367
#define GL_TEXTURE_MAX_ANISOTROPY_EXT 0x84FE
struct vec2_t { int32_t x, y; };
struct coltype { uint8_t r, g, b, a; };
static_assert(sizeof(coltype) == 4, "byte-packed color");
#define Xmalloc std::malloc
#define Xfree std::free
#define LOG_F(level, ...) do { std::fprintf(stderr, __VA_ARGS__); std::exit(1); } while (0)
#define buildgl_bindTexture glBindTexture
static GLuint polymost1BasicShaderProgramID = 1, palswapTextureID = 0;
static uint8_t *palookup[256] = {};
static int numshades = 32;
#define __EMSCRIPTEN__ 1
#include "production.inc"

static unsigned checks;
static void require(bool ok, const char *message) {
    if (!ok) { std::fprintf(stderr, "%s\n", message); std::exit(1); }
}
static void noError(const char *stage) {
    GLenum error = glGetError();
    if (error) { std::fprintf(stderr, "%s: GL error 0x%x\n", stage, error); std::exit(1); }
}
static void readback(GLuint texture, int level, int x, int y, int width, int height,
                     const std::vector<coltype>& expected) {
    glBindTexture(GL_TEXTURE_2D, texture);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_BASE_LEVEL, level);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAX_LEVEL, level);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, texture, level);
    require(glCheckFramebufferStatus(GL_FRAMEBUFFER) == GL_FRAMEBUFFER_COMPLETE, "incomplete readback framebuffer");
    std::vector<coltype> actual(width * height);
    glReadPixels(x, y, width, height, GL_RGBA, GL_UNSIGNED_BYTE, actual.data());
    noError("pixel readback");
    require(actual.size() == expected.size() && !std::memcmp(actual.data(), expected.data(), actual.size()*sizeof(coltype)),
            "pixel mismatch (channel, alpha, row order or update)");
    ++checks;
}
static GLuint newTexture() {
    GLuint texture; glGenTextures(1, &texture); glBindTexture(GL_TEXTURE_2D, texture);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    return texture;
}
int main() {
    EGLDisplay display = eglGetPlatformDisplay(EGL_PLATFORM_SURFACELESS_MESA, EGL_DEFAULT_DISPLAY, nullptr);
    require(display != EGL_NO_DISPLAY && eglInitialize(display, nullptr, nullptr), "EGL initialization failed");
    require(eglBindAPI(EGL_OPENGL_ES_API), "ES API unavailable");
    EGLint attributes[] = {EGL_SURFACE_TYPE, EGL_PBUFFER_BIT, EGL_RENDERABLE_TYPE,
        EGL_OPENGL_ES3_BIT, EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8, EGL_NONE};
    EGLConfig config; EGLint count;
    require(eglChooseConfig(display, attributes, &config, 1, &count) && count == 1, "ES3 config unavailable");
    EGLint contextAttributes[] = {EGL_CONTEXT_CLIENT_VERSION, 3, EGL_NONE};
    EGLContext context = eglCreateContext(display, config, EGL_NO_CONTEXT, contextAttributes);
    EGLint surfaceAttributes[] = {EGL_WIDTH, 4, EGL_HEIGHT, 4, EGL_NONE};
    EGLSurface surface = eglCreatePbufferSurface(display, config, surfaceAttributes);
    require(eglMakeCurrent(display, surface, surface, context), "ES3 context unavailable");
    GLuint framebuffer; glGenFramebuffers(1, &framebuffer); glBindFramebuffer(GL_FRAMEBUFFER, framebuffer);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1); glPixelStorei(GL_PACK_ALIGNMENT, 1);

    // Four mip sizes, both byte orders, both allocation flags and subimage updates.
    for (int format : {GL_RGBA, GL_BGRA}) for (int allocate : {1, 3}) {
        GLuint texture = newTexture();
        for (int level = 0; level < 4; ++level) {
            vec2_t size = {8 >> level, (4 >> level) ? (4 >> level) : 1};
            for (int update = 0; update < 2; ++update) {
                std::vector<coltype> expected(size.x * size.y), pixels(expected.size());
                for (size_t i = 0; i < expected.size(); ++i) {
                    auto& p = expected[i];
                    p = {uint8_t(13+i*5+update), uint8_t(87+i*3), uint8_t(229-i*7), uint8_t(i*31+level)};
                    pixels[i] = format == GL_BGRA ? coltype{p.b,p.g,p.r,p.a} : p;
                }
                const auto original = pixels;
                Polymost_SendTexToDriver(update ? 0 : allocate, size, format, pixels.data(), GL_RGBA8, level);
                noError("pixel upload");
                require(!std::memcmp(original.data(), pixels.data(), pixels.size()*sizeof(coltype)), "source pixels changed");
                readback(texture, level, 0, 0, size.x, size.y, expected);
            }
        }
        glDeleteTextures(1, &texture);
    }
    // Null-data allocation must not dereference a BGRA source.
    for (int format : {GL_RGBA, GL_BGRA}) {
        GLuint texture = newTexture();
        Polymost_SendTexToDriver(1, {3,2}, format, nullptr, GL_RGBA8, 0);
        noError("null pixel allocation"); ++checks;
        glDeleteTextures(1, &texture);
    }
    // GLES drivers may accept unsized RED; WebGL 2 does not. Assert the actual
    // production constant as well as exercising its allocation and row layout.
    require(indexedTextureInternalFormat == GL_R8, "WebGL indexed storage must use sized R8");
    for (int size : {8, PALSWAP_TEXTURE_SIZE, 8192}) {
        GLuint texture = newTexture();
        uploadtextureindexed(1, {}, {size,size}, 0); noError("indexed allocation");
        uint8_t pixels[] = {1, 37, 255, 19, 83, 0};
        uploadtextureindexed(0, {size-3,size-2}, {2,3}, (intptr_t)pixels); noError("indexed edge update");
        std::vector<coltype> expected;
        for (uint8_t value : pixels) expected.push_back({value,0,0,255});
        readback(texture, 0, size-3, size-2, 3, 2, expected);
        glDeleteTextures(1, &texture);
    }
    // Actual palette-swap allocation, subsequent column/row upload and border.
    std::vector<uint8_t> lookup(256*numshades);
    for (int index : {0, 15, 255}) {
        for (size_t i = 0; i < lookup.size(); ++i) lookup[i] = uint8_t(i*17+index);
        palookup[index] = lookup.data(); uploadpalswap(index); noError("palette-swap upload");
        std::vector<coltype> expected;
        for (uint8_t value : lookup) expected.push_back({value,0,0,255});
        expected.insert(expected.end(), 256, {0,0,0,255});
        readback(palswapTextureID, 0, 256*(index%8), (numshades+1)*(index/8), 256, numshades+1, expected);
    }
    std::printf("{\"checks\":%u,\"renderer\":\"%s\"}\n", checks, glGetString(GL_RENDERER));
    glDeleteTextures(1, &palswapTextureID); glDeleteFramebuffers(1, &framebuffer);
    eglMakeCurrent(display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
    eglDestroySurface(display, surface); eglDestroyContext(display, context); eglTerminate(display);
}
