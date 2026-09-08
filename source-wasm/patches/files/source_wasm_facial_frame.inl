#ifdef __EMSCRIPTEN__
        {
            CStudioHdr *timingHdr = GetModelPtr();
            if (timingHdr && V_stristr(timingHdr->pszName(), "gman")) {
                static SourceWasmFacialWindow window;
                static int lastFrame = -1;
                if (!window.Done() && lastFrame != gpGlobals->framecount) {
                    lastFrame = gpGlobals->framecount;
                    const double wall = Plat_FloatTime();
                    if (window.Observe(wall, timesincestart)) {
                        printf("[source-facial] client window=%u wall=%.3f span=%.3f frames=%u sameMouth=%u backwards=%u maxFrameMs=%.3f maxMouthStepMs=%.3f frame=%d gameTime=%.6f frameTimeMs=%.3f mouth=%.6f phonemes=%d filterMs=%.3f delayMs=%.3f snap=%d smooth=%d delayed=%d boneMask=0x%x model=%.80s\n",
                            window.windows, wall, wall-window.start, window.events, window.repeats, window.backwards,
                            1000.0*window.maxWallStep, 1000.0*window.maxClockStep, gpGlobals->framecount,
                            double(gpGlobals->curtime), 1000.0*gpGlobals->frametime, double(timesincestart),
                            sentence->GetRuntimePhonemeCount(), 1000.0*g_CV_PhonemeFilter.GetFloat(),
                            1000.0*g_CV_PhonemeDelay.GetFloat(), g_CV_PhonemeSnap.GetInt(),
                            int(g_CV_FlexSmooth.GetBool()), int(UsesFlexDelayedWeights()), unsigned(m_iAccumulatedBoneMask), timingHdr->pszName());
                        window.Finish(wall);
                    }
                }
            }
        }
#endif
