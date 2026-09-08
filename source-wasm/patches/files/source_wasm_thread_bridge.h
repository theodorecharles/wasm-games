#ifndef SOURCE_WASM_THREAD_BRIDGE_H
#define SOURCE_WASM_THREAD_BRIDGE_H
#include <stdint.h>

// Called only from the engine's owning pthread, never through browser ccall.
void SourceWasmBridge_Init();
void SourceWasmBridge_BeforeFrame();
void SourceWasmBridge_AfterFrame();
void SourceWasmBridge_PublishState();

// Save notifications copy only scalar/string data across threads. Completion
// hooks may run on the save worker, after native filesystem writes finish.
void SourceWasmBridge_SaveBegin(const char *filename, bool screenshot);
void SourceWasmBridge_SaveCoreComplete();
uint32_t SourceWasmBridge_TakeScreenshotSequence();
void SourceWasmBridge_SaveScreenshotComplete(uint32_t sequence);

#endif
