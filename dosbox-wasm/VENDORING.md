# DOSBox source provenance

`vendor/dosbox` starts from the official DOSBox 0.74-3 source release named
`dosbox-0.74-3.tar.gz` from the DOSBox SourceForge project.

- SHA-256: `c0d13dd7ed2ed363b68de615475781e891cd582e8162b5c3669137502222260a`
- Upstream license: GPL-2.0-or-later
- Upstream submission: prohibited for this downstream browser adaptation

The Emscripten changes are intentionally local and guarded by
`__EMSCRIPTEN__`: SDL compatibility, inert physical-CD access, safe yielding
between native CPU timeslices, deterministic SDL audio underrun output, native
queued controller input, runtime diagnostics, and the portfolio's default WASD
mapping. Autotools generated
files were refreshed with `autoreconf -fi` after changing `configure.ac`; that
is why generated `configure`, `Makefile.in`, and helper files differ from the
release archive as well.

Jill of the Jungle files are not part of the vendored source and must never be
added to this repository or a container image.
