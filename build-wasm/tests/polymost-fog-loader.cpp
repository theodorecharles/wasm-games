// The actual GLAD loader + actual Emscripten fog emulation, outside a browser.
#include <glad/glad.h>
#include <emscripten.h>
#include <cstdio>
#include <cstring>

static const GLubyte *version(GLenum name) {
    return reinterpret_cast<const GLubyte *>(name == GL_VERSION ? "2.0 fixture" : "");
}
static void *lookup(const char *name) {
    return std::strcmp(name, "glGetString") ? nullptr : reinterpret_cast<void *>(version);
}
int main() {
    if (!gladLoadGLLoader(lookup)) return 2;
    // A missing bridge must fail before attempting an indirect call through it.
    if (!glad_glFogf || !glad_glFogfv || !glad_glFogi || !glad_glFogiv) {
        std::puts("{\"linkedFogFunctions\":false}");
        return 1;
    }
    glFogf(GL_FOG_START, 16.25f);
    glFogf(GL_FOG_END, 400.f);
    glFogf(GL_FOG_DENSITY, 0.125f);
    glFogi(GL_FOG_MODE, GL_LINEAR);
    GLfloat color[] = {0.25f, 0.5f, 0.75f, 1.f};
    glFogfv(GL_FOG_COLOR, color);
    if (!EM_ASM_INT({
        return GLEmulation.fogStart === 16.25 && GLEmulation.fogEnd === 400 &&
          GLEmulation.fogDensity === 0.125 && GLEmulation.fogMode === 0x2601 &&
          Array.from(GLEmulation.fogColor).join(',') === '0.25,0.5,0.75,1';
    })) return 3;
    GLint end[] = {750}; glFogiv(GL_FOG_END, end);
    glFogi(GL_FOG_MODE, GL_EXP2);
    if (!EM_ASM_INT({ return GLEmulation.fogEnd === 750 && GLEmulation.fogMode === 0x801; })) return 3;
    std::puts("{\"linkedFogFunctions\":true,\"fogStateChecks\":8}");
}
