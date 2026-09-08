#ifdef __EMSCRIPTEN__
{
    static SourceWasmBrightnessGate diagnosticUploads;
    const char *label = m_debugLabel ? m_debugLabel : "?";
    const int bucket = SourceWasmBrightnessBucket(NULL, label);
    const unsigned signature[] = {unsigned(m_layout->m_key.m_texFormat), unsigned(intformat),
        unsigned(glDataFormat), unsigned(glDataType), unsigned(m_layout->m_key.m_texFlags), unsigned(m_mapped != NULL)};
    const uint64_t key = SourceWasmBrightnessHash(signature, sizeof(signature), SourceWasmBrightnessText(label));
    if (diagnosticUploads.Accept(bucket, key)) {
        // Noncompressed formats are recorded after convert_texture. The
        // compressed fallback emits its actual glTexImage2D formats separately.
        printf("[source-brightness] upload bucket=%d label=%.160s texture=%u d3dFormat=%u flags=0x%x internal=0x%x dataFormat=0x%x dataType=0x%x compressed=%d dxtHardware=%d norm16=%d srgbDecode=%d slice=%dx%d mip=%d box=%d,%d,%d,%d mapped=%d noData=%d\n",
            bucket, label, m_texName, unsigned(m_layout->m_key.m_texFormat), unsigned(m_layout->m_key.m_texFlags),
            unsigned(intformat), unsigned(glDataFormat), unsigned(glDataType), int(format->m_chunkSize != 1),
            int(gGL->m_bHave_GL_EXT_texture_compression_dxt1), int(gGL->m_bHave_GL_EXT_texture_norm16), int(gGL->m_bHave_GL_EXT_texture_sRGB_decode),
            slice->m_xSize, slice->m_ySize, desc->m_req.m_mip, writeBox.xmin, writeBox.ymin, writeBox.xmax, writeBox.ymax,
            int(m_mapped != NULL), int(noDataWrite));
    }
}
#endif
