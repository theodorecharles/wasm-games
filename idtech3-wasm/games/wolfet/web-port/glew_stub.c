#include "GL/glew.h"

GLboolean glewExperimental = 0;

GLenum glewInit(void)
{
	return GLEW_OK;
}

const GLubyte *glewGetString(GLenum name)
{
	(void)name;
	return (const GLubyte *)"ETJS-GLEW-stub";
}

const GLubyte *glewGetErrorString(GLenum error)
{
	(void)error;
	return (const GLubyte *)"no error";
}

GLboolean glewIsSupported(const char *name)
{
	(void)name;
	return 0;
}

void glLockArraysEXT(int first, int count) { (void)first; (void)count; }
void glUnlockArraysEXT(void) {}

void glBindFramebufferEXT(GLenum target, GLuint framebuffer) { (void)target; (void)framebuffer; }
void glBindRenderbufferEXT(GLenum target, GLuint renderbuffer) { (void)target; (void)renderbuffer; }
void glGenFramebuffersEXT(GLsizei n, GLuint *framebuffers)
{
	int i;
	if (framebuffers) { for (i = 0; i < n; i++) { framebuffers[i] = 0; } }
}
void glGenRenderbuffersEXT(GLsizei n, GLuint *renderbuffers)
{
	int i;
	if (renderbuffers) { for (i = 0; i < n; i++) { renderbuffers[i] = 0; } }
}
void glDeleteFramebuffersEXT(GLsizei n, const GLuint *framebuffers) { (void)n; (void)framebuffers; }
void glDeleteRenderbuffersEXT(GLsizei n, const GLuint *renderbuffers) { (void)n; (void)renderbuffers; }
void glFramebufferTexture2DEXT(GLenum target, GLenum attachment, GLenum textarget, GLuint texture, GLint level)
{
	(void)target; (void)attachment; (void)textarget; (void)texture; (void)level;
}
void glFramebufferTexture2D(GLenum target, GLenum attachment, GLenum textarget, GLuint texture, GLint level)
{
	glFramebufferTexture2DEXT(target, attachment, textarget, texture, level);
}
void glFramebufferRenderbufferEXT(GLenum target, GLenum attachment, GLenum renderbuffertarget, GLuint renderbuffer)
{
	(void)target; (void)attachment; (void)renderbuffertarget; (void)renderbuffer;
}
void glRenderbufferStorageEXT(GLenum target, GLenum internalformat, GLsizei width, GLsizei height)
{
	(void)target; (void)internalformat; (void)width; (void)height;
}
void glRenderbufferStorageMultisampleEXT(GLenum target, GLsizei samples, GLenum internalformat, GLsizei width, GLsizei height)
{
	(void)target; (void)samples; (void)internalformat; (void)width; (void)height;
}
GLenum glCheckFramebufferStatusEXT(GLenum target)
{
	(void)target;
	return GL_FRAMEBUFFER_COMPLETE_EXT;
}
void glGenerateMipmapEXT(GLenum target) { (void)target; }

/* GLES2 shader entry points come from Emscripten's -lGL. Do not stub them. */

void glActiveTextureARB(GLenum texture)
{
	glActiveTexture(texture);
}

void glClientActiveTextureARB(GLenum texture)
{
	glClientActiveTexture(texture);
}

void glMultiTexCoord2fARB(GLenum target, GLfloat s, GLfloat t)
{
	glMultiTexCoord2f(target, s, t);
}

void glMultiTexCoord2fvARB(GLenum target, const GLfloat *v)
{
	if (v) {
		glMultiTexCoord2f(target, v[0], v[1]);
	}
}
