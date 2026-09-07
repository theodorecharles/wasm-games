// Desktop GL is the reference for the engine's requested border semantics.
// Candidate samplers use only operations available to WebGL 2. This is an
// offscreen GPU comparison, not a browser or campaign acceptance test.
#define GL_GLEXT_PROTOTYPES 1
#include <EGL/egl.h>
#include <GL/gl.h>
#include <GL/glext.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum { SIDE = 11, BYTES = SIDE * SIDE * 4 };
static float requested_anisotropy = 1.0f;

static void check_anisotropy(void) {
    if (requested_anisotropy <= 1.0f) return;
    GLfloat maximum = 0;
    glGetFloatv(GL_MAX_TEXTURE_MAX_ANISOTROPY_EXT, &maximum);
    if (glGetError() != GL_NO_ERROR || maximum < requested_anisotropy) {
        fprintf(stderr, "requested anisotropy %.1f exceeds driver support %.1f\n", requested_anisotropy, maximum);
        exit(2);
    }
}

static void fail(const char *message) {
    fprintf(stderr, "%s (GL=%x, EGL=%x)\n", message, glGetError(), eglGetError());
    exit(2);
}

static char *read_source(const char *filename) {
    FILE *input = fopen(filename, "rb");
    if (!input || fseek(input, 0, SEEK_END)) fail("GLSL input");
    long size = ftell(input);
    if (size < 0 || fseek(input, 0, SEEK_SET)) fail("GLSL input size");
    char *source = malloc((size_t)size + 1);
    if (!source || fread(source, 1, (size_t)size, input) != (size_t)size) fail("GLSL input read");
    source[size] = 0; fclose(input);
    return source;
}

static GLuint shader(GLenum type, const char *source) {
    GLuint value = glCreateShader(type);
    glShaderSource(value, 1, &source, NULL);
    glCompileShader(value);
    GLint ok = 0;
    glGetShaderiv(value, GL_COMPILE_STATUS, &ok);
    if (!ok) {
        char log[8192];
        glGetShaderInfoLog(value, sizeof(log), NULL, log);
        fprintf(stderr, "%s\n", log);
        fail("shader compilation");
    }
    return value;
}

