#include <EGL/egl.h>
#include <GLES3/gl3.h>
#include <stdio.h>
#include <stdlib.h>

// Reuse the existing real-driver shader compiler and file reader. The renamed
// entry point is never called; this probe needs a depth-bearing surface.
#define main q4_unused_shader_link_main
#include "glsl-es-link.c"
#undef main

enum { SIZE = 64 };
static int read_width = SIZE, read_height = SIZE;

static GLuint load_program(const char *vertex_path, const char *fragment_path) {
    char *vertex = read_file(vertex_path), *fragment = read_file(fragment_path);
    if (!vertex || !fragment) exit(7);
    GLuint vs = compile_shader(GL_VERTEX_SHADER, vertex, vertex_path);
    GLuint fs = compile_shader(GL_FRAGMENT_SHADER, fragment, fragment_path);
    free(vertex); free(fragment);
    if (!vs || !fs) exit(8);
    GLuint program = glCreateProgram();
    glAttachShader(program, vs); glAttachShader(program, fs);
    glBindAttribLocation(program, 0, "a_position");
    glBindAttribLocation(program, 2, "a_color");
    glLinkProgram(program);
    GLint linked = GL_FALSE;
    glGetProgramiv(program, GL_LINK_STATUS, &linked);
    if (!linked) {
        char log[8192] = {0};
        glGetProgramInfoLog(program, sizeof(log), NULL, log);
        fprintf(stderr, "program link failed: %s\n", log);
        exit(9);
    }
    glDeleteShader(vs); glDeleteShader(fs);
    return program;
}

static void bind_matrices(GLuint program, const GLfloat *model, const GLfloat *projection) {
    glUseProgram(program);
    glUniformMatrix4fv(glGetUniformLocation(program, "u_modelView"), 1, GL_FALSE, model);
    glUniformMatrix4fv(glGetUniformLocation(program, "u_projection"), 1, GL_FALSE, projection);
    glUniformMatrix4fv(glGetUniformLocation(program, "uModelViewMatrix"), 1, GL_FALSE, model);
    glUniformMatrix4fv(glGetUniformLocation(program, "uProjectionMatrix"), 1, GL_FALSE, projection);
}

static int colored_pixels(void) {
    GLubyte *pixels = malloc((size_t)read_width * read_height * 4);
    if (!pixels) exit(11);
    glReadPixels(0, 0, read_width, read_height, GL_RGBA, GL_UNSIGNED_BYTE, pixels);
    int count = 0;
    for (int i = 0; i < read_width * read_height; i++) {
        if (pixels[i * 4] || pixels[i * 4 + 1] || pixels[i * 4 + 2]) count++;
    }
    free(pixels);
    return count;
}

