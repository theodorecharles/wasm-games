# Build-engine browser proofs

`mouselook.json` records clean Google Chrome launches of Blood E1M1 and Duke
Nukem 3D's L.A. Meltdown episode. Real browser mouse movement is recorded at
the shared native Build input accumulator, then proven at the game layer:
Blood reports nonzero turn and vertical-look commands plus a changed player
angle, while Duke reports changed player yaw and horizon.

The run also covers the embedded-browser fallback used when Chrome declines
pointer lock: framework-normalized relative motion still reaches the native
mouse path, while ordinary browsers continue to use pointer lock.

The proprietary game data is owner-supplied at runtime and is not stored in
this repository.
