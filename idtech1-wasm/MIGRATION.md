# Canonical id Tech 1 suite migration

`idtech1-wasm` is the canonical family repository created from the clean
`crispy-doom-wasm` history at commit `27496f13`. The predecessor repository was
not moved or deleted. It should remain available until every local deployment,
automation entry, and persistent-data mount has been checked against this
repository.

The public image names are now:

| Deployment | Canonical image |
| --- | --- |
| Unified suite | `idtech1-wasm` |
| Doom | `idtech1-doom-wasm` |
| Doom II | `idtech1-doom2-wasm` |
| Final Doom: TNT | `idtech1-tnt-wasm` |
| Final Doom: Plutonia | `idtech1-plutonia-wasm` |
| Heretic | `idtech1-heretic-wasm` |
| Hexen | `idtech1-hexen-wasm` |
| Chex Quest | `idtech1-chex-wasm` |

The `/data` file layout and exact per-title WAD policies are unchanged, so an
existing game-data volume may be mounted read-only for validation and then
reattached to the canonical image. Browser caches intentionally use the new
`idtech1-family` namespace and will validate/cache the selected WAD once under
that identity rather than inheriting predecessor IndexedDB records.

Before retiring `crispy-doom-wasm` later:

1. Update local orchestration and documentation to the `idtech1-wasm` path and
   canonical image tags.
2. Build and smoke the suite plus every locked image from this repository.
3. Confirm the production `/data` volume is backed up and works with the new
   per-variant provisioning gate.
4. Confirm no service, CI job, or portal entry still references the predecessor.
5. Archive or remove the predecessor only as a separate, explicit operation.

This is a downstream browser port. Do not submit its WebAssembly changes or
patches to the native source-port projects used as references.