static GLuint program(const char *helper, int es, const char *converted_fragment) {
    const char *version = es ? "#version 300 es\nprecision highp float;\nprecision highp int;\n" : "#version 330 core\n";
    const char *vertex =
        "void main() {\n"
        " vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);\n"
        " gl_Position = vec4(p, 0.0, 1.0);\n"
        "}\n";
    const char *fragment =
        "uniform sampler2D image;\n"
        "uniform vec2 levelSize;\n"
        "uniform float lod;\n"
        "uniform int method;\n"
        "uniform int filterMode;\n"
        "uniform int lastLevel;\n"
        "uniform int gradientMode;\n"
        "uniform vec4 gradients;\n"
        "uniform float maxAnisotropy;\n"
        "uniform vec4 border;\n"
        "out vec4 color;\n"
        // Independent oracle: same footprint model, but every tap uses actual
        // desktop border filtering. It never calls the candidate's texel code.
        "vec4 nativeKernel(vec2 uv, vec2 gx, vec2 gy) {\n"
        " vec2 dims = vec2(textureSize(image,0));\n"
        " float xLength = sqrt(dot(gx*dims,gx*dims));\n"
        " float yLength = sqrt(dot(gy*dims,gy*dims));\n"
        " float widest = max(xLength,yLength);\n"
        " float level = log2(max(widest,0.000001));\n"
        " if (filterMode != 2 || widest <= 1.0 || maxAnisotropy <= 1.0) return textureLod(image,uv,level);\n"
        " float n = min(ceil(widest/max(min(xLength,yLength),0.000001)),maxAnisotropy);\n"
        " vec2 direction = xLength > yLength ? gx : gy;\n"
        " level = log2(widest/n);\n"
        " vec4 value = vec4(0.0);\n"
        " for (int i=1; i<=16; ++i) {\n"
        "   if (float(i)>n) break;\n"
        "   value += textureLod(image,uv+direction*(float(i)/(n+1.0)-0.5),level);\n"
        " }\n"
        " return value/n;\n"
        "}\n"
        "float axis(int i, float size) {\n"
        " if (i == 0) return -1.0;\n"
        " if (i == 1) return -0.5 / size;\n"
        " if (i == 2) return 0.0;\n"
        " if (i == 3) return 0.25 / size;\n"
        " if (i == 4) return 0.5 / size;\n"
        " if (i == 5) return 0.5;\n"
        " if (i == 6) return 1.0 - 0.25 / size;\n"
        " if (i == 7) return 1.0;\n"
        " if (i == 8) return 1.0 + 0.25 / size;\n"
        " if (i == 9) return 1.0 + 0.5 / size;\n"
        " return 2.0;\n"
        "}\n"
        "void main() {\n"
        " vec2 uv = vec2(axis(int(gl_FragCoord.x), levelSize.x), axis(int(gl_FragCoord.y), levelSize.y));\n"
        " vec4 projected = vec4(uv,0.0,0.75 + gl_FragCoord.x * 0.04);\n"
        " if (gradientMode == 3) uv = projected.xy / projected.w;\n"
        " vec4 sampled = textureLod(image, uv, lod);\n"
        " if (gradientMode == 1) sampled = textureGrad(image, uv, gradients.xy, gradients.zw);\n"
        " if (gradientMode == 2) sampled = texture(image, uv);\n"
        " if (gradientMode == 3) sampled = textureProj(image, projected);\n"
        " if (method == 3 && (any(lessThan(uv,vec2(0.0))) || any(greaterThanEqual(uv,vec2(1.0))))) sampled = border;\n"
        " if (method == 4) {\n"
        "   if (gradientMode >= 2) sampled = Q4BorderGradient(image, uv, border, filterMode, dFdx(uv), dFdy(uv), lastLevel);\n"
        "   else if (gradientMode == 1) sampled = Q4BorderGradient(image, uv, border, filterMode, gradients.xy, gradients.zw, lastLevel);\n"
        "   else sampled = Q4BorderIsotropic(image, uv, border, filterMode, lod, lastLevel);\n"
        " }\n"
        " if (method == 5) {\n"
        "   if (gradientMode >= 2) sampled = Q4BorderAnisotropic(image,uv,border,filterMode,dFdx(uv),dFdy(uv),lastLevel,maxAnisotropy);\n"
        "   else if (gradientMode == 1) sampled = Q4BorderAnisotropic(image,uv,border,filterMode,gradients.xy,gradients.zw,lastLevel,maxAnisotropy);\n"
        "   else sampled = Q4BorderIsotropic(image,uv,border,filterMode,lod,lastLevel);\n"
        " }\n"
        " if (method == 6) {\n"
        "   if (gradientMode >= 2) sampled = nativeKernel(uv,dFdx(uv),dFdy(uv));\n"
        "   else if (gradientMode == 1) sampled = nativeKernel(uv,gradients.xy,gradients.zw);\n"
        " }\n"
        " color = sampled;\n"
        "}\n";
    // Same helper and equations in desktop GLSL and WebGL 2's GLSL ES dialect.
    char *joined = malloc(strlen(version) + strlen(fragment) + strlen(helper) + 2);
    char *joined_vertex = malloc(strlen(version) + strlen(vertex) + 1);
    if (!joined || !joined_vertex) fail("shader source allocation");
    strcpy(joined, version); strcat(joined, helper); strcat(joined, "\n"); strcat(joined, fragment);
    strcpy(joined_vertex, version); strcat(joined_vertex, vertex);
    GLuint vs = shader(GL_VERTEX_SHADER, joined_vertex), fs = shader(GL_FRAGMENT_SHADER, converted_fragment ? converted_fragment : joined);
    free(joined); free(joined_vertex);
    GLuint result = glCreateProgram();
    glAttachShader(result, vs); glAttachShader(result, fs); glLinkProgram(result);
    GLint ok = 0;
    glGetProgramiv(result, GL_LINK_STATUS, &ok);
    if (!ok) fail("program linking");
    glDeleteShader(vs); glDeleteShader(fs);
    return result;
}

