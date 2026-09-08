#ifdef __EMSCRIPTEN__
                if (V_stristr(ch->sfx->getname(), "gman")) {
                    static SourceWasmFacialWindow window;
                    static bool active = false;
                    static SourceWasmAudioClockSnapshot previous = {};
                    static int previousSound = 0, previousPainted = 0;
                    if (!window.Done()) {
                        const double wall = Plat_FloatTime();
                        if (!active) {
                            active = true;
                            SourceWasmFacialAudioStart();
                            previous = SourceWasmFacialAudioSnapshot();
                            previousSound = g_soundtime; previousPainted = g_paintedtime;
                        }
                        if (window.Observe(wall, elapsed)) {
                            const SourceWasmAudioClockSnapshot audio = SourceWasmFacialAudioSnapshot();
                            printf("[source-facial] engine window=%u wall=%.3f span=%.3f mouthUpdates=%u same=%u backwards=%u maxWallStepMs=%.3f maxMouthStepMs=%.3f wave=%.100s rate=%d mixerSample=%d mouth=%.6f callbacks=%u consumedFrames=%u dmaFrames=%d paintedFrames=%d cursor=%u callbackMaxGapMs=%u clockActive=%u aheadMs=%.3f\n",
                                window.windows, wall, wall-window.start, window.events, window.repeats, window.backwards,
                                1000.0*window.maxWallStep, 1000.0*window.maxClockStep, ch->sfx->getname(),
                                pSource->SampleRate(), ch->pMixer->GetSamplePosition(), double(elapsed),
                                audio.callbacks-previous.callbacks, audio.consumedFrames-previous.consumedFrames,
                                g_soundtime-previousSound, g_paintedtime-previousPainted, audio.cursor,
                                audio.maximumCallbackGapMs, audio.active, 1000.0*double(g_paintedtime-g_soundtime)/SOUND_DMA_SPEED);
                            previous = audio; previousSound = g_soundtime; previousPainted = g_paintedtime;
                            window.Finish(wall);
                            if (window.Done()) SourceWasmFacialAudioStop();
                        }
                    }
                }
#endif
