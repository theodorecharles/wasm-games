# idtech4-wasm contributor rules

- Work only in this downstream repository. Never open, push, or submit changes to an upstream project.
- Never commit or image-layer retail Doom 3, Resurrection of Evil, or Quake 4 data.
- Keep native upstream revisions and every dependency exact in `source-lock.json`.
- Carry browser changes as reviewable patch queues in `patches/`; generated checkouts belong only in `.work/`.
- Use the canonical `wasm-game-framework` package. Do not author downstream HTML, CSS, service workers, or web manifests.
- Preserve suite and game-locked container images, owner-data provisioning through `/data`, browser IndexedDB caching, and the rule that `/data` is not HTTP-accessible.
- Documentation status labels are exactly `Live` or `Still in development`.
