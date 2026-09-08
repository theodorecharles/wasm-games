#ifdef __EMSCRIPTEN__
{
    const CGLMProgram *fragment = m_drawingProgram[kGLMFragmentProgram];
    const char *shader = fragment ? fragment->m_shaderName : "?";
    bool fullFrame = false, face = false;
    uint64_t signature = SourceWasmBrightnessText(shader);
    for (int sampler = 0; fragment && sampler < GLM_SAMPLER_COUNT; ++sampler) {
        if (!(fragment->m_samplerMask & (1U << sampler))) continue;
        CGLMTex *texture = m_samplers[sampler].m_pBoundTex;
        if (!texture) continue;
        fullFrame |= SourceWasmBrightnessContains(texture->m_debugLabel, "_rt_fullframefb");
        face |= SourceWasmBrightnessContains(texture->m_debugLabel, "gman_face");
        const unsigned state[] = {unsigned(sampler), texture->m_texName,
            unsigned(texture->m_layout->m_key.m_texFormat), unsigned(texture->m_layout->m_key.m_texFlags),
            unsigned(m_samplers[sampler].m_samp.m_packed.m_srgb)};
        signature = SourceWasmBrightnessHash(state, sizeof(state), signature);
    }
    const int bucket = SourceWasmBrightnessContains(shader, "engine_post") ? 0 :
        SourceWasmBrightnessContains(shader, "introscreenspace") ? 1 : fullFrame ? 2 :
        SourceWasmBrightnessContains(shader, "lightmapped") ? 3 : face ? 4 : -1;
    static unsigned counts[5] = {};
    static uint64_t keys[5][2] = {};
    if (bucket >= 0 && counts[bucket] < 2 &&
        (!counts[bucket] || keys[bucket][0] != signature)) {
        keys[bucket][counts[bucket]++] = signature;
        GLint encoding = -1;
        gGL->glGetFramebufferAttachmentParameteriv(GL_DRAW_FRAMEBUFFER,
            m_boundDrawFBO ? GL_COLOR_ATTACHMENT0 : GL_BACK,
            GL_FRAMEBUFFER_ATTACHMENT_COLOR_ENCODING, &encoding);
        const float *tone = m_programParamsF[kGLMFragmentProgram].m_values[30];
        printf("[source-input] bucket=%d shader=%.70s combo=%d program=%u fbo=%u encoding=0x%x decodeExtension=%d tone=%g,%g,%g,%g",
            bucket, shader, fragment ? fragment->m_labelCombo : -1, m_pBoundPair->m_program,
            m_boundDrawFBO ? m_boundDrawFBO->m_name : 0, unsigned(encoding), int(gGL->m_bHave_GL_EXT_texture_sRGB_decode),
            double(tone[0]), double(tone[1]), double(tone[2]), double(tone[3]));
        for (int sampler = 0; fragment && sampler < GLM_SAMPLER_COUNT; ++sampler) {
            if (!(fragment->m_samplerMask & (1U << sampler))) continue;
            CGLMTex *texture = m_samplers[sampler].m_pBoundTex;
            if (!texture) continue;
            const bool srgb = (texture->m_layout->m_key.m_texFlags & kGLMTexSRGB) != 0;
            printf(" s%d={read:%u format:%u flags:0x%x declaredInternal:0x%x label:%.90s}", sampler,
                unsigned(m_samplers[sampler].m_samp.m_packed.m_srgb), unsigned(texture->m_layout->m_key.m_texFormat),
                unsigned(texture->m_layout->m_key.m_texFlags), unsigned(srgb ? texture->m_layout->m_format->m_glIntFormatSRGB : texture->m_layout->m_format->m_glIntFormat),
                texture->m_debugLabel ? texture->m_debugLabel : "?");
        }
        printf("\n");
    }
}
#endif
