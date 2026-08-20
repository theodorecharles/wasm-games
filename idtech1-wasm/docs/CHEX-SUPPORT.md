# Chex Quest support patch

The original Chex Quest data requires `chex.deh`. The build downloads the
tiny support archive from the `/idgames` mirror at
`https://www.gamers.org/pub/idgames/themes/chex/chexdeh.zip`, pins its SHA-256,
and stages only `chex.deh` beside the browser engines.

The archive's `chexdeh.txt` identifies Simon Howard as the author and states:
“You may do anything you like with this file. I don't claim any copyright on
it.” The downstream image does **not** contain `CHEX.WAD`; the WAD remains
the installed game data or may be obtained separately from the Chex Quest 3
project's public download page.
