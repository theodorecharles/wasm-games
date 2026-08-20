# Native core audit

Audit date: 2026-08-14. Only primary project repositories, their build files,
and their license files were used for source selection. Every selected revision
is immutable in `source-lock.json`.

## Selection rule

A candidate must be maintained, native C or C++, buildable without a desktop
GUI, and usable behind a small Emscripten host. An existing web port is not a
source for JavaScript glue, HTML, CSS, or prebuilt artifacts. Proof that a core
has run under Emscripten is useful evidence, but this project still creates its
own platform layer.

## NES: Nestopia JG 1.54.0

Repository: <https://gitlab.com/jgemu/nestopia>

Nestopia JG is the de facto maintained core branch identified by the Nestopia
UE project. It builds a static archive, uses ISO C++, and exposes The Jolly Good
API instead of binding the emulation core to FLTK, SDL, or a browser UI. That is
a smaller and more repeatable seam than carrying the standalone Nestopia UE
desktop frontend.

Initial media support should be `.nes`, `.unf`, and `.unif`. Famicom Disk
System support is a later policy because it adds `.fds` media and
`disksys.rom`. Standard cartridges do not require firmware.

Verified build evidence: the locked source builds a 2.4 MB
`libnestopia-jg.a` archive with Emscripten without source modifications.

Primary blocker: implement and link the shared JG Emscripten host, then confirm
every mapper-facing file operation works against the virtual filesystem. This
is the lowest-risk variant.

## SNES: bsnes-jg 2.1.1

Repository: <https://gitlab.com/jgemu/bsnes>

bsnes-jg is current, cycle-accurate, C++11, supports a static JG archive, and
uses the same core ABI as Nestopia JG. It avoids Snes9x's non-commercial terms
and keeps one host contract across the 8-bit and 16-bit variants.

Initial media support should be uncompressed `.sfc` and `.smc`. Super Game Boy,
BS-X, Sufami Turbo, and cartridge coprocessor firmware are separate follow-up
policies. The first browser milestone deliberately uses the core's balanced
defaults rather than accuracy options that add firmware or CPU load.

Verified build evidence: the locked source builds a 6.9 MB `libbsnes-jg.a`
archive with Emscripten. It requires the vendored samplerate build and a
repeatable creation of an object directory omitted by the upstream rule; no
source patch is required.

Primary blockers: exercise the compiled `libco` path in a browser, measure the
cycle-accurate core at 60 Hz, and choose an audio buffer that does not build
latency. The software framebuffer itself is straightforward.

## PlayStation: Mednafen JG 1.32.1.2

Repository: <https://gitlab.com/jgemu/mednafen>

Mednafen's PS1 core is mature, software-rendered, and already has a maintained
JG wrapper with DualShock, GunCon, Justifier, multitap, and force-feedback
descriptions. It can therefore reuse the same browser host while the adapter
supplies PS1-specific input and disc policy. PCSX-ReARMed remains a fallback if
the Mednafen interpreter cannot sustain frame time in a browser.

The first media policy should accept an atomic CUE/BIN set and a firmware file.
CHD can follow once random-access reads are proven without expanding the image
into memory. Memory cards, settings, and states belong in the persistent mount;
disc tracks do not.

The project-owned Emscripten patch uses the pinned tree's internal Zstandard
and minilzo implementations. The first media milestone is CUE/BIN, so it omits
the FLAC-only track reader. The shared browser host mounts one validated 512
KiB firmware image under Mednafen's three regional aliases, loads the selected
atomic disc entry, maps DualShock buttons and axes, and keeps memory-card and
state paths under framework persistence.

Remaining release gates are sustained 60 Hz measurement without a dynamic
recompiler, real-disc compatibility coverage, audio timing, memory growth, and
runtime verification of memory-card and save-state restore. The build now
limits the upstream archive to its PS1 module. CHD and entries outside the 1
GiB whole-file cache envelope wait for bounded random-access media. Atomic
CUE-relative bundle validation is implemented downstream on the framework 0.9
media-library contract.

## PlayStation 2: Play! 0.77

Repository: <https://github.com/jpd002/Play->

Play! is the practical PS2 choice. It is actively maintained, has a permissive
core license, has a built-in high-level system implementation, and its official
tree demonstrates that the native engine can be compiled by Emscripten. PCSX2
has wider desktop compatibility, but its performance architecture, desktop
render backends, and JIT assumptions make it a much worse first browser target.

This project does not use `js/play_browser`, `Source/ui_js`, generated
`Play.js`, or generated `Play.wasm`. The source checkout is used only for the
native EE, IOP, GS, and shared framework code. A new host connects that core to
`wasm-game-framework` persistence, media, audio, display, and controllers.

Primary blockers:

1. A disc can be several gigabytes. Copying one into MEMFS is not acceptable,
   and a 32-bit WASM address space cannot be treated as a disc cache.
2. The framework needs an OPFS or HTTP range-backed random-access media handle
   so the core can read sectors without materializing the complete image.
3. The non-JIT execution path needs real frame-time measurement. A build that
   reaches a boot screen but cannot maintain usable speed is not a release.
4. The GS renderer needs a WebGL 2 or WebGPU seam owned by this repository.
5. Memory cards, states, and settings must flush independently of disc caching.
6. Controller analog values and rumble requests must survive the framework
   normalization layer without being reduced to booleans.

PS2 remains the highest-risk variant. The source choice is credible; a playable
browser result is not assumed. The exact release gates and the two limitations
documented by the selected core are detailed in
[`PS2_FEASIBILITY.md`](PS2_FEASIBILITY.md).

## Excluded candidates

- Nestopia UE's desktop repository is maintained, but its project explicitly
  points core-emulation work to Nestopia JG.
- Snes9x is portable and active, but its current terms add a non-commercial
  restriction. bsnes-jg gives this repository a clearer distribution model and
  the same ABI as NES and PS1.
- DuckStation's current source and build terms are unsuitable for a downstream
  build-and-patch repository.
- PCSX-Redux is active and capable, but its development-focused UI and large
  dependency graph are a less direct runtime core than Mednafen JG.
- PCSX2 remains a fallback research source, not a WebAssembly build base.
