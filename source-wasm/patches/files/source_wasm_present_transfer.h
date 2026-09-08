#ifndef SOURCE_WASM_PRESENT_TRANSFER_H
#define SOURCE_WASM_PRESENT_TRANSFER_H
#include <cmath>
#include <cstdio>
#include <new>

namespace SourceWasmPresent {
enum {
    Linear=0x2601, Srgb=0x8c40, Nearest=0x2600, Texture2D=0x0de1, Texture0=0x84c0,
    VertexShader=0x8b31, FragmentShader=0x8b30, CompileStatus=0x8b81, LinkStatus=0x8b82,
    ReadFramebuffer=0x8ca8, DrawFramebuffer=0x8ca9, ColorAttachment0=0x8ce0, Back=0x0405,
    ColorEncoding=0x8210, CurrentProgram=0x8b8d, VertexArrayBinding=0x85b5,
    ActiveTexture=0x84e0, TextureBinding2D=0x8069, SamplerBinding=0x8919,
    Viewport=0x0ba2, ColorWriteMask=0x0c23, TextureMinFilter=0x2801, TextureMagFilter=0x2800,
    TextureWrapS=0x2802, TextureWrapT=0x2803, ClampToEdge=0x812f,
    TextureSrgbDecode=0x8a48, Decode=0x8a49, Triangles=0x0004
};

inline double Encode(double linear) {
    return linear <= 0.0031308 ? 12.92 * linear : 1.055 * std::pow(linear, 1.0 / 2.4) - 0.055;
}

inline const char *VertexSource() {
    return R"glsl(#version 300 es
precision highp float;
out vec2 sourceUV;
void main() {
    vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
    gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
    sourceUV = vec2(corner.x, 1.0 - corner.y);
}
)glsl";
}

