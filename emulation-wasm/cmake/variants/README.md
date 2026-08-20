# Variant definitions

A variant file is added only when its native host compiles. It must create a
real `EMULATION_CORE_TARGET` from the locked native source and set
`EMULATION_HOST_SOURCES` to the corresponding host implementation.

Do not add a library that paints a test pattern or returns a manufactured menu.
Use a small test cartridge/executable outside Git for early core verification,
then test real frame, audio, input, and persistence behavior.

The NES, SNES, and PS1 definitions should build static Jolly Good core archives
with `vendor/jolly-good-api/include` on the include path. The PS2 definition
must not reference any path listed under Play!'s `excludedFromBuild` lock.
