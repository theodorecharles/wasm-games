# Engine patches

These patches are applied to **your** leaked 2017 ToGL/TOGLES tree. They are
not the engine.

```bash
node scripts/apply-source-patches.mjs /path/to/your/source-engine
```

| Patch | Why |
| --- | --- |
| static GL buffers | ToGLES ships with static VBO/IBO disabled; WebGL and some Linux paths need them on. |
| Emscripten memsize | `/proc/meminfo` does not exist in the browser; abort is not a playable game. |
| packedstore exact I/O | WASM has no mmap; VPK reads must Seek+Read. |
| no 2MB texture floor | A 2MB “optimal” read into a 560-byte VTF overwrites the stack cookie. |
| `--emscripten` + factory | `createSourceEngineModule`, `noInitialRun`, exported `HEAPU8` / `callMain`. |

`series` lists the names. The apply script is idempotent.
