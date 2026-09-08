#ifdef __EMSCRIPTEN__
    {
        CGLMTex *color = m_pRenderTargets[0] ? m_pRenderTargets[0]->m_tex : NULL;
        if (color && SourceWasmIsCameraTarget(color->m_debugLabel)) {
            static SourceWasmMonitorGate gate;
            CGLMTex *depth = m_pDepthStencil ? m_pDepthStencil->m_tex : NULL;
            const unsigned values[] = {unsigned(color->m_texName), unsigned(color->m_layout->m_key.m_xSize),
                unsigned(color->m_layout->m_key.m_ySize), unsigned(color->m_layout->m_key.m_texFormat),
                unsigned(color->m_layout->m_key.m_texFlags), depth ? unsigned(depth->m_texName) : 0,
                depth ? unsigned(depth->m_layout->m_key.m_xSize) : 0, depth ? unsigned(depth->m_layout->m_key.m_ySize) : 0};
            // One query per attachment configuration, bounded across recreations.
            // UpdateBoundFBO has already bound the complete color/depth setup.
            if (gate.Accept(SourceWasmMonitorHash(values, sizeof(values)))) {
                const unsigned status = gGL->glCheckFramebufferStatus(GL_FRAMEBUFFER);
                printf("[source-monitor] framebuffer texture=%u size=%ux%u format=%u flags=0x%x depth=%u depthSize=%ux%u status=0x%x complete=%d\n",
                    values[0], values[1], values[2], values[3], values[4], values[5], values[6], values[7], status, int(status == GL_FRAMEBUFFER_COMPLETE));
            }
        }
    }
#endif