static int mip_size(int dimension, int level) {
    const int size = dimension >> level;
    return size > 0 ? size : 1;
}

static GLuint texture(int width, int height, int *last_level) {
    GLuint result;
    glGenTextures(1, &result); glBindTexture(GL_TEXTURE_2D, result);
    *last_level = 0;
    for (int size = width > height ? width : height; size > 1; size >>= 1) ++*last_level;
    for (int level = 0; level <= *last_level; ++level) {
        int w = mip_size(width, level), h = mip_size(height, level);
        GLubyte *pixels = malloc((size_t)w * h * 4);
        if (!pixels) fail("texel allocation");
        for (int y = 0; y < h; ++y) for (int x = 0; x < w; ++x) {
            int p = (y * w + x) * 4;
            // Nonzero edge data distinguishes true border sampling from edge
            // substitution; distinct mips catch incorrect LOD blending too.
            pixels[p] = 40 + (x * 29 + level * 23) % 170;
            pixels[p+1] = 50 + (y * 31 + level * 19) % 150;
            pixels[p+2] = 60 + ((x + y) * 17 + level * 11) % 160;
            pixels[p+3] = 80 + (x * 13 + y * 7 + level * 37) % 170;
        }
        glTexImage2D(GL_TEXTURE_2D, level, GL_RGBA8, w, h, 0, GL_RGBA, GL_UNSIGNED_BYTE, pixels);
        free(pixels);
    }
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_BASE_LEVEL, 0);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAX_LEVEL, *last_level);
    return result;
}

static void render(GLuint p, int method, int filter, int width, int height,
                   int last_level, float lod, int alpha, const float *gradient, int gradient_mode, GLubyte *pixels) {
    const GLint modes[] = {GL_CLAMP_TO_BORDER, GL_REPEAT, GL_CLAMP_TO_EDGE, GL_CLAMP_TO_EDGE, GL_CLAMP_TO_EDGE, GL_CLAMP_TO_EDGE, GL_CLAMP_TO_BORDER};
    const GLint filters[] = {GL_NEAREST, GL_LINEAR, GL_LINEAR_MIPMAP_LINEAR};
    const GLfloat border[] = {0, 0, 0, alpha ? 1.0f : 0.0f};
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, modes[method]);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, modes[method]);
    if (method != 4 && method != 5) glTexParameterfv(GL_TEXTURE_2D, GL_TEXTURE_BORDER_COLOR, border);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, filters[filter]);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, filter ? GL_LINEAR : GL_NEAREST);
    if (requested_anisotropy > 1.0f) glTexParameterf(GL_TEXTURE_2D,
        GL_TEXTURE_MAX_ANISOTROPY_EXT, filter == 2 && method != 6 ? requested_anisotropy : 1.0f);
    glUniform1f(glGetUniformLocation(p, "maxAnisotropy"), requested_anisotropy);
    glUniform1i(glGetUniformLocation(p, "method"), method);
    glUniform1i(glGetUniformLocation(p, "filterMode"), filter);
    glUniform1i(glGetUniformLocation(p, "lastLevel"), last_level);
    glUniform1i(glGetUniformLocation(p, "gradientMode"), gradient_mode);
    if (gradient) glUniform4f(glGetUniformLocation(p, "gradients"),
        gradient[0] / width, gradient[1] / height, gradient[2] / width, gradient[3] / height);
    glUniform1f(glGetUniformLocation(p, "lod"), lod);
    glUniform4fv(glGetUniformLocation(p, "border"), 1, border);
    // The transformed-source GLES pass gets actual per-sampler parameters;
    // the direct helper/native-reference programs optimize these uniforms out.
    glUniform4f(glGetUniformLocation(p, "q4bsInfo_image"), 1, filter, last_level, requested_anisotropy);
    glUniform4fv(glGetUniformLocation(p, "q4bsColor_image"), 1, border);
    int level = filter == 2 ? (int)floorf(lod) : 0;
    if (gradient && filter == 2) {
        float dx2 = gradient[0] * gradient[0] + gradient[1] * gradient[1];
        float dy2 = gradient[2] * gradient[2] + gradient[3] * gradient[3];
        level = (int)floorf(0.5f * log2f(fmaxf(fmaxf(dx2, dy2), 0.000000000001f)));
    }
    if (level < 0) level = 0;
    if (level > last_level) level = last_level;
    glUniform2f(glGetUniformLocation(p, "levelSize"), mip_size(width, level), mip_size(height, level));
    glDrawArrays(GL_TRIANGLES, 0, 3);
    glReadPixels(0, 0, SIDE, SIDE, GL_RGBA, GL_UNSIGNED_BYTE, pixels);
    if (glGetError() != GL_NO_ERROR) fail("sampling comparison");
}

