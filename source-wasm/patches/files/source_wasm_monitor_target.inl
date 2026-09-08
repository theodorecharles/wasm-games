#ifdef __EMSCRIPTEN__
    {
        static SourceWasmMonitorGate gate;
        const int values[] = {width, height, int(pCameraTarget->GetImageFormat()), int(pCameraTarget->IsError()), int(pCameraTarget->IsRenderTarget())};
        if (gate.Accept(SourceWasmMonitorHash(values, sizeof(values))))
            printf("[source-monitor] texture name=%.96s width=%d height=%d format=%d error=%d renderTarget=%d\n",
                pCameraTarget->GetName(), values[0], values[1], values[2], values[3], values[4]);
    }
#endif
