#ifdef __EMSCRIPTEN__
        {
            static SourceWasmMonitorGate gate;
            const int values[] = {int(cl_drawmonitors.GetBool()), g_pMaterialSystemHardwareConfig->GetDXSupportLevel(),
                int((whatToDraw & RENDERVIEW_SUPPRESSMONITORRENDERING) != 0)};
            if (gate.Accept(SourceWasmMonitorHash(values, sizeof(values))))
                printf("[source-monitor] render enabled=%d dxlevel=%d suppressed=%d\n", values[0], values[1], values[2]);
        }
#endif
