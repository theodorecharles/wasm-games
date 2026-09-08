#ifdef __EMSCRIPTEN__
{
    const int location = m_pBoundPair->m_locFragmentFakeSRGBEnable;
    if (location >= 0) {
        SourceWasmSrgbTargetKey key;
        if (m_boundDrawFBO) {
            const GLMFBOTexAttachParams &attachment = m_boundDrawFBO->m_attach[kAttColor0];
            CGLMTex *texture = attachment.m_tex;
            key.texture = texture;
            key.mip = attachment.m_mip;
            key.face = attachment.m_face;
            key.slice = attachment.m_zslice;
            if (texture) {
                key.name = texture->m_texName;
                key.format = unsigned(texture->m_layout->m_key.m_texFormat);
                key.flags = unsigned(texture->m_layout->m_key.m_texFlags);
            }
        }
        SourceWasmSrgbTargetCache &cache = m_boundDrawFBO ?
            m_boundDrawFBO->m_sourceSrgbTarget : m_sourceDefaultSrgbTarget;
        const int encoding = cache.Resolve(key, [&]() {
            GLint actual = -1;
            gGL->glGetFramebufferAttachmentParameteriv(GL_DRAW_FRAMEBUFFER,
                m_boundDrawFBO ? GL_COLOR_ATTACHMENT0 : GL_BACK,
                GL_FRAMEBUFFER_ATTACHMENT_COLOR_ENCODING, &actual);
            return int(actual);
        });
        const bool requested = m_caps.m_hasGammaWrites ?
            m_BlendEnableSRGB.GetData().enable != 0 : m_FakeBlendEnableSRGB;
        if (!SourceWasmApplySrgbWrite(location, requested, encoding,
                m_pBoundPair->m_fakeSRGBEnableValue,
                [&](int uniform, float value) { gGL->glUniform1f(uniform, value); })) {
            static bool warned = false;
            if (!warned) {
                warned = true;
                Warning("[source-srgb] Cannot query attachment encoding (0x%x); sRGB state is unresolved\n", unsigned(encoding));
            }
        }
    }
}
#endif
