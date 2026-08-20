#include <EGL/egl.h>
#include <GLES3/gl3.h>

#include <stdio.h>
#include <stdlib.h>

static char *read_file(const char *path) {
	FILE *stream = fopen(path, "rb");
	if (stream == NULL || fseek(stream, 0, SEEK_END) != 0) {
		return NULL;
	}
	long size = ftell(stream);
	if (size < 0 || fseek(stream, 0, SEEK_SET) != 0) {
		fclose(stream);
		return NULL;
	}
	char *contents = (char *)malloc((size_t)size + 1);
	if (contents == NULL || fread(contents, 1, (size_t)size, stream) != (size_t)size) {
		free(contents);
		fclose(stream);
		return NULL;
	}
	contents[size] = '\0';
	fclose(stream);
	return contents;
}

static GLuint compile_shader(GLenum type, const char *source, const char *label) {
	GLuint shader = glCreateShader(type);
	glShaderSource(shader, 1, &source, NULL);
	glCompileShader(shader);
	GLint compiled = GL_FALSE;
	glGetShaderiv(shader, GL_COMPILE_STATUS, &compiled);
	if (compiled == GL_TRUE) {
		return shader;
	}
	char log[8192] = { 0 };
	glGetShaderInfoLog(shader, sizeof(log), NULL, log);
	fprintf(stderr, "%s compile failed:\n%s\n", label, log);
	glDeleteShader(shader);
	return 0;
}

int main(int argc, char **argv) {
	if (argc != 3) {
		fprintf(stderr, "usage: %s vertex.glsl fragment.glsl\n", argv[0]);
		return 2;
	}

	EGLDisplay display = eglGetDisplay(EGL_DEFAULT_DISPLAY);
	if (display == EGL_NO_DISPLAY || eglInitialize(display, NULL, NULL) != EGL_TRUE) {
		fprintf(stderr, "failed to initialize surfaceless EGL: 0x%x\n", eglGetError());
		return 3;
	}
	if (eglBindAPI(EGL_OPENGL_ES_API) != EGL_TRUE) {
		fprintf(stderr, "failed to bind OpenGL ES: 0x%x\n", eglGetError());
		return 4;
	}
	const EGLint config_attributes[] = {
		EGL_SURFACE_TYPE, EGL_PBUFFER_BIT,
		EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT,
		EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8,
		EGL_NONE
	};
	EGLConfig config = NULL;
	EGLint config_count = 0;
	if (eglChooseConfig(display, config_attributes, &config, 1, &config_count) != EGL_TRUE || config_count != 1) {
		fprintf(stderr, "failed to choose an OpenGL ES 3 config: 0x%x\n", eglGetError());
		return 5;
	}
	const EGLint pbuffer_attributes[] = { EGL_WIDTH, 1, EGL_HEIGHT, 1, EGL_NONE };
	EGLSurface surface = eglCreatePbufferSurface(display, config, pbuffer_attributes);
	const EGLint context_attributes[] = { EGL_CONTEXT_CLIENT_VERSION, 3, EGL_NONE };
	EGLContext context = eglCreateContext(display, config, EGL_NO_CONTEXT, context_attributes);
	if (surface == EGL_NO_SURFACE || context == EGL_NO_CONTEXT ||
		eglMakeCurrent(display, surface, surface, context) != EGL_TRUE) {
		fprintf(stderr, "failed to create an OpenGL ES 3 context: 0x%x\n", eglGetError());
		return 6;
	}

	char *vertex_source = read_file(argv[1]);
	char *fragment_source = read_file(argv[2]);
	if (vertex_source == NULL || fragment_source == NULL) {
		fprintf(stderr, "failed to read shader inputs\n");
		return 7;
	}
	GLuint vertex_shader = compile_shader(GL_VERTEX_SHADER, vertex_source, "vertex shader");
	GLuint fragment_shader = compile_shader(GL_FRAGMENT_SHADER, fragment_source, "fragment shader");
	if (vertex_shader == 0 || fragment_shader == 0) {
		return 8;
	}
	GLuint program = glCreateProgram();
	glAttachShader(program, vertex_shader);
	glAttachShader(program, fragment_shader);
	glLinkProgram(program);
	GLint linked = GL_FALSE;
	glGetProgramiv(program, GL_LINK_STATUS, &linked);
	if (linked != GL_TRUE) {
		char log[8192] = { 0 };
		glGetProgramInfoLog(program, sizeof(log), NULL, log);
		fprintf(stderr, "program link failed:\n%s\n", log);
		return 9;
	}

	printf("linked with %s\n", glGetString(GL_VERSION));
	glDeleteProgram(program);
	glDeleteShader(vertex_shader);
	glDeleteShader(fragment_shader);
	free(vertex_source);
	free(fragment_source);
	eglDestroyContext(display, context);
	eglDestroySurface(display, surface);
	eglTerminate(display);
	return 0;
}
