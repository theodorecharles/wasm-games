# Migration from the separate Quake repositories

`idtech2-wasm` is the canonical family repository. It was cloned from the clean
Quake browser-port commit `bb0514d` and merged, with full ancestry, with the
clean Quake II browser-port commit `a325b27c`. Quake remains at the repository
root; Quake II lives under `engines/quake2/`. The merge commit `a382f8d1` has
both authoritative commits as parents.

The predecessor repositories `quake1-wasm` and `quake2-wasm` were not moved,
deleted, rewritten, or modified. Keep them read-only until consumers have moved
to this family build; retire them only in a separate, explicitly authorized
cleanup.

Deployment mapping:

| Previous image | Canonical family output | Variant |
| --- | --- | --- |
| `quake1-wasm` | `quake1-wasm` | `quake` |
| `quake2-wasm` | `quake2-wasm` | `quake2` |
| none | `idtech2-wasm` | suite selector |

Existing persistent data layouts remain compatible: Quake reads
`/data/id1/pak0.pak` and `/data/id1/pak1.pak`; Quake II reads
`/data/pak0.pak`, `/data/pak1.pak`, and `/data/pak2.pak`. A suite volume may
contain both layouts without collision.

The browser-cache namespaces intentionally changed to
`idtech2-quake-registered` and `idtech2-quake2-registered`. Browsers therefore
perform one exact revalidation/download from the container after moving to the
family deployment. The container never exposes `/data` directly.

The public runtime contract also changes from a single-title configuration to
one suite `wasm-game.json`, one variant-aware `wasm-game-data.json`, and a
family adapter that selects native delegates. The canonical framework is
v0.9.4 / `c4ad3b9e075f881d32f044299fbfeee703a9169d` and owns the root document, CSS, service worker, web
manifest, provisioning, cache, input capture, fullscreen, and display shell.
Quake and Quake II now use separate variant-resolved IDBFS roots for native
configuration and saves. Controller support is currently disabled.
