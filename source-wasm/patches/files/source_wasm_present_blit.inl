#ifdef __EMSCRIPTEN__
    if (blitToBack && (blitMask & GL_COLOR_BUFFER_BIT)) {
        static SourceWasmPresentGate presentGate;
        const unsigned values[] = {unsigned(srcTex->m_texName), unsigned(srcTex->m_rboName),
            unsigned(srcTex->m_layout->m_key.m_texFormat), unsigned(srcTex->m_layout->m_key.m_texFlags),
            unsigned(srcTex->m_layout->m_key.m_xSize), unsigned(srcTex->m_layout->m_key.m_ySize),
            unsigned(srcRect->xmax - srcRect->xmin), unsigned(srcRect->ymax - srcRect->ymin),
            unsigned(dstRect->xmax - dstRect->xmin), unsigned(dstRect->ymax - dstRect->ymin),
            unsigned(filter), unsigned(blitMask), unsigned(blitTwoStep), unsigned(srcMip)};
        // Bindings and selectors are already final. Query without rebinding,
        // changing GL state, reading pixels, or consuming the GL error flag.
        if (presentGate.Accept(values, sizeof(values) / sizeof(values[0]))) {
            GLint readFbo = -1, drawFbo = -1, readBuffer = GL_NONE, drawBuffer = GL_NONE;
            GLint readEncoding = 0, drawEncoding = 0;
            gGL->glGetIntegerv(GL_READ_FRAMEBUFFER_BINDING, &readFbo);
            gGL->glGetIntegerv(GL_DRAW_FRAMEBUFFER_BINDING, &drawFbo);
            gGL->glGetIntegerv(GL_READ_BUFFER, &readBuffer);
            gGL->glGetIntegerv(GL_DRAW_BUFFER0, &drawBuffer);
            if (readBuffer != GL_NONE)
                gGL->glGetFramebufferAttachmentParameteriv(GL_READ_FRAMEBUFFER, readBuffer,
                    GL_FRAMEBUFFER_ATTACHMENT_COLOR_ENCODING, &readEncoding);
            if (drawBuffer != GL_NONE)
                gGL->glGetFramebufferAttachmentParameteriv(GL_DRAW_FRAMEBUFFER, drawBuffer,
                    GL_FRAMEBUFFER_ATTACHMENT_COLOR_ENCODING, &drawEncoding);
            printf("[source-present] srcTex=%u rbo=%u format=%u flags=0x%x size=%ux%u rect=%ux%u->%ux%u filter=0x%x mask=0x%x twoStep=%u mip=%u readFbo=%d readBuffer=0x%x readEncoding=0x%x drawFbo=%d drawBuffer=0x%x drawEncoding=0x%x\n",
                values[0], values[1], values[2], values[3], values[4], values[5], values[6], values[7],
                values[8], values[9], values[10], values[11], values[12], values[13],
                readFbo, unsigned(readBuffer), unsigned(readEncoding), drawFbo, unsigned(drawBuffer), unsigned(drawEncoding));
        }
    }
#endif
