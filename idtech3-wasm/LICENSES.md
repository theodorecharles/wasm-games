# License map

This family workspace contains components under their upstream licenses:

- QuakeJS and ioquake3 engine/QVM changes: GPL-2.0-or-later. See the pinned
  upstream repositories in `sources.lock.json`.
- ioRTCW engine changes: GPL-3.0-or-later. The exact patch retains
  upstream authorship and license notices.
- Wolfenstein: Enemy Territory (`games/wolfet`): GPL-3.0-or-later. ET: Legacy
  engine patches and the Node host retain their upstream notices.
- Small Node supervisors and adapters retain the license declarations in their
  package/source files.

Game data is not distributed by this repository. Quake III Arena and Return to
Castle Wolfenstein data must be supplied separately. Enemy Territory's official
Splash Damage archive is downloaded into `/data` at runtime.
