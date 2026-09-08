#!/usr/bin/env python3
"""Compile the authored shader and check its output in a headless GLES3 context."""
import ctypes as c
import ctypes.util
import pathlib
import re

egl_name, gl_name = ctypes.util.find_library('EGL'), ctypes.util.find_library('GLESv2')
if not egl_name or not gl_name:
    raise SystemExit('SKIP: headless EGL/GLES libraries unavailable')
egl, gl = c.CDLL(egl_name), c.CDLL(gl_name)
U, I, P, F = c.c_uint, c.c_int, c.c_void_p, c.c_float


def fn(lib, name, result, *arguments):
    f = getattr(lib, name)
    f.restype, f.argtypes = result, list(arguments)
    return f


get_proc = fn(egl, 'eglGetProcAddress', P, c.c_char_p)
address = get_proc(b'eglGetPlatformDisplayEXT')
if not address:
    raise SystemExit('SKIP: surfaceless EGL entry point unavailable')
display = c.CFUNCTYPE(P, U, P, c.POINTER(I))(address)(0x31DD, None, None)
major, minor = I(), I()
if not fn(egl, 'eglInitialize', U, P, c.POINTER(I), c.POINTER(I))(display, c.byref(major), c.byref(minor)):
    raise SystemExit('SKIP: surfaceless EGL display unavailable')
assert fn(egl, 'eglBindAPI', U, U)(0x30A0)
attributes = (I * 13)(0x3033, 1, 0x3040, 0x40, 0x3024, 8, 0x3023, 8, 0x3022, 8, 0x3021, 8, 0x3038)
config, count = P(), I()
assert fn(egl, 'eglChooseConfig', U, P, c.POINTER(I), c.POINTER(P), I, c.POINTER(I))(
    display, attributes, c.byref(config), 1, c.byref(count)) and count.value
context = fn(egl, 'eglCreateContext', P, P, P, P, c.POINTER(I))(display, config, None, (I * 3)(0x3098, 3, 0x3038))
surface = fn(egl, 'eglCreatePbufferSurface', P, P, P, c.POINTER(I))(display, config, (I * 5)(0x3057, 2, 0x3056, 2, 0x3038))
assert context and surface
assert fn(egl, 'eglMakeCurrent', U, P, P, P, P)(display, surface, surface, context)

create_shader = fn(gl, 'glCreateShader', U, U)
shader_source = fn(gl, 'glShaderSource', None, U, I, c.POINTER(c.c_char_p), c.POINTER(I))
compile_shader = fn(gl, 'glCompileShader', None, U)
shader_iv = fn(gl, 'glGetShaderiv', None, U, U, c.POINTER(I))
shader_log = fn(gl, 'glGetShaderInfoLog', None, U, I, c.POINTER(I), c.c_char_p)
create_program = fn(gl, 'glCreateProgram', U)
attach = fn(gl, 'glAttachShader', None, U, U)
link = fn(gl, 'glLinkProgram', None, U)
program_iv = fn(gl, 'glGetProgramiv', None, U, U, c.POINTER(I))
use = fn(gl, 'glUseProgram', None, U)
header = (pathlib.Path(__file__).resolve().parents[1] / 'patches/files/source_wasm_present_transfer.h').read_text()
sources = re.findall(r'R"glsl\((.*?)\)glsl"', header, re.S)
assert len(sources) == 2
program = create_program()
for kind, source in zip((0x8B31, 0x8B30), sources):
    shader = create_shader(kind)
    shader_source(shader, 1, (c.c_char_p * 1)(source.encode()), None)
    compile_shader(shader)
    success = I()
    shader_iv(shader, 0x8B81, c.byref(success))
    if not success.value:
        message = c.create_string_buffer(4096)
        shader_log(shader, len(message), None, message)
        raise AssertionError(message.value.decode())
    attach(program, shader)
    fn(gl, 'glDeleteShader', None, U)(shader)
link(program)
success = I()
program_iv(program, 0x8B82, c.byref(success))
assert success.value, 'Authored presentation shader failed to link'
use(program)
location = fn(gl, 'glGetUniformLocation', I, U, c.c_char_p)(program, b'sourceImage')
assert location >= 0
fn(gl, 'glUniform1i', None, I, I)(location, 0)
vao = U()
fn(gl, 'glGenVertexArrays', None, I, c.POINTER(U))(1, c.byref(vao))
fn(gl, 'glBindVertexArray', None, U)(vao)
textures = (U * 2)()
fn(gl, 'glGenTextures', None, I, c.POINTER(U))(2, textures)
bind_texture = fn(gl, 'glBindTexture', None, U, U)
image = fn(gl, 'glTexImage2D', None, U, I, I, I, I, I, U, U, P)
parameter = fn(gl, 'glTexParameteri', None, U, U, I)
# Rows are supplied bottom-to-top; the shader must preserve alpha and flip Y.
pixels = [118,118,118,17, 64,128,192,64, 0,255,118,128, 255,0,64,255]
source_bytes = (c.c_ubyte * 16)(*pixels)
for index, internal in enumerate((0x8C43, 0x8058)):
    bind_texture(0x0DE1, textures[index])
    image(0x0DE1, 0, internal, 2, 2, 0, 0x1908, 0x1401, source_bytes if index == 0 else None)
    parameter(0x0DE1, 0x2801, 0x2600)
    parameter(0x0DE1, 0x2800, 0x2600)
framebuffer = U()
fn(gl, 'glGenFramebuffers', None, I, c.POINTER(U))(1, c.byref(framebuffer))
fn(gl, 'glBindFramebuffer', None, U, U)(0x8D40, framebuffer)
fn(gl, 'glFramebufferTexture2D', None, U, U, U, U, I)(0x8D40, 0x8CE0, 0x0DE1, textures[1], 0)
assert fn(gl, 'glCheckFramebufferStatus', U, U)(0x8D40) == 0x8CD5
bind_texture(0x0DE1, textures[0])
fn(gl, 'glViewport', None, I, I, I, I)(0, 0, 2, 2)
fn(gl, 'glDisable', None, U)(0x0BD0)
fn(gl, 'glDrawArrays', None, U, I, I)(0x0004, 0, 3)
output = (c.c_ubyte * 16)()
fn(gl, 'glReadPixels', None, I, I, I, I, U, U, P)(0, 0, 2, 2, 0x1908, 0x1401, output)
expected = pixels[8:] + pixels[:8]
assert all(abs(actual - wanted) <= 1 for actual, wanted in zip(output, expected)), (list(output), expected)
assert [output[i] for i in (3, 7, 11, 15)] == [expected[i] for i in (3, 7, 11, 15)]
assert output[8] == 118, 'Linear gray .18 must return encoded byte118 rather than46'
assert fn(gl, 'glGetError', U)() == 0
print('GLES3 authored shaders compile; sRGB gray118, RGB transfer, exact alpha and Y-flip pass')
fn(egl, 'eglMakeCurrent', U, P, P, P, P)(display, None, None, None)
fn(egl, 'eglDestroySurface', U, P, P)(display, surface)
fn(egl, 'eglDestroyContext', U, P, P)(display, context)
fn(egl, 'eglTerminate', U, P)(display)
