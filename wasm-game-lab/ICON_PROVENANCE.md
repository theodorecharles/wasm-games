# Icon provenance

`icon-provenance.json` is the exact machine-readable inventory. `validate.sh`
checks every byte hash, verifies each locally available source copy, and rejects
any portal icon that is not inventoried.

Most icons are copied byte-for-byte from an installed game or a pinned native
source tree. Prey uses the original icon from the pinned Prey2006 source, and
OpenRCT2 uses the official source-native project icon. The
NES, SNES, PlayStation, and PlayStation 2 icons are copied byte-for-byte from
the system identities authored by `emulation-wasm`; they are not game artwork,
ROMs, or firmware. Three deliberate fallback cases remain:

- All nine DOS variants use the source-native DOSBox icon. Their installed
  sources provide no standalone authentic icon that can be redistributed
  outside the game-data boundary, and the canonical DOSBox family manifest
  makes the same fallback.
- CoD2 uses the CoD2 project's diagnostic glyph because neither the inspected game
  installation nor the current clean-room source boundary provides an icon.
- Chex Quest uses the canonical id Tech 1 Doom-family icon because no authentic
  local/source Windows icon was found.

`counterstrikesource.ico` is retained only so the audit records the old mistake:
it is byte-for-byte Counter-Strike 1.6's icon. No CS:S shortcut exists because
the current Source-family repository does not support that title.
