#ifndef SOURCE_WASM_SIDE_MODULE_NAME_H
#define SOURCE_WASM_SIDE_MODULE_NAME_H

// Dynamic modules are preloaded by basename, regardless of the engine's VFS root.
inline const char *SourceWasm_ModuleName(const char *path)
{
    const char *name = path;
    for (const char *cursor = path; *cursor; ++cursor)
    {
        if (*cursor == '/' || *cursor == '\\')
            name = cursor + 1;
    }
    if (name[0] == 'l' && name[1] == 'i' && name[2] == 'b')
        name += 3;
    return name;
}

#endif
