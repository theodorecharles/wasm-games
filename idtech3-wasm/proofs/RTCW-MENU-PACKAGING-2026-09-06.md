# RTCW deterministic menu packaging — 2026-09-06

Fixed `pack-rtcw-menus.py` writing the local build time into every PK3 entry.
The existing static test described these generated artifacts as deterministic,
but rebuilding identical source menus changed the archives' SHA-256 hashes.

The packer now explicitly supplies the ZIP epoch (1980-01-01), Unix creator
metadata and the previous `0600` entry permissions. DEFLATE remains explicit:
passing a `ZipInfo` object without that field would silently store entries
uncompressed. Input ordering, menu selection and payloads are unchanged.

## Verification

`python3 -B tests/rtcw-menus.test.py` passes seven tests against the real packer:

- All 12 MP entries and the SP entry preserve their exact payloads and raw
  compressed streams compared with the old packing policy.
- Builds with different clocks and `SOURCE_DATE_EPOCH` values are byte-equal.
- Different input creation order, mtimes and permissions do not affect output.
- Simulated Windows-default ZIP creator metadata is overridden consistently.
- Changed menu contents still change the archive hash and extracted payload.
- Empty input fails before replacing an existing destination.
- The old policy fails the same byte-equality check despite identical content.

The test is included in `npm test`. The full family suite passes with the
pristine pinned framework checkout:

```sh
WASM_GAME_FRAMEWORK_DIR=/tmp/rtcw-mp-checkpoint.0sgo75/wasm-game-framework npm test
```

The normal sibling framework checkout has separate in-progress changes; the
strict framework pin was not relaxed to accommodate them.

Generated artifacts with this Python/zlib toolchain:

| Pack | Bytes | SHA-256 |
| --- | ---: | --- |
| `mp_wasm.pk3` | 15,518 | `7879152998808fb8d2c43c08445c94ef864adb84b31c30f151f3fffabf20e95e` |
| `sp_wasm.pk3` | 2,051 | `21ea3803ef2754b3bd5c44a68f77e0dfd5f667da0f14041c0de585d0c6af5aac` |

This is a build-reproducibility fix, not a renderer change or a promise of
identical compressed bytes across different zlib implementations. Generated
source menu packs were refreshed by the normal static test; deployed packs,
native binaries, owner data and both live RTCW containers were not replaced.
The user-confirmed single-player renderer remains untouched.