inline const char *FragmentSource() {
    return R"glsl(#version 300 es
precision highp float;
uniform sampler2D sourceImage;
in vec2 sourceUV;
out vec4 outputColor;
vec3 encodeSRGB(vec3 linear) {
    vec3 low = 12.92 * linear;
    vec3 high = 1.055 * pow(max(linear, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    return mix(high, low, lessThanEqual(linear, vec3(0.0031308)));
}
void main() {
    vec4 color = texture(sourceImage, sourceUV);
    outputColor = vec4(encodeSRGB(color.rgb), color.a);
}
)glsl";
}

struct Input {
    const void *source, *readFbo;
    unsigned texture, renderbuffer, format, flags, width, height, filter;
    int destinationX, destinationY, destinationWidth, destinationHeight;
    bool resolved, srgbDecodeExtension;
    Input() : source(0), readFbo(0), texture(0), renderbuffer(0), format(0), flags(0),
        width(0), height(0), filter(Nearest), destinationX(0), destinationY(0),
        destinationWidth(0), destinationHeight(0), resolved(false), srgbDecodeExtension(false) {}
};

// Public engine layouts remain unchanged. This private entry belongs to one
// context and is removed by its destructor before the GL context is destroyed.
struct Entry {
    const void *owner;
    Entry *next;
    Input key;
    bool encodingValid, failed, announced;
    int readEncoding, drawEncoding, imageLocation;
    unsigned program, vao, nearestSampler, linearSampler;
    explicit Entry(const void *context) : owner(context), next(0), encodingValid(false), failed(false),
        announced(false), readEncoding(0), drawEncoding(0), imageLocation(-1),
        program(0), vao(0), nearestSampler(0), linearSampler(0) {}
    bool SameSource(const Input &input) const {
        return key.source == input.source && key.readFbo == input.readFbo &&
            key.texture == input.texture && key.renderbuffer == input.renderbuffer &&
            key.format == input.format && key.flags == input.flags && key.width == input.width &&
            key.height == input.height && key.resolved == input.resolved;
    }
};

template<class GL> void Release(GL *gl, Entry &entry) {
    if (entry.program) gl->glDeleteProgram(entry.program);
    if (entry.vao) gl->glDeleteVertexArrays(1, &entry.vao);
    if (entry.nearestSampler) gl->glDeleteSamplers(1, &entry.nearestSampler);
    if (entry.linearSampler) gl->glDeleteSamplers(1, &entry.linearSampler);
    entry.program = entry.vao = entry.nearestSampler = entry.linearSampler = 0;
}

template<class GL> bool Compile(GL *gl, unsigned type, const char *source, unsigned &shader) {
    shader = gl->glCreateShader(type);
    if (!shader) return false;
    gl->glShaderSource(shader, 1, &source, 0);
    gl->glCompileShader(shader);
    int compiled = 0;
    gl->glGetShaderiv(shader, CompileStatus, &compiled);
    return compiled != 0;
}

template<class GL> bool Prepare(GL *gl, Entry &entry, bool decodeExtension) {
    if (entry.failed) return false;
    if (entry.program) return true;
    unsigned vertex = 0, fragment = 0;
    bool valid = Compile(gl, VertexShader, VertexSource(), vertex) &&
        Compile(gl, FragmentShader, FragmentSource(), fragment);
    if (valid) {
        entry.program = gl->glCreateProgram();
        valid = entry.program != 0;
    }
    if (valid) {
        gl->glAttachShader(entry.program, vertex);
        gl->glAttachShader(entry.program, fragment);
        gl->glLinkProgram(entry.program);
        int linked = 0;
        gl->glGetProgramiv(entry.program, LinkStatus, &linked);
        valid = linked != 0;
    }
    if (vertex) gl->glDeleteShader(vertex);
    if (fragment) gl->glDeleteShader(fragment);
    if (valid) {
        entry.imageLocation = gl->glGetUniformLocation(entry.program, "sourceImage");
        gl->glGenVertexArrays(1, &entry.vao);
        gl->glGenSamplers(1, &entry.nearestSampler);
        gl->glGenSamplers(1, &entry.linearSampler);
        valid = entry.imageLocation >= 0 && entry.vao && entry.nearestSampler && entry.linearSampler;
    }
    if (!valid) {
        Release(gl, entry);
        entry.failed = true;
        std::printf("[source-present] Final encoding shader unavailable; retaining original blit\n");
        return false;
    }
    const unsigned samplers[] = {entry.nearestSampler, entry.linearSampler};
    for (unsigned i = 0; i < 2; ++i) {
        gl->glSamplerParameteri(samplers[i], TextureMinFilter, i ? Linear : Nearest);
        gl->glSamplerParameteri(samplers[i], TextureMagFilter, i ? Linear : Nearest);
        gl->glSamplerParameteri(samplers[i], TextureWrapS, ClampToEdge);
        gl->glSamplerParameteri(samplers[i], TextureWrapT, ClampToEdge);
        if (decodeExtension) gl->glSamplerParameteri(samplers[i], TextureSrgbDecode, Decode);
    }
    return true;
}

template<class GL> struct SavedState {
    GL *gl;
    int program, vao, activeUnit, texture, sampler, viewport[4];
    unsigned char colorMask[4], enabled[9];
    // Blit ignores these fragment/raster operations (scissor is disabled by
    // Blit2). Disable them for the triangle and restore their actual values.
    static unsigned Capability(unsigned index) {
        const unsigned values[] = {0x0be2, 0x0b44, 0x0b71, 0x0b90, 0x8c89,
            0x0bd0, 0x809e, 0x80a0, 0x0c11};
        return values[index];
    }
    explicit SavedState(GL *api) : gl(api) {
        gl->glGetIntegerv(CurrentProgram, &program);
        gl->glGetIntegerv(VertexArrayBinding, &vao);
        gl->glGetIntegerv(ActiveTexture, &activeUnit);
        gl->glGetIntegerv(Viewport, viewport);
        gl->glGetBooleanv(ColorWriteMask, colorMask);
        for (unsigned i = 0; i < 9; ++i) enabled[i] = gl->glIsEnabled(Capability(i));
        gl->glActiveTexture(Texture0);
        gl->glGetIntegerv(TextureBinding2D, &texture);
        gl->glGetIntegerv(SamplerBinding, &sampler);
    }
    ~SavedState() {
        gl->glUseProgram(unsigned(program));
        gl->glBindVertexArray(unsigned(vao));
        gl->glActiveTexture(Texture0);
        gl->glBindTexture(Texture2D, unsigned(texture));
        gl->glBindSampler(0, unsigned(sampler));
        gl->glActiveTexture(unsigned(activeUnit));
        gl->glViewport(viewport[0], viewport[1], viewport[2], viewport[3]);
        gl->glColorMask(colorMask[0], colorMask[1], colorMask[2], colorMask[3]);
        for (unsigned i = 0; i < 9; ++i) {
            if (enabled[i]) gl->glEnable(Capability(i));
            else gl->glDisable(Capability(i));
        }
    }
};

template<class GL> class Registry {
    Entry *first;
public:
    Registry() : first(0) {}
    void Destroy(GL *gl, const void *owner) {
        Entry **link = &first;
        while (*link) {
            Entry *entry = *link;
            if (entry->owner == owner) {
                *link = entry->next;
                Release(gl, *entry);
                delete entry;
                return;
            }
            link = &entry->next;
        }
    }
    bool Draw(GL *gl, const void *owner, const Input &input) {
        if (!input.texture || !input.width || !input.height || input.destinationWidth <= 0 ||
            input.destinationHeight <= 0 || (input.filter != Nearest && input.filter != Linear) ||
            (input.renderbuffer && !input.resolved)) return false;
        Entry *entry = first;
        while (entry && entry->owner != owner) entry = entry->next;
        if (!entry) {
            entry = new (std::nothrow) Entry(owner);
            if (!entry) return false;
            entry->next = first;
            first = entry;
        }
        if (entry->failed) return false;
        if (!entry->encodingValid || !entry->SameSource(input)) {
            entry->readEncoding = entry->drawEncoding = 0;
            gl->glGetFramebufferAttachmentParameteriv(ReadFramebuffer, ColorAttachment0, ColorEncoding, &entry->readEncoding);
            gl->glGetFramebufferAttachmentParameteriv(DrawFramebuffer, Back, ColorEncoding, &entry->drawEncoding);
            entry->key = input;
            entry->encodingValid = (entry->readEncoding == Linear || entry->readEncoding == Srgb) &&
                (entry->drawEncoding == Linear || entry->drawEncoding == Srgb);
            if (!entry->encodingValid) {
                entry->failed = true;
                std::printf("[source-present] Final attachment encoding unavailable; retaining original blit\n");
                return false;
            }
        }
        if (entry->readEncoding != Srgb || entry->drawEncoding != Linear) return false;
        if (!Prepare(gl, *entry, input.srgbDecodeExtension)) return false;
        SavedState<GL> state(gl);
        for (unsigned i = 0; i < 9; ++i) gl->glDisable(SavedState<GL>::Capability(i));
        gl->glColorMask(1, 1, 1, 1);
        gl->glViewport(input.destinationX, input.destinationY, input.destinationWidth, input.destinationHeight);
        gl->glUseProgram(entry->program);
        gl->glBindVertexArray(entry->vao);
        gl->glBindTexture(Texture2D, input.texture);
        gl->glBindSampler(0, input.filter == Linear ? entry->linearSampler : entry->nearestSampler);
        gl->glUniform1i(entry->imageLocation, 0);
        gl->glDrawArrays(Triangles, 0, 3);
        if (!entry->announced) {
            entry->announced = true;
            std::printf("[source-present] Applied final sRGB encoding read=0x%x draw=0x%x\n",
                unsigned(entry->readEncoding), unsigned(entry->drawEncoding));
        }
        return true;
    }
};

template<class GL> Registry<GL> &Contexts() {
    static Registry<GL> contexts;
    return contexts;
}
} // namespace SourceWasmPresent
#endif
