# Third-party notices

The browser adapter bundles the following npm artifacts, locked by
`package-lock.json`:

- `xash3d-fwgs` 1.2.2 (`1.2.2+commit.7c58854` in the package metadata), whose
  wrapper package declares MIT and whose bundled Xash3D-FWGS engine core is
  GPL-3.0; the focused framework build uses native commit
  `f85aa0c8f7d46c27191132b44d872c8e331308de`;
- `hlsdk-portable` 0.1.2 (`0.1.2+commit.5fae1fb`), MIT;
- `cs16-client` 0.1.2 (`0.1.2+commit.15278ca`), MIT;
- esbuild 0.25.5, MIT, used only to bundle the site artifacts.

The first three packages are distributed from the Xash3D-FWGS WebAssembly
package project documented at <https://github.com/yohimik/webxash3d-fwgs>.
They contain engine/SDK code and Xash support data, not the retail Valve game
files required to play. Their declared license and exact registry integrity
values are retained in the npm lockfile.

This downstream was migrated from the `x8BitRain/webXash` frontend base. No
upstream submission or network contact is performed by the build.
