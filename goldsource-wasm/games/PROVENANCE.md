# Artwork provenance

The four SVG launcher icons and backgrounds in this directory are original,
abstract artwork created for this browser wrapper. They are not extracted from
Half-Life, its expansions, or Counter-Strike and may be redistributed with the
rest of this project.

Authentic per-title PWA icons are deliberately not stored here. The owner-data
packager extracts each installed game's `game.ico` (or `cstrike.ico`) and
creates exact 192px and 512px PNGs outside the repository. The framework
manifest exposes those two validated files only after that variant is fully
provisioned. They never enter Git or a container image.
