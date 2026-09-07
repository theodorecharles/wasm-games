# Source-note preservation — 2026-09-05

Eight source-preparation scripts still deleted every `*.md` file inside their
checkout. This could remove upstream runbooks, edited READMEs and untracked
local reproduction notes. WolfET ran the deletion in an EXIT trap, including
failed setup attempts.

Removed those deletions from DOSBox, emulation sources, OpenRCT2, id Tech 2,
DSDA Doom, libtess2, WolfET and CoD2. The earlier Wolf3D repair already preserves
its notes. Existing deleted files were not restored or overwritten, and no
prepared tree was cleaned or reset.

Run `node scripts/test-source-notes.mjs` from the workspace root. The regression
checks all nine scripts for the removed deletion pattern and shell syntax.
It then creates a disposable local-only clone of the pinned DOSBox source,
edits its README, adds nested local notes and runs the real preparation script
twice. All four note fixtures survive byte-for-byte. The removed `find` command
destroys the fixtures in the negative control, only inside that disposable clone.

The actual first-run/idempotent execution coverage is DOSBox. The other eight
scripts have static/syntax coverage here, not complete setup/build execution.
No engine source patch or runtime image changed for this fix.

See [machine-readable evidence](../dosbox-wasm/proofs/source-notes-2026-09-05.json).
