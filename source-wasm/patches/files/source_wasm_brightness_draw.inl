#ifdef __EMSCRIPTEN__
{
    static SourceWasmBrightnessGate diagnosticDraws;
    const CGLMProgram *fragment = m_drawingProgram[kGLMFragmentProgram];
    const char *shader = fragment ? fragment->m_shaderName : "?";
    CGLMTex *base = NULL;
    // Face/eye materials do not always put their identifying texture on s0.
    for (int sampler = 0; sampler < GLM_SAMPLER_COUNT; ++sampler) {
        if (!fragment || !(fragment->m_samplerMask & (1U << sampler))) continue;
        CGLMTex *candidate = m_samplers[sampler].m_pBoundTex;
        if (!base) base = candidate;
        if (candidate && SourceWasmBrightnessContains(candidate->m_debugLabel, "gman")) {
            base = candidate;
            break;
        }
    }
    const char *texture = base && base->m_debugLabel ? base->m_debugLabel : "?";
    const int bucket = SourceWasmBrightnessBucket(shader, texture);
    CGLMTex *targetTexture = m_boundDrawFBO ? m_boundDrawFBO->m_attach[0].m_tex : NULL;
    const int requested = m_caps.m_hasGammaWrites ? m_BlendEnableSRGB.GetData().enable : int(m_FakeBlendEnableSRGB);
    const unsigned state[] = {
        m_pBoundPair->m_program, unsigned(requested),
        targetTexture ? unsigned(targetTexture->m_layout->m_key.m_texFormat) : 0,
        targetTexture ? unsigned(targetTexture->m_layout->m_key.m_texFlags) : 0
    };
    uint64_t key = SourceWasmBrightnessText(texture, SourceWasmBrightnessText(shader));
    key = SourceWasmBrightnessHash(state, sizeof(state), key);
    if (diagnosticDraws.Accept(bucket, key)) {
        GLint framebuffer = 0, encoding = -1;
        gGL->glGetIntegerv(GL_DRAW_FRAMEBUFFER_BINDING, &framebuffer);
        gGL->glGetFramebufferAttachmentParameteriv(GL_DRAW_FRAMEBUFFER,
            framebuffer ? GL_COLOR_ATTACHMENT0 : GL_BACK,
            GL_FRAMEBUFFER_ATTACHMENT_COLOR_ENCODING, &encoding);
        GLfloat applied = -1.0f;
        if (m_pBoundPair->m_locFragmentFakeSRGBEnable >= 0)
            gGL->glGetUniformfv(m_pBoundPair->m_program, m_pBoundPair->m_locFragmentFakeSRGBEnable, &applied);
        // Register 30 is TONE_MAPPING_SCALE_PSH_CONSTANT in the pinned source.
        const float *tone = m_programParamsF[kGLMFragmentProgram].m_values[30];
        ConVarRef hdr("mat_hdr_level", true), fullbright("mat_fullbright", true), gamma("mat_monitorgamma", true);
        printf("[source-brightness] draw bucket=%d shader=%.64s combo=%d texture=%.160s program=%u requestedSRGB=%d uniformLoc=%d appliedSRGB=%g shadowSRGB=%g fbo=%d encoding=0x%x targetFormat=%u targetFlags=0x%x baseFormat=%u baseFlags=0x%x hdrCvar=%d fullbright=%d gamma=%g tone=%g,%g,%g,%g\n",
            bucket, shader, fragment ? fragment->m_labelCombo : -1, texture, m_pBoundPair->m_program,
            requested, m_pBoundPair->m_locFragmentFakeSRGBEnable, double(applied), double(m_pBoundPair->m_fakeSRGBEnableValue),
            framebuffer, unsigned(encoding), state[2], state[3],
            base ? unsigned(base->m_layout->m_key.m_texFormat) : 0, base ? unsigned(base->m_layout->m_key.m_texFlags) : 0,
            hdr.IsValid() ? hdr.GetInt() : -1, fullbright.IsValid() ? fullbright.GetInt() : -1,
            gamma.IsValid() ? double(gamma.GetFloat()) : -1.0, double(tone[0]), double(tone[1]), double(tone[2]), double(tone[3]));
    }
}
#endif