int main(int argc, char **argv) {
    if (argc < 2 || argc > 4) fail("expected GLSL prototype path, optional anisotropy and optional converted fragment");
    if (argc >= 3) requested_anisotropy = strtof(argv[2], NULL);
    if (!isfinite(requested_anisotropy) || requested_anisotropy < 1.0f || requested_anisotropy > 16.0f || requested_anisotropy != floorf(requested_anisotropy)) fail("invalid engine anisotropy");
    char *helper = read_source(argv[1]);
    char *converted_fragment = argc == 4 ? read_source(argv[3]) : NULL;
    EGLDisplay display = eglGetDisplay(EGL_DEFAULT_DISPLAY);
    if (display == EGL_NO_DISPLAY || !eglInitialize(display, NULL, NULL) || !eglBindAPI(EGL_OPENGL_API)) fail("EGL init");
    const EGLint config_attrs[] = {EGL_SURFACE_TYPE, EGL_PBUFFER_BIT, EGL_RENDERABLE_TYPE, EGL_OPENGL_BIT,
        EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8, EGL_ALPHA_SIZE, 8, EGL_NONE};
    EGLConfig config;
    EGLint count = 0;
    if (!eglChooseConfig(display, config_attrs, &config, 1, &count) || count != 1) fail("EGL config");
    const EGLint surface_attrs[] = {EGL_WIDTH, SIDE, EGL_HEIGHT, SIDE, EGL_NONE};
    EGLSurface surface = eglCreatePbufferSurface(display, config, surface_attrs);
    EGLContext context = eglCreateContext(display, config, EGL_NO_CONTEXT, NULL);
    if (surface == EGL_NO_SURFACE || context == EGL_NO_CONTEXT || !eglMakeCurrent(display, surface, surface, context)) fail("GL context");
    check_anisotropy();
    GLuint p = program(helper, 0, NULL), vao;
    glUseProgram(p); glUniform1i(glGetUniformLocation(p, "image"), 0);
    glGenVertexArrays(1, &vao); glBindVertexArray(vao);
    glViewport(0, 0, SIDE, SIDE);
    glDisable(GL_BLEND); glDisable(GL_DITHER); glDisable(GL_DEPTH_TEST); glDisable(GL_CULL_FACE);
    const int dimensions[][2] = {{8,8}, {16,4}, {7,5}, {1,8}};
    const char *methods[] = {"native-border", "rejected-wrap-default-repeat", "edge-substitution", "hard-outside-cutoff", "isotropic-sampling-prototype", "anisotropic-sampling-prototype"};
    const char *filters[] = {"nearest", "linear", "trilinear"};
    const float gradients[][4] = {{1,0,0,1}, {2,0,0,2}, {2,2,-2,2}, {1,4,-4,1}, {8,0,0,0.5f}, {0,0,0,0}};
    GLubyte references[128][BYTES];
    GLubyte kernel_references[128][BYTES];
    int reference_count = 0;
    int rows = 0;
    printf("{\"driver\":\"%s\",\"version\":\"%s\",\"anisotropy\":%.1f,\"samplesPerCase\":%d,\"cases\":[", glGetString(GL_RENDERER), glGetString(GL_VERSION), requested_anisotropy, SIDE * SIDE);
    for (int shape = 0; shape < 4; ++shape) {
        int width = dimensions[shape][0], height = dimensions[shape][1], last_level;
        GLuint t = texture(width, height, &last_level);
        const float lods[] = {0, 0.5f, 1, last_level - 0.5f, last_level, last_level + 2.0f};
        for (int alpha = 0; alpha < 2; ++alpha) for (int filter = 0; filter < 3; ++filter)
        for (int l = 0; l < (filter == 2 ? 14 : 1); ++l) {
            const float *gradient = l >= 6 && l < 12 ? gradients[l - 6] : NULL;
            int gradient_mode = l < 6 ? 0 : l < 12 ? 1 : l - 10;
            float lod = l < 6 ? lods[l] : 0;
            GLubyte reference[BYTES], kernel_reference[BYTES], candidate[BYTES];
            render(p, 0, filter, width, height, last_level, lod, alpha, gradient, gradient_mode, reference);
            render(p, 6, filter, width, height, last_level, lod, alpha, gradient, gradient_mode, kernel_reference);
            if (reference_count >= 128) fail("reference case overflow");
            memcpy(kernel_references[reference_count], kernel_reference, BYTES);
            memcpy(references[reference_count++], reference, BYTES);
            for (int method = 1; method < 6; ++method) {
                render(p, method, filter, width, height, last_level, lod, alpha, gradient, gradient_mode, candidate);
                int changed = 0, maximum = 0, kernel_changed = 0, kernel_maximum = 0;
                for (int i = 0; i < BYTES; ++i) {
                    int delta = abs((int)reference[i] - candidate[i]);
                    if (delta > 1) ++changed;
                    if (delta > maximum) maximum = delta;
                    delta = abs((int)kernel_reference[i] - candidate[i]);
                    if (delta > 1) ++kernel_changed;
                    if (delta > kernel_maximum) kernel_maximum = delta;
                }
                const int center = (5 * SIDE + 5) * 4;
                const int edge = (5 * SIDE + 2) * 4;
                printf("%s{\"method\":\"%s\",\"size\":[%d,%d],\"borderAlpha\":%d,\"filter\":\"%s\",\"lod\":%.1f,\"gradientCase\":%d,\"gradientMode\":%d,\"differentChannels\":%d,\"maximumChannelDifference\":%d,\"kernelDifferentChannels\":%d,\"kernelMaximumChannelDifference\":%d,\"referenceCenter\":[%u,%u,%u,%u],\"candidateCenter\":[%u,%u,%u,%u],\"referenceEdge\":[%u,%u,%u,%u],\"candidateEdge\":[%u,%u,%u,%u]}",
                    rows++ ? "," : "", methods[method], width, height, alpha, filters[filter], lod, gradient ? l - 6 : -1, gradient_mode, changed, maximum, kernel_changed, kernel_maximum,
                    reference[center], reference[center+1], reference[center+2], reference[center+3],
                    candidate[center], candidate[center+1], candidate[center+2], candidate[center+3],
                    reference[edge], reference[edge+1], reference[edge+2], reference[edge+3],
                    candidate[edge], candidate[edge+1], candidate[edge+2], candidate[edge+3]);
            }
        }
        glDeleteTextures(1, &t);
    }
    printf("]");
    glDeleteVertexArrays(1, &vao); glDeleteProgram(p);
    eglMakeCurrent(display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
    eglDestroyContext(display, context); eglDestroySurface(display, surface);

    // Replay the candidate in an actual GLES 3 context and compare every
    // channel against the saved desktop-GL border result, not another helper.
    if (!eglBindAPI(EGL_OPENGL_ES_API)) fail("ES API bind");
    const EGLint es_config_attrs[] = {EGL_SURFACE_TYPE, EGL_PBUFFER_BIT, EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT,
        EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8, EGL_ALPHA_SIZE, 8, EGL_NONE};
    if (!eglChooseConfig(display, es_config_attrs, &config, 1, &count) || count != 1) fail("ES config");
    const EGLint es_context_attrs[] = {EGL_CONTEXT_CLIENT_VERSION, 3, EGL_NONE};
    surface = eglCreatePbufferSurface(display, config, surface_attrs);
    context = eglCreateContext(display, config, EGL_NO_CONTEXT, es_context_attrs);
    if (surface == EGL_NO_SURFACE || context == EGL_NO_CONTEXT || !eglMakeCurrent(display, surface, surface, context)) fail("ES context");
    check_anisotropy();
    p = program(helper, 1, converted_fragment); free(helper); free(converted_fragment);
    glUseProgram(p); glUniform1i(glGetUniformLocation(p, "image"), 0);
    glGenVertexArrays(1, &vao); glBindVertexArray(vao);
    glViewport(0, 0, SIDE, SIDE);
    glDisable(GL_BLEND); glDisable(GL_DITHER); glDisable(GL_DEPTH_TEST); glDisable(GL_CULL_FACE);
    printf(",\"esDriver\":\"%s\",\"esVersion\":\"%s\",\"esCases\":[", glGetString(GL_RENDERER), glGetString(GL_VERSION));
    int index = 0;
    for (int shape = 0; shape < 4; ++shape) {
        int width = dimensions[shape][0], height = dimensions[shape][1], last_level;
        GLuint t = texture(width, height, &last_level);
        const float lods[] = {0, 0.5f, 1, last_level - 0.5f, last_level, last_level + 2.0f};
        for (int alpha = 0; alpha < 2; ++alpha) for (int filter = 0; filter < 3; ++filter)
        for (int l = 0; l < (filter == 2 ? 14 : 1); ++l) {
            const float *gradient = l >= 6 && l < 12 ? gradients[l - 6] : NULL;
            int gradient_mode = l < 6 ? 0 : l < 12 ? 1 : l - 10;
            float lod = l < 6 ? lods[l] : 0;
            GLubyte candidate[BYTES];
            render(p, 5, filter, width, height, last_level, lod, alpha, gradient, gradient_mode, candidate);
            int maximum = 0, changed = 0, kernel_maximum = 0, kernel_changed = 0;
            for (int channel = 0; channel < BYTES; ++channel) {
                int delta = abs((int)candidate[channel] - references[index][channel]);
                if (delta > maximum) maximum = delta;
                if (delta > 1) ++changed;
                delta = abs((int)candidate[channel] - kernel_references[index][channel]);
                if (delta > kernel_maximum) kernel_maximum = delta;
                if (delta > 1) ++kernel_changed;
            }
            printf("%s{\"caseIndex\":%d,\"differentChannels\":%d,\"maximumChannelDifference\":%d,\"kernelDifferentChannels\":%d,\"kernelMaximumChannelDifference\":%d}",
                index ? "," : "", index, changed, maximum, kernel_changed, kernel_maximum);
            ++index;
        }
        glDeleteTextures(1, &t);
    }
    printf("]}\n");
    if (index != reference_count) fail("ES reference count");
    glDeleteVertexArrays(1, &vao); glDeleteProgram(p);
    eglMakeCurrent(display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
    eglDestroyContext(display, context); eglDestroySurface(display, surface); eglTerminate(display);
    return 0;
}
