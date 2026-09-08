#ifdef __EMSCRIPTEN__
    {
        static SourceWasmMonitorGate summaries, cameraStates;
        int counts[4] = {0, 0, 0, 0};
        for (C_PointCamera *camera = pCameraEnt; camera; camera = camera->m_pNext) {
            const int active = int(camera->IsActive()), dormant = int(camera->IsDormant());
            ++counts[0]; counts[1] += active; counts[2] += dormant; counts[3] += active && !dormant;
            // Moving intro cameras cannot consume the quota with new positions.
            const int identity[] = {camera->entindex(), active, dormant};
            if (cameraStates.Accept(SourceWasmMonitorHash(identity, sizeof(identity)))) {
                const Vector &origin = camera->GetAbsOrigin();
                printf("[source-monitor] camera entity=%d active=%d dormant=%d origin=%g,%g,%g fov=%g\n",
                    identity[0], active, dormant, double(origin.x), double(origin.y), double(origin.z), double(camera->GetFOV()));
            }
        }
        if (summaries.Accept(SourceWasmMonitorHash(counts, sizeof(counts))))
            printf("[source-monitor] camera-list total=%d active=%d dormant=%d drawable=%d\n", counts[0], counts[1], counts[2], counts[3]);
    }
#endif
