    bool sourceEncodedPresent = false;
#ifdef __EMSCRIPTEN__
    if (blitToBack && yflip && blitMask == GL_COLOR_BUFFER_BIT && srcFace == 0 && srcMip == 0 &&
        srcTex->m_texGLTarget == GL_TEXTURE_2D && srcRect->xmin == 0 && srcRect->ymin == 0 &&
        srcRect->xmax == int(srcTex->m_layout->m_key.m_xSize) &&
        srcRect->ymax == int(srcTex->m_layout->m_key.m_ySize)) {
        SourceWasmPresent::Input input;
        input.source = srcTex;
        input.readFbo = m_boundReadFBO;
        input.texture = srcTex->m_texName;
        input.renderbuffer = srcTex->m_rboName;
        input.format = unsigned(srcTex->m_layout->m_key.m_texFormat);
        input.flags = unsigned(srcTex->m_layout->m_key.m_texFlags);
        input.width = srcTex->m_layout->m_key.m_xSize;
        input.height = srcTex->m_layout->m_key.m_ySize;
        input.filter = filter;
        input.destinationX = dstRect->xmin;
        input.destinationY = dstRect->ymin;
        input.destinationWidth = dstRect->xmax - dstRect->xmin;
        input.destinationHeight = dstRect->ymax - dstRect->ymin;
        input.resolved = blitTwoStep;
        input.srgbDecodeExtension = gGL->m_bHave_GL_EXT_texture_sRGB_decode;
        sourceEncodedPresent = SourceWasmPresent::Contexts<COpenGLEntryPoints>().Draw(gGL, this, input);
    }
#endif
