#ifdef __EMSCRIPTEN__
{
    static SourceWasmBrightnessGate diagnosticModes;
    ConVarRef hdr("mat_hdr_level", true), fullbright("mat_fullbright", true), gamma("mat_monitorgamma", true), shaderSrgb("r_shader_srgb", true);
    const int actual = int(HardwareConfig()->GetHDRType());
    const int values[] = {actual, int(HardwareConfig()->GetHardwareHDRType()), int(HardwareConfig()->GetHDREnabled()),
        hdr.IsValid() ? hdr.GetInt() : -1, fullbright.IsValid() ? fullbright.GetInt() : -1,
        shaderSrgb.IsValid() ? shaderSrgb.GetInt() : -1};
    const uint64_t key = SourceWasmBrightnessHash(values, sizeof(values));
    // Reserve independent observations for LDR/integer/float modes. Draw
    // records include the current tone constants even after this quota fills.
    if (diagnosticModes.Accept(actual >= 0 && actual < 3 ? actual : 3, key)) {
        printf("[source-brightness] mode hdr=%d hardwareHdr=%d mapHdr=%d hdrCvar=%d fullbright=%d shaderSrgb=%d gamma=%g fakeWrite=%d supportsSrgb=%d tone=%g,%g,%g,%g\n",
            values[0], values[1], values[2], values[3], values[4], values[5], gamma.IsValid() ? double(gamma.GetFloat()) : -1.0,
            int(g_pHardwareConfig->Caps().m_FakeSRGBWrite), int(g_pHardwareConfig->Caps().m_SupportsSRGB),
            double(m_ToneMappingScale.x), double(m_ToneMappingScale.y), double(m_ToneMappingScale.z), double(m_ToneMappingScale.w));
    }
}
#endif
