# Migration and parity

`idtech4-wasm` is a canonical family repository layered above two proven downstream checkpoints and the pinned Prey2006 native source:

| Working repository | Local checkpoint | Family input | Status |
| --- | --- | --- | --- |
| `doom3-wasm` | `cc9309051de93e303c384da5e8c285eaf0687c43` | dhewm3 pin + `dhewm3-browser.patch` | Still in development |
| `quake4-wasm` | `77d37eadf5a241db2ae7b2642b5d213bc2ff42d3` | openQ4 pin + `openq4-browser.patch` | Still in development |
| Prey2006 native source | `5a55c48254e0d847fae533d62a5cf9623999ec04` | Prey2006 pin + `prey2006-browser.patch` | Still in development |

The patches are complete binary-capable diffs from each pinned native upstream commit to the corresponding local checkpoint. Generated `.work` trees reproduce those checkpoints without retaining a second large source copy in git. Their origin push URLs are deliberately set to `DISABLED`.

## Contract parity

| Capability | Doom 3 SP/MP + RoE | Quake 4 SP/MP | Prey SP |
| --- | --- | --- | --- |
| Canonical framework 0.9.2 shell | Yes | Yes | Yes |
| Downstream-authored HTML/CSS/SW/PWA files | None | None | None |
| Variant-aware PWA metadata and source icon | Yes | Yes | Yes |
| Remembered launch-fullscreen preference | Yes | Yes | Yes |
| Responsive dynamic canvas and contained native menu pointer mapping | Yes | Yes | Yes |
| Launcher controller discovery and configuration | Disabled | Disabled | Disabled |
| Framework worker-local persistence restored before native main | Yes | Yes | Yes |
| Native config/save dirty and high-value flush notifications | Yes | Yes | Yes |
| Worker `OffscreenCanvas` WebGL 2 creation without DOM access | Yes | Yes | Yes |
| Retail PK4s remain Blob-backed WORKERFS files instead of whole-heap copies | Yes | Yes | Yes |
| Exact required-data validation and browser IndexedDB reuse | Yes | Yes | Yes |
| `/data` inaccessible by direct HTTP request | Yes | Yes | Yes |
| Optional framework password gate | Yes | Yes | Yes |
| Suite and locked Docker images | Yes | Yes | Yes |
| Browser runtime status | Still in development | Still in development | Still in development |

## Why the working repositories remain

The two existing repositories preserve compact per-engine history and known build evidence while the family pipeline is established. New engine-family changes should land here first as patch-queue updates. A change may be mirrored into a working repository for debugging, but the family lock, patch checksum, staged contract, and migration table must be updated in the same local checkpoint.

No migration step submits changes to dhewm3, openQ4, openQ4-game, Prey2006, or any other upstream.