int main(int argc, char **argv) {
    if (argc != 5 && argc != 6) {
        fprintf(stderr, "usage: %s depth.vert depth.frag interaction.vert interaction.frag [capture.bin]\n", argv[0]);
        return 2;
    }
    FILE *capture = argc == 6 ? fopen(argv[5], "rb") : NULL;
    unsigned capture_count = 0;
    if (argc == 6) {
        unsigned header[3];
        if (!capture || fread(header, sizeof(header), 1, capture) != 1) return 12;
        capture_count = header[0]; read_width = (int)header[1]; read_height = (int)header[2];
        if (capture_count > 128 || read_width < SIZE || read_height < SIZE ||
            read_width > 4096 || read_height > 4096) return 13;
    }
    EGLDisplay display = eglGetDisplay(EGL_DEFAULT_DISPLAY);
    if (display == EGL_NO_DISPLAY || !eglInitialize(display, NULL, NULL) || !eglBindAPI(EGL_OPENGL_ES_API)) return 3;
    const EGLint attributes[] = { EGL_SURFACE_TYPE,EGL_PBUFFER_BIT, EGL_RENDERABLE_TYPE,EGL_OPENGL_ES3_BIT,
        EGL_RED_SIZE,8, EGL_GREEN_SIZE,8, EGL_BLUE_SIZE,8, EGL_ALPHA_SIZE,8, EGL_DEPTH_SIZE,24, EGL_NONE };
    EGLConfig config;
    EGLint count = 0;
    if (!eglChooseConfig(display, attributes, &config, 1, &count) || count != 1) return 4;
    const EGLint surface_attributes[] = { EGL_WIDTH,read_width, EGL_HEIGHT,read_height, EGL_NONE };
    const EGLint context_attributes[] = { EGL_CONTEXT_CLIENT_VERSION,3, EGL_NONE };
    EGLSurface surface = eglCreatePbufferSurface(display, config, surface_attributes);
    EGLContext context = eglCreateContext(display, config, EGL_NO_CONTEXT, context_attributes);
    if (surface == EGL_NO_SURFACE || context == EGL_NO_CONTEXT || !eglMakeCurrent(display, surface, surface, context)) return 5;
    GLuint depth = load_program(argv[1], argv[2]);
    GLuint interaction = load_program(argv[3], argv[4]);

    GLuint vao, buffer, textures[2], ambient_texture;
    glGenVertexArrays(1, &vao); glBindVertexArray(vao);
    glGenBuffers(1, &buffer); glBindBuffer(GL_ARRAY_BUFFER, buffer);
    glEnableVertexAttribArray(0);
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 0, NULL);
    glVertexAttrib4f(2, 1, 1, 1, 1);
    glVertexAttrib4f(8, 0, 0, 0, 1);
    glVertexAttrib4f(9, 1, 0, 0, 0);
    glVertexAttrib4f(10, 0, 1, 0, 0);
    glVertexAttrib4f(11, 0, 0, 1, 0);
    const GLubyte texels[2][4] = {{128,128,255,128}, {255,255,255,255}};
    glGenTextures(2, textures);
    for (int unit = 0; unit < 2; unit++) {
        glActiveTexture(GL_TEXTURE0 + unit);
        glBindTexture(GL_TEXTURE_2D, textures[unit]);
        glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, 1, 1, 0, GL_RGBA, GL_UNSIGNED_BYTE, texels[unit]);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    }
    glGenTextures(1, &ambient_texture);
    glActiveTexture(GL_TEXTURE2); glBindTexture(GL_TEXTURE_CUBE_MAP, ambient_texture);
    for (int face = 0; face < 6; face++) {
        glTexImage2D(GL_TEXTURE_CUBE_MAP_POSITIVE_X + face, 0, GL_RGBA8, 1, 1, 0, GL_RGBA, GL_UNSIGNED_BYTE, texels[0]);
    }
    glTexParameteri(GL_TEXTURE_CUBE_MAP, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_CUBE_MAP, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glUseProgram(interaction);
    glUniform1i(glGetUniformLocation(interaction, "uAmbientNormalMap"), 2);
    glUniform1f(glGetUniformLocation(interaction, "uStockInteraction"), 1);
    glUniform1f(glGetUniformLocation(interaction, "uAmbientLight"), 0);
    glUniform1f(glGetUniformLocation(interaction, "uMaterialNormalScale"), 1);
    glUniform1f(glGetUniformLocation(interaction, "uMaterialSpecularBoost"), 1);
    glUniform1i(glGetUniformLocation(interaction, "uBumpMap"), 0);
    const char *white_samplers[] = {"uDiffuseMap", "uSpecularMap", "uLightFalloffMap", "uLightProjectionMap"};
    for (int i = 0; i < 4; i++) glUniform1i(glGetUniformLocation(interaction, white_samplers[i]), 1);
    glUniform4f(glGetUniformLocation(interaction, "uDiffuseColor"), 1,1,1,1);
    glUniform4f(glGetUniformLocation(interaction, "uSpecularColor"), 0,0,0,0);
    glUniform4f(glGetUniformLocation(interaction, "uLightProjectionQ"), 0,0,0,1);
    glUniform2f(glGetUniformLocation(interaction, "uVertexColorParams"), 0,1);
    const GLfloat projection[16] = {1.7f,0,0,0, 0,1.7f,0,0,
        0,0,-10001.0f/9999.0f,-1, 0,0,-20000.0f/9999.0f,0};
    const GLfloat origins[] = {0.0f, 128.125f, 1024.125f, 8192.125f, 32768.125f};
    const GLfloat distances[] = {16.25f, 64.25f, 256.25f, 1024.25f};
    glViewport(0, 0, SIZE, SIZE);
    glEnable(GL_DEPTH_TEST); glDisable(GL_BLEND); glDisable(GL_CULL_FACE);
    glClearColor(0,0,0,0); glClearDepthf(1);
    printf("{\"driver\":\"%s\",\"depthBits\":", glGetString(GL_RENDERER));
    GLint depth_bits = 0;
    glGetIntegerv(GL_DEPTH_BITS, &depth_bits);
    printf("%d,\"cases\":[", depth_bits);
    for (int origin = 0; origin < 5; origin++) for (int range = 0; range < 4; range++) {
        GLfloat z = origins[origin], distance = distances[range];
        GLfloat x = z * 0.37f, y = -z * 0.19f, extent = distance * 0.4f;
        const GLfloat model[16] = {1,0,0,0, 0,1,0,0, 0,0,1,0, -x,-y,-z,1};
        const GLfloat vertices[] = {x-extent,y-extent,z-distance, x+extent,y-extent,z-distance,
            x,y+extent,z-distance};
        glBufferData(GL_ARRAY_BUFFER, sizeof(vertices), vertices, GL_STREAM_DRAW);
        glDepthMask(GL_TRUE); glColorMask(GL_FALSE,GL_FALSE,GL_FALSE,GL_FALSE);
        glClear(GL_DEPTH_BUFFER_BIT);
        bind_matrices(depth, model, projection);
        glDepthFunc(GL_ALWAYS); glDrawArrays(GL_TRIANGLES, 0, 3);

        bind_matrices(interaction, model, projection);
        glUniform4f(glGetUniformLocation(interaction, "uLocalLightOrigin"), x,y,z,1);
        glUniform4f(glGetUniformLocation(interaction, "uLocalViewOrigin"), x,y,z,1);
        glColorMask(GL_TRUE,GL_TRUE,GL_TRUE,GL_TRUE); glDepthMask(GL_FALSE);
        glClear(GL_COLOR_BUFFER_BIT);
        glDepthFunc(GL_ALWAYS); glDrawArrays(GL_TRIANGLES, 0, 3);
        int available = colored_pixels();
        glClear(GL_COLOR_BUFFER_BIT);
        glDepthFunc(GL_EQUAL); glDrawArrays(GL_TRIANGLES, 0, 3);
        int accepted = colored_pixels();
        GLfloat perturbed_projection[16];
        for (int i = 0; i < 16; i++) perturbed_projection[i] = projection[i];
        perturbed_projection[14] += 0.125f;
        bind_matrices(interaction, model, perturbed_projection);
        glClear(GL_COLOR_BUFFER_BIT); glDrawArrays(GL_TRIANGLES, 0, 3);
        int negative_control = colored_pixels();
        printf("%s{\"origin\":%.3f,\"distance\":%.3f,\"available\":%d,\"accepted\":%d,\"negativeControl\":%d}",
            origin || range ? "," : "", z, distance, available, accepted, negative_control);
    }
    printf("],\"capturedCases\":[");
    glViewport(0, 0, read_width, read_height);
    for (unsigned sample = 0; sample < capture_count; sample++) {
        unsigned id;
        GLfloat values[43]; // model[16], projection[16], vertices[9], depth range[2]
        if (fread(&id, sizeof(id), 1, capture) != 1 ||
            fread(values, sizeof(values), 1, capture) != 1) return 14;
        const GLfloat *model = values, *actual_projection = values + 16, *vertices = values + 32;
        glDepthRangef(values[41], values[42]);
        glBufferData(GL_ARRAY_BUFFER, 9 * sizeof(GLfloat), vertices, GL_STREAM_DRAW);
        glDepthMask(GL_TRUE); glColorMask(GL_FALSE,GL_FALSE,GL_FALSE,GL_FALSE);
        glClear(GL_DEPTH_BUFFER_BIT);
        bind_matrices(depth, model, actual_projection);
        glDepthFunc(GL_ALWAYS); glDrawArrays(GL_TRIANGLES, 0, 3);
        bind_matrices(interaction, model, actual_projection);
        GLfloat center[3] = {0,0,0};
        for (int v = 0; v < 3; v++) for (int c = 0; c < 3; c++) center[c] += vertices[v*3+c] / 3.0f;
        center[2] += 10000.0f;
        glUniform4f(glGetUniformLocation(interaction, "uLocalLightOrigin"), center[0],center[1],center[2],1);
        glUniform4f(glGetUniformLocation(interaction, "uLocalViewOrigin"), center[0],center[1],center[2],1);
        glColorMask(GL_TRUE,GL_TRUE,GL_TRUE,GL_TRUE); glDepthMask(GL_FALSE);
        glClear(GL_COLOR_BUFFER_BIT);
        glDepthFunc(GL_ALWAYS); glDrawArrays(GL_TRIANGLES, 0, 3);
        int available = colored_pixels();
        glClear(GL_COLOR_BUFFER_BIT);
        glDepthFunc(GL_EQUAL); glDrawArrays(GL_TRIANGLES, 0, 3);
        int accepted = colored_pixels();
        GLfloat perturbed[16];
        for (int c = 0; c < 16; c++) perturbed[c] = actual_projection[c];
        perturbed[14] += 0.125f;
        bind_matrices(interaction, model, perturbed);
        glClear(GL_COLOR_BUFFER_BIT); glDrawArrays(GL_TRIANGLES, 0, 3);
        int negative_control = colored_pixels();
        printf("%s{\"id\":%u,\"available\":%d,\"accepted\":%d,\"negativeControl\":%d}",
            sample ? "," : "", id, available, accepted, negative_control);
    }
    if (capture) fclose(capture);
    printf("]}\n");
    GLenum error = glGetError();
    if (error) fprintf(stderr, "GL error: 0x%x\n", error);
    glDeleteTextures(2, textures); glDeleteTextures(1, &ambient_texture);
    glDeleteBuffers(1, &buffer); glDeleteVertexArrays(1, &vao);
    glDeleteProgram(depth); glDeleteProgram(interaction);
    eglMakeCurrent(display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
    eglDestroyContext(display, context); eglDestroySurface(display, surface); eglTerminate(display);
    return error ? 10 : 0;
}
