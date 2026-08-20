#ifndef ETJS_GLEW_STUB_H
#define ETJS_GLEW_STUB_H

#include <GL/gl.h>
#include <GL/glext.h>

#ifdef __cplusplus
extern "C" {
#endif

#define GLEW_OK 0
#define GLEW_ERROR_NO_GLX_DISPLAY 4
#define GLEW_VERSION 1

#define GLEW_VERSION_1_2 1
#define GLEW_ARB_multitexture 1
#define GLEW_ARB_texture_non_power_of_two 1
#define GLEW_ARB_framebuffer_object 0
#define GLEW_EXT_framebuffer_object 0
#define GLEW_EXT_framebuffer_multisample 0
#define GLEW_ARB_fragment_program 0
#define GLEW_ARB_texture_compression 0
#define GLEW_EXT_texture_compression_s3tc 0
#define GLEW_EXT_texture_filter_anisotropic 0
#define GLEW_EXT_texture_env_add 0
#define GLEW_S3_s3tc 0
#define GLEW_ARB_texture_cube_map 0
#define GLEW_EXT_texture_cube_map 0

#ifndef GL_TEXTURE0_ARB
#define GL_TEXTURE0_ARB GL_TEXTURE0
#endif
#ifndef GL_MAX_TEXTURE_UNITS_ARB
#ifdef GL_MAX_TEXTURE_UNITS
#define GL_MAX_TEXTURE_UNITS_ARB GL_MAX_TEXTURE_UNITS
#else
#define GL_MAX_TEXTURE_UNITS_ARB 0x84E2
#endif
#endif
#ifndef glActiveTextureARB
#define glActiveTextureARB glActiveTexture
#endif
#ifndef glClientActiveTextureARB
#define glClientActiveTextureARB glClientActiveTexture
#endif
#ifndef glMultiTexCoord2fARB
#define glMultiTexCoord2fARB glMultiTexCoord2f
#endif

#ifndef GL_FRAMEBUFFER_EXT
#define GL_FRAMEBUFFER_EXT 0x8D40
#endif
#ifndef GL_RENDERBUFFER_EXT
#define GL_RENDERBUFFER_EXT 0x8D41
#endif
#ifndef GL_COLOR_ATTACHMENT0_EXT
#define GL_COLOR_ATTACHMENT0_EXT 0x8CE0
#endif
#ifndef GL_DEPTH_ATTACHMENT_EXT
#define GL_DEPTH_ATTACHMENT_EXT 0x8D00
#endif
#ifndef GL_STENCIL_ATTACHMENT_EXT
#define GL_STENCIL_ATTACHMENT_EXT 0x8D20
#endif
#ifndef GL_DEPTH_STENCIL_ATTACHMENT
#define GL_DEPTH_STENCIL_ATTACHMENT 0x821A
#endif
#ifndef GL_FRAMEBUFFER_COMPLETE_EXT
#define GL_FRAMEBUFFER_COMPLETE_EXT 0x8CD5
#endif
#ifndef GL_VERTEX_SHADER_ARB
#define GL_VERTEX_SHADER_ARB 0x8B31
#endif
#ifndef GL_FRAGMENT_SHADER_ARB
#define GL_FRAGMENT_SHADER_ARB 0x8B30
#endif
#ifndef GL_COMPILE_STATUS
#define GL_COMPILE_STATUS 0x8B81
#endif
#ifndef GL_INFO_LOG_LENGTH
#define GL_INFO_LOG_LENGTH 0x8B84
#endif
#ifndef GL_OBJECT_COMPILE_STATUS_ARB
#define GL_OBJECT_COMPILE_STATUS_ARB GL_COMPILE_STATUS
#endif

extern GLboolean glewExperimental;

GLenum glewInit(void);
const GLubyte *glewGetString(GLenum name);
const GLubyte *glewGetErrorString(GLenum error);
GLboolean glewIsSupported(const char *name);

void glLockArraysEXT(int first, int count);
void glUnlockArraysEXT(void);

void glBindFramebufferEXT(GLenum target, GLuint framebuffer);
void glBindRenderbufferEXT(GLenum target, GLuint renderbuffer);
void glGenFramebuffersEXT(GLsizei n, GLuint *framebuffers);
void glGenRenderbuffersEXT(GLsizei n, GLuint *renderbuffers);
void glDeleteFramebuffersEXT(GLsizei n, const GLuint *framebuffers);
void glDeleteRenderbuffersEXT(GLsizei n, const GLuint *renderbuffers);
void glFramebufferTexture2DEXT(GLenum target, GLenum attachment, GLenum textarget, GLuint texture, GLint level);
void glFramebufferTexture2D(GLenum target, GLenum attachment, GLenum textarget, GLuint texture, GLint level);
void glFramebufferRenderbufferEXT(GLenum target, GLenum attachment, GLenum renderbuffertarget, GLuint renderbuffer);
void glRenderbufferStorageEXT(GLenum target, GLenum internalformat, GLsizei width, GLsizei height);
void glRenderbufferStorageMultisampleEXT(GLenum target, GLsizei samples, GLenum internalformat, GLsizei width, GLsizei height);
GLenum glCheckFramebufferStatusEXT(GLenum target);
void glGenerateMipmapEXT(GLenum target);

void glUseProgramObjectARB(GLuint program);
GLint glGetUniformLocation(GLuint program, const char *name);
void glUniform1f(GLint location, float v0);
GLuint glCreateShaderObjectARB(GLenum type);
void glShaderSourceARB(GLuint shader, GLsizei count, const char **string, const GLint *length);
void glCompileShaderARB(GLuint shader);
void glGetObjectParameterivARB(GLuint obj, GLenum pname, GLint *params);
void glGetShaderiv(GLuint shader, GLenum pname, GLint *params);
void glGetInfoLogARB(GLuint obj, GLsizei maxLength, GLsizei *length, char *infoLog);
GLuint glCreateProgramObjectARB(void);
void glAttachObjectARB(GLuint program, GLuint shader);
void glLinkProgramARB(GLuint program);
void glDetachObjectARB(GLuint program, GLuint shader);
void glDeleteObjectARB(GLuint obj);

#ifdef __cplusplus
}
#endif

#endif
