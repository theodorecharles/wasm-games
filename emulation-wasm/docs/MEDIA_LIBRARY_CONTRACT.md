# Media-library integration

This repository consumes the generic private media library released by
`wasm-game-framework` 0.9.4. Format logic remains entirely in
`web/data-validator.mjs`; the framework does not recognize console systems,
extensions, CUE sheets, tracks, cartridges, or disc images.

## Declarative suite

`web/wasm-game-data.json` defines four variant policies:

- NES accepts one cartridge entry, up to 64 MiB, cached as the selected entry.
- SNES accepts one cartridge entry, up to 64 MiB, cached as the selected entry.
- PS1 provisions three fixed firmware files and accepts either one CHD or one
  atomic CUE plus every referenced track. Browser materialization is capped at
  2 GiB.
- PS2 accepts one structurally validated ISO into container storage but sets
  `maxBrowserCacheBytes` to zero. Runtime launch therefore fails closed until a
  range-backed random-access filesystem exists.

The container stores an entry in a private staging directory, verifies every
declared byte, executes `validateConsoleMediaBundle()`, and atomically renames
the set into the visible library only after acceptance. Launcher lists contain
an opaque entry ID, label, aggregate size/count, timestamp, and allowlisted
`system`, `format`, and `fileCount` values. They do not contain host paths or
raw filenames.

## Adapter boundary

The adapter calls:

```js
const media = await context.dataClient.media.load();
```

The result contains the selected entry, validated primary relative name,
mount-ready entries, validation result, and its private versioned cache. Only
that entry remains in the browser cache. Selection changes clear the old entry.
NES, SNES, and currently bounded PS1 media can mount read-only through
`mountOwnerFiles(..., { preservePaths: true })`.

Normal deployments keep the console selector followed by the media selector.
An optional `?game=<variant>&media=<entry-id>` URL opens a known entry directly,
while `WASM_GAME_MEDIA=<entry-id>` locks a deployment to that entry and hides
only the media selector. Unknown explicit IDs fail closed.

The NES and SNES adapter makes the runtime surface visible in a loading state
before SDL creates its window. This is required because a hidden canvas has
zero layout dimensions. The framework then supplies 4:3 CSS dimensions through
the adapter resize callback; SDL owns its matching canvas backing store.

`MEDIA_SELECTION_REQUIRED` returns control to the launcher. A
`MEDIA_RANDOM_ACCESS_REQUIRED` result is a hard runtime gate. It must lead to an
OPFS or verified HTTP-range adapter that exposes bounded native reads; it must
not be bypassed by copying a multi-gigabyte image into MEMFS or WASM linear
memory.

## Remaining media work

- Add an authenticated administrator removal API only if deployment management
  actually needs it; 0.9 intentionally has no public deletion route.
- Design and test the framework random-access contract before PS2 runtime work.
- Decide whether PS1 CHD should use that range path even below 2 GiB.
- Add firmware-region selection after the Mednafen host can report the selected
  disc region reliably.
