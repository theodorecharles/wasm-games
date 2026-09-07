// Real GLES compiler/linker check for the production shader pair, no game data.
#include <EGL/egl.h>
#include <EGL/eglext.h>
#include <GLES3/gl3.h>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <string>

static GLuint compile(GLenum type, const char *file) {
    std::ifstream input(file);
    if (!input) std::exit(2);
    std::ostringstream data; data << input.rdbuf();
    std::string text = data.str(); const char *source = text.c_str();
    GLuint shader = glCreateShader(type);
    glShaderSource(shader, 1, &source, nullptr);
    glCompileShader(shader);
    GLint ok; glGetShaderiv(shader, GL_COMPILE_STATUS, &ok);
    if (!ok) {
        char log[8192]; glGetShaderInfoLog(shader, sizeof(log), nullptr, log);
        std::fprintf(stderr, "%s: %s\n", file, log);
        std::exit(1);
    }
    return shader;
}

int main(int argc, char **argv) {
    if (argc != 3) return 2;
    EGLDisplay display = eglGetPlatformDisplay(EGL_PLATFORM_SURFACELESS_MESA, EGL_DEFAULT_DISPLAY, nullptr);
    if (display == EGL_NO_DISPLAY || !eglInitialize(display, nullptr, nullptr)) return 2;
    eglBindAPI(EGL_OPENGL_ES_API);
    EGLint attributes[] = {EGL_SURFACE_TYPE, EGL_PBUFFER_BIT, EGL_RENDERABLE_TYPE,
        EGL_OPENGL_ES3_BIT, EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8, EGL_NONE};
    EGLConfig config; EGLint count;
    if (!eglChooseConfig(display, attributes, &config, 1, &count) || count != 1) return 2;
    EGLint contextAttributes[] = {EGL_CONTEXT_CLIENT_VERSION, 3, EGL_NONE};
    EGLContext context = eglCreateContext(display, config, EGL_NO_CONTEXT, contextAttributes);
    EGLint surfaceAttributes[] = {EGL_WIDTH, 4, EGL_HEIGHT, 4, EGL_NONE};
    EGLSurface surface = eglCreatePbufferSurface(display, config, surfaceAttributes);
    if (!eglMakeCurrent(display, surface, surface, context)) return 2;
    GLuint vertex = compile(GL_VERTEX_SHADER, argv[1]), fragment = compile(GL_FRAGMENT_SHADER, argv[2]);
    GLuint program = glCreateProgram();
    glAttachShader(program, vertex); glAttachShader(program, fragment); glLinkProgram(program);
    GLint ok; glGetProgramiv(program, GL_LINK_STATUS, &ok);
    if (!ok) {
        char log[8192]; glGetProgramInfoLog(program, sizeof(log), nullptr, log);
        std::fprintf(stderr, "link: %s\n", log);
        return 1;
    }
    GLint uniforms; glGetProgramiv(program, GL_ACTIVE_UNIFORMS, &uniforms);
    std::printf("{\"linked\":true,\"uniforms\":%d,\"renderer\":\"%s\"}\n", uniforms, glGetString(GL_RENDERER));
    glDeleteProgram(program); glDeleteShader(vertex); glDeleteShader(fragment);
    eglMakeCurrent(display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
    eglDestroySurface(display, surface); eglDestroyContext(display, context); eglTerminate(display);
}
