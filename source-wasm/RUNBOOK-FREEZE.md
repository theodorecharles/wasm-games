# Source Wasm G-Man renderer handoff — 2026-08-17

Product status: **Still in development**

## Mission and acceptance gate

Continue from the current private browser factory until Chromium shows the
actual `d1_trainstation_01` G-Man intro through Source's WebGL renderer. Menu,
loading-screen, cursor, solid-clear, or console screenshots do not count.

Completion requires one headed Chromium run that has all of the following:

- `readEngineState()` reports native `gameplay` for
  `d1_trainstation_01`; do not infer it from GameUI visibility or a canvas;
- the live Source canvas visibly contains a recognizable G-Man and 3D intro
  scene from the authored intro camera;
- the same run has no fatal JavaScript `RuntimeError` or WebGL error that
  aborts subsequent frames; and
- the screenshot is saved privately as
  `/home/ted/Desktop/hl2-gman-intro-proof.jpg`.

Keep that screenshot out of Git, Docker images, packages, and public
artifacts. Do not change the product label after this screenshot alone; this
gate proves the immediate renderer target, not the whole product acceptance
matrix.

## Current truth

The menu has rendered for many revisions and New Game can load
`d1_trainstation_01`, but that is not the requested proof. Work paused after
headed Chromium tests v310 and v311. There is still no valid proof screenshot,
and `/home/ted/Desktop/hl2-gman-intro-proof.jpg` must not be created from the
current distorted or black frames.

The verified progression is:

- v292 reached the authored camera, 59 visible leaves, 118 renderables, and
  `g_bTextMode=0`, then aborted in the optional world-shadow path;
- v293 and later bypassed that optional browser shadow callback and continued
  through real world/studio rendering;
- v301 reached real G-Man studio mesh/material draws, then failed in eye-glint
  setup;
- v302 bypassed the unsupported eye-glint path and completed `DrawModel`;
- v303 forced a white studio ambient cube. Source-backbuffer probes then read
  real lit skin colors, proving shaders and G-Man textures were executing;
- v304 made the browser swapchain opaque and exposed real, lit, textured
  G-Man geometry, but it was exploded into giant triangles;
- v305-v309 disabled flexes, forced CPU/software skinning, cleared depth, and
  converted the dynamic-VB/static-IB draw to BaseVertex 0 plus a stream byte
  offset. The Source backbuffer still contained bright G-Man pixels;
- v310 combined that CPU-skinned path with an opaque `Present`. Chromium
  visibly showed lit G-Man skin textures on severely exploded triangles. It
  had no JavaScript `RuntimeError`; this is strong renderer evidence but is
  **not recognizable G-Man proof**; and
- v311 removed only the forced software-skin override while retaining
  `STUDIORENDER_DRAW_NO_FLEXES`, white ambient, depth clear, and opaque
  presentation. Static hardware-skin studio draws returned without a runtime
  error, but both the Source pixel probes and visible canvas were black.

The private served artifact and source tree are currently at v311. In the
source tree, the temporary `m_Config.bSoftwareSkin=true` assignment has been
removed. Therefore the first resume action is not to retest v293: treat v310
as the last visible diagnostic and v311 as the clean hardware-path A/B.

The immediate fault is now isolated to studio geometry preparation/addressing:
the CPU path produces visible but corrupt geometry, while the packed hardware
path produces no visible fragments. Presentation, lighting, model/material
lookup, basic shader execution, and the retail G-Man index ranges have all
been demonstrated. Do not spend the next loop on localization, menu layout,
cursor offset, HUD, motion blur, or adding retail assets.

## Repository and owner-data rules

`AGENTS.md` is authoritative. In particular:

- Never commit or place into a container image the leaked Source tree, retail
  Valve data, generated engine JS/WASM, ISO contents, or private screenshots.
- Ship only source patches, the adapter, manifests, and the pinned framework.
  Never vendor `source-engine`.
- The user supplies the 2017 ToGL/TOGLES tree, Steam Half-Life 2 on
  `steam_legacy`, and the 2014 GOTY/Collectors ISO. The declared combine recipe
  is the 2014 extract plus only the `steam_legacy` shaders and approved shader
  adjunct.
- Keep owner files on `/data` or in a private cache. Private Desktop and `/tmp`
  review trees are evidence, never repository inputs.
- Do not contact or submit changes upstream.
- Keep `wasm-game-framework` pinned to 0.9.6 and its `v0.9.6` commit.
- Do not author downstream HTML, CSS, service workers, or web manifests.
- Product status labels are exactly `Live` or `Still in development`.
- A failed or missing native start is never playable. Report only native truth
  from `readEngineState()`.

The current working tree is already dirty and contains user work. Do not reset,
discard, or overwrite unrelated changes. Do not commit this handoff.

## Architecture verdict

The public working port's important architectural choice is the right durable
direction: use an Emscripten `MAIN_MODULE` executable and preserve Source's
logical shared libraries as separate `SIDE_MODULE`s. Load each module through
the engine's normal module boundary so each engine/client/server/material
module retains its own factory list, interface registry, global objects, and
teardown lifetime.

The current all-in-one static WebAssembly image merges logical DLLs. Whole
archives plus `--allow-multiple-definition` can make the image link, but they
do not preserve module-local identity. The observed failures are exactly what
that architecture predicts:

- a logical module's `DisconnectTier2Libraries()` clears Tier2 pointers used
  by every other merged module;
- module-local factory and interface globals can collide or resolve to the
  wrong instance;
- nonvirtual calls can land in merged thunks with a null target; and
- globals such as `g_bTextMode` can inherit the wrong logical module's state.

For the immediate screenshot, keep narrow, marked browser guards if they are
needed to expose the next failure. Do not mistake those guards for the final
architecture. After the G-Man proof, move the build toward
`MAIN_MODULE`/`SIDE_MODULE` parity before broadening gameplay claims or trying
to remove every symptom from the monolith. Do not copy another port's
generated artifacts or owner data; port only the build/module design and
independently authored source patches.

Useful public design references supplied by the user:

- <https://slqnt.dev/blog/hl2-in-web>
- <https://news.ycombinator.com/item?id=48669534>

## Verified inputs: stop treating assets as the primary blocker

The private owner-data audit found the required first-map content healthy:

- `d1_trainstation_01.bsp`, its world materials, and baked lightmaps are
  present and readable;
- the G-Man studio model payload is present and structurally valid;
- the intro choreography/VCD and referenced audio are present;
- the required materials and the legacy shader binaries are present; and
- the combined shader set passes the expected version-6 check.

The owner bridge's indexed, range-capable, lower-case-alias path remains the
correct data route. Continue to block native libraries, `glshaders.cfg`,
symlinks, traversal, and undeclared retail overlays. Do not add more Steam or
ISO data as a renderer experiment. The evidence now reaches a populated BSP
world list, real G-Man materials, and real studio draw calls, so an absent map,
lightmap, model, or shader package is not the current first-order explanation.
The runtime still prints `Scene 'scenes/npc/Gman/gman_intro.vcd' missing!`
despite the private asset audit finding that VCD on disk. Treat that as a later
owner-bridge/string-table/lifecycle resolution bug; it does not explain the
current exploded static pose, and it must be repaired before claiming the
talking scene is complete.

## Renderer fixes already established

These items are compiled/code-reviewed in the private tree. Preserve them
while testing, then promote them into marked, fail-closed repository patches
only after the headed result is known.

### Tier2 material-global teardown

Instrumentation in `CRender::Push3DView` showed both `materials` and
`g_pMaterialSystem` becoming null inside the live renderer. In a monolithic
image, one logical DLL's `DisconnectTier2Libraries()` cleared the shared Tier2
global block for all DLLs.

The current proof-tree mitigation is:

- expose the concrete `g_MaterialSystem` from
  `materialsystem/cmaterialsystem.cpp` through a browser-only singleton
  accessor;
- make `DisconnectTier2Libraries()` a browser no-op in `tier2/tier2.cpp`; and
- rebind `materials` and `g_pMaterialSystem` from that singleton in
  `CRender::FrameBegin`.

This changed the run from an in-frame abort to repeated complete 3D frame
traversal. It is evidence of the merged-module lifetime bug, not a substitute
for real `SIDE_MODULE` ownership. Keep the mitigation narrow and do not apply
it to native builds.

### WebGL static-buffer staging

WebGL draw calls require offsets into bound GL buffers; ToGL's client-memory
pseudo buffers and `glMapBufferRange` assumptions are not valid browser
semantics. The current `togles/linuxwin/cglmbuffer.cpp` browser path:

- forces vertex/index buffers to real GL buffers (`m_bPseudo=false`);
- allocates an aligned CPU staging block for each normal lock;
- uploads the dirty lock range with `glBufferSubDataMaxSize()` on unlock;
- frees and nulls the staging pointers after upload; and
- frees an outstanding staging block in the destructor.

Keep the existing discard/orphan behavior and bounds assertions. Do not leave
client pointers live after unlock, and do not revert to pseudo buffers merely
to avoid a WebGL validation error.

### BaseVertexIndex emulation

WebGL 2 has `drawRangeElements` but not the desktop
`glDrawRangeElementsBaseVertex` entry point used by ToGL. Dropping
`BaseVertexIndex` and calling plain `glDrawElements` selects the wrong vertex
range and was a real correctness bug.

The reviewed fix touches `public/togles/linuxwin/glmgr.h`,
`togles/linuxwin/glmgr_flush.inl`, and `togles/linuxwin/glmgr.cpp`:

- carry base vertex as a signed value;
- include it in the Emscripten vertex-attribute cache key;
- rebase every active attribute byte offset by
  `BaseVertexIndex * streamStride` using 64-bit intermediate arithmetic;
- keep bounds/nonnegative assertions; and
- issue `glDrawRangeElements` with the original index data after rebasing.

Native `glDrawRangeElementsBaseVertex` stays unchanged. A negative base vertex
is valid only when every resulting attribute offset remains nonnegative;
otherwise index-buffer rewriting is required. The repository patcher still
contains an older browser substitution that discards the base vertex and says
WebGL 2 lacks `DrawRangeElements`. That statement and substitution are stale
and must be replaced by the reviewed three-file fix before fresh-tree parity.

### Text-mode draw gate

`Shader_DrawWorldLists` legitimately returns without drawing when
`g_bTextMode` is true. The merged browser image carried a stale/colliding
logical-module value into gameplay. A diagnostic browser assignment in
`SCR_UpdateScreen` now keeps the gameplay render gate false. v292 verifies
`text=0` at `R_DrawWorldLists`; this blocker is no longer hypothetical.

Do not delete the `g_bTextMode` gate globally or alter native behavior. For the
monolithic proof path, initialize the engine-owned value explicitly and log it
at the world-draw boundary. The durable solution is module-local state through
`SIDE_MODULE`s.

### World shadow material-context callback/null thunk

With camera, PVS, world lists, and renderables proven, v292's first world draw
stopped in `CShadowMgr::RenderShadowList`. That optional RTT-shadow path called
`CMatRenderContext::GetMaxVerticesToRender`, whose nonvirtual delegate entered
the merged-image `CShaderAPIDx8::GetMaxVerticesToRender` thunk with a null
target/callback. This is not evidence of missing BSP geometry, lightmaps, or
shaders.

The v293-and-later path skips only the two
`g_pShadowMgr->RenderShadows()` calls under `EMSCRIPTEN` in
`engine/gl_rsurf.cpp`: the opaque `Shader_WorldEnd` path and the translucent
surface path. Native keeps both calls. This guard was enough to expose later
world and studio draws; it is no longer the first unverified candidate.

### Studio proof path and visible v310 result

The private tree contains a deliberately narrow renderer bootstrap. It creates
a client `C_BaseAnimating` with `models/gman_high.mdl`, places it at the map's
G-Man origin, and draws it directly after the world. The normal scene/render
fanout, projected shadows, translucent effects, and several collided merged-
module callbacks are gated in the browser build. This is diagnostic scaffolding
only; it cannot by itself satisfy the authored-intro acceptance gate.

The following browser-only interventions were necessary to get as far as
v310:

- skip the unsupported eye-glint setup after the real eye meshes are reached;
- force a white six-face ambient cube because the reduced entity bootstrap
  does not establish the scripted dynamic G-Man lights;
- add `STUDIORENDER_DRAW_NO_FLEXES`. The source model's on-disk flags lack
  `STUDIOHDR_FLAGS_FLEXES_CONVERTED`, and the public working-port write-up also
  disabled facial animation;
- clear depth before the direct proof model while world/entity ordering is
  narrowed;
- for the CPU-skinned dynamic-VB/static-IB path, encode the dynamic ring
  segment in stream byte offset and draw with BaseVertex 0; and
- after the Source texture is blitted to the default WebGL framebuffer, clear
  destination alpha only to 1. Native D3D swapchain alpha is not browser
  window transparency; before this clamp, correct RGB could composite black.

With those interventions, v310 visibly rasterized real, lit G-Man textures but
with exploded triangles. The logged face groups match the retail VTX exactly:

| group | vertices | indices | observed draw range |
| --- | ---: | ---: | --- |
| face 0 | 1027 | 5784 | start 0, end 1026 |
| face 1 | 716 | 3657 | start 0, end 715 |
| face 2 | 95 | 429 | start 0, end 94 |

This exonerates gross index counts/ranges and proves presentation, textures,
lighting, and shader execution. It does not prove the bytes uploaded to the
GPU or the final vertex declaration/offsets are correct.

### Current v311 fork

The current source tree has the temporary software-skin force removed from
`studiorender/studiorender.cpp`. v311 therefore uses the model's static
hardware-skin VB/IB, BaseVertex 0, while flex stays disabled. Every observed
G-Man draw returned and no JavaScript `RuntimeError` occurred, but the source
pixel probes were black and Chromium showed no model.

Do not discard the opaque-present, ambient, no-flex, staging, or signed-base
fixes when resuming. To reproduce the only visible geometry, temporarily
restore the scoped software-skin force around `CStudioRender::DrawModel`, then
restore its previous value after the draw. The next task is to make that CPU
path coherent, not to re-open the already-cleared menu or presentation bugs.

## Authored G-Man camera and lifecycle

The map audit identified the correct minimal 14-entity graph: G-Man actor/head,
fog controller, black and left-eye `point_viewcontrol`s, intro logic/relay,
scene relays and scene entity, zoom controllers, train light, a unique
`logic_auto`, and `info_player_start`.

Key timeline evidence:

- initial/player proof view: approximately
  `-14576 -14208 -1300`;
- black view and first scene trigger: about `t+6.0`;
- authored left-eye camera activation: about `t+6.1`, origin
  `-14576 -13880 -1212`, angles `-9 93 0`;
- authored scene playback trigger: about `t+9.0`; and
- v292 confirmed the authored proof camera, 59 visible leaves, and 118 client
  renderables.

The later studio-isolation builds are not currently using that full acceptance
path. They create a direct client proof model and use a backed-away diagnostic
camera near `-14568 -14030 -1235`, angles `-8 93 0`, FOV 50. That camera was
chosen only to see whether corrupt geometry could become recognizable. It and
the direct model must be removed or bypassed for the final proof run, returning
to the authored left-eye camera above.

Keep lifecycle work conservative in the merged image. A virtual `Activate()`
through a collided `cycler_actor`/generic-actor vtable is unsafe. If that path
recurs, use a class-local browser override that calls the known base
implementation, or omit only the unsafe optional activation during the proof
bootstrap. Do not bypass model spawn, transmit, client-leaf registration, or
scene start merely to produce a static fake.

The public reference port disabled facial animation. Perfect flex/mouth
animation is not a prerequisite for the first renderer screenshot, but the
frame must still be recognizably the real G-Man intro and the authored scene
must be active. The current runtime's missing-VCD message also means a static
direct G-Man, even once coherent, is an intermediate renderer proof only.
Document facial animation as a later limitation rather than silently claiming
it.

## Ordered execution plan for Luna

### 1. Re-establish the exact paused state

Read this file and `AGENTS.md` first. Do not clean the Desktop, reset the private
tree, or rebuild owner data. Verify the existing runtime:

```bash
docker ps -a --filter name=source-wasm-real-v26-run
docker start source-wasm-real-v26-run   # only if it is stopped
```

The currently served build is v311. Open headed Chromium through the installed
browser-control extension and use a fresh cachebuster:

```text
http://127.0.0.1:18106/?game=hl2&cb=v311-resume-check&source-wasm-map=d1_trainstation_01
```

Click the framework Play button once, wait about 7 seconds, and confirm the
known baseline: native state is `gameplay` on `d1_trainstation_01`, G-Man studio
draws return, no `RuntimeError` appears, and the canvas/source probes remain
black. Do this once only; v311 is already a diagnostic result, not a candidate
to iterate blindly.

If the container no longer exists, recreate it with the same image, ports, and
read-only owner mounts recorded under “Current private build/test locations.”

### 2. Return to the visible CPU-skinned fork

In `studiorender/studiorender.cpp`, temporarily save
`m_pRC->m_Config.bSoftwareSkin`, set it true for `DrawModel`, and restore it on
exit. Retain `STUDIORENDER_DRAW_NO_FLEXES`, white ambient, depth clear,
BaseVertex-0/index-override offset, and opaque Present. Build as v312 with the
command below and confirm it reproduces v310's visible exploded skin triangles.

This reproduction is the anchor. If it unexpectedly becomes black, inspect
the cachebuster/build artifact and Present-alpha clamp before changing studio
math.

### 3. Instrument the CPU vertex path, one frame only

The leading suspect is no longer BaseVertex arithmetic. Add bounded logs for
the first G-Man face group at these exact boundaries:

1. Immediately before `meshBuilder.FastVertex` in
   `studiorender/r_studiodraw.cpp`, log the first/last transformed position,
   finite/NaN status, and min/max position over the group. Values should remain
   near G-Man's world origin (roughly `-14576 -13860 -1277`) with a human-sized
   spread, not enormous magnitudes.
2. Log `sizeof(ModelVertexDX7_t)`, `sizeof(ModelVertexDX8_t)`, computed vertex
   format size, dynamic VB `VertexSize()`, lock `m_nFirstVertex`, and computed
   stream byte offset. These sizes must agree.
3. In `CGLMBuffer::Unlock`, for that vertex buffer only, log GL handle,
   destination offset, byte count, a small byte/FNV hash, and the first three
   uploaded floats.
4. In `FlushDrawStates`, log each active attribute's stream, stride, declared
   offset, stream offset, final byte offset, GL handle, and buffer size.
5. Drain existing GL errors immediately before the G-Man draw, issue the draw,
   then sample once. `0x502` means WebGL rejected an attribute/index range;
   earlier errors must not be misattributed.

Interpretation:

- bad/NaN CPU positions: inspect pose matrices and the scalar/SSE skinning
  transform before touching GL;
- good positions but bad staging bytes: fix `FastVertex` packing or the lock
  stride;
- good uploaded bytes but wrong final offsets: fix dynamic stream addressing;
- all values correct with no GL error: hash the actual static index-buffer
  bytes at construction and upload, not only the draw count/range.

The Emscripten change that routes `FastVertex` to `FastVertexSSE` in
`public/materialsystem/imesh.h` is a high-risk candidate. A/B it with a safe
fieldwise/uncompressed writer after collecting the size/byte evidence. Also A/B
`g_bDisableStaticBuffer=true`; the per-lock browser staging path now works and
can eliminate overwrite in the shared 2 MiB scratch buffer.

### 4. Use the robust fallback if the mixed VB/IB path stays corrupt

For the quickest recognizable renderer proof, add a browser-only studio path
that creates one fresh dynamic, uncompressed mesh and copies both:

- the expanded CPU-skinned vertices; and
- the selected group's `pGroup->m_pIndices`.

Draw it with no vertex override, no index override, BaseVertex 0, no flex, no
compressed attributes, and no bone-uniform dependency. This removes the four
remaining interacting risks at once: packed hardware declarations,
dynamic-VB/static-IB addressing, base-vertex emulation, and shader bone
constants. Keep it clearly marked as proof scaffolding.

If instead repairing the v311 hardware path, first force uncompressed studio
vertices before hardware mesh creation. The packed path uses `SHORT2` weights,
`UBYTE4` normal/user data, and byte bone indices; a WebGL normalization/BGRA
decode mismatch can make every skinned vertex disappear. Then inspect the
`vcbones` uniform upload. This is secondary to the dynamic CPU fallback because
v310 already proves that CPU-transformed geometry can reach pixels.

### 5. Return from diagnostic model to authored intro

Once a coherent direct G-Man is visible, restore the authored camera
`-14576 -13880 -1212`, angles `-9 93 0`, FOV 40. Then remove/bypass the direct
client proof model and re-enable the selected 14-entity scene path. Confirm:

- `readEngineState()` says `gameplay` and the map is
  `d1_trainstation_01`;
- `logic_auto` schedules at about `t+0.2`;
- black camera/scene relay fires around `t+6.0`;
- left-eye camera fires around `t+6.1`;
- `scene2_lcs_intro` starts around `t+9.0`; and
- the runtime no longer reports the on-disk G-Man VCD as missing.

Keep facial flex disabled if necessary for stability, but do not call a static
proof actor the talking authored intro.

### 6. Capture the acceptance proof

After a candidate works, hard-refresh a unique cache-busted URL in the headed
Chromium tab and run from launcher to authored intro again. Confirm native
`gameplay`, the map name, authored camera/scene activity, stable subsequent
frames, and no fatal runtime error. Capture the browser viewport only after
G-Man is clearly recognizable and save it to:

```text
/home/ted/Desktop/hl2-gman-intro-proof.jpg
```

Inspect the saved file before reporting success. A copied reference image,
synthetic overlay, menu image, debug texture, or stale screenshot is invalid.
Keep the product status **Still in development**.

### 7. Promote the proven changes into the repository patch system

The current private tree contains experimental changes that are not all
represented faithfully by `scripts/apply-source-patches.mjs`. After the proof:

1. convert only the necessary fixes into stable
   `SOURCE_WASM_PATCH_*` transformations and `patches/files/` payloads;
2. replace the patcher's stale base-vertex-dropping substitution with the
   reviewed three-file emulation;
3. include the static-buffer staging, Tier2 lifetime mitigation, text-mode
   initialization, and narrow shadow guards only to the extent the headed run
   proves them necessary;
4. remove or compile-gate temporary per-frame diagnostics;
5. run the patcher against a fresh user-supplied compatible tree, then run it
   again and require zero changes; and
6. build from fresh Waf outputs and repeat the same Chromium proof.

Commands from the repository:

```bash
npm test
git diff --check
node scripts/apply-source-patches.mjs --check "$SOURCE_ENGINE_ROOT"
node scripts/apply-source-patches.mjs "$SOURCE_ENGINE_ROOT"
node scripts/apply-source-patches.mjs --check "$SOURCE_ENGINE_ROOT"
```

An unknown source shape must fail without partial writes. Do not use the
unrelated `source-engine-master` checkout as the clean 2017 ToGL baseline.

### 8. Then implement the durable module boundary

Once the screenshot regression is reproducible from repository patches, make
the build produce a pinned `MAIN_MODULE` plus the logical Source
`SIDE_MODULE`s. Verify, module by module:

- factory/interface lookup returns the module's intended singleton;
- Tier2 connect/disconnect affects only the owning module;
- client/server/engine game-system and entity registries remain distinct;
- material/shader API pointers do not require singleton rebinding;
- `g_bTextMode` comes from the engine instance rather than a merged symbol;
- exports needed by `source_wasm_*` and dynamic calls are retained; and
- the framework 0.9.6 adapter contract and native state API remain unchanged.

Retire monolith-only bypasses only after the side-module build repeats the
same G-Man proof. A successful link is not runtime acceptance.

## Current private build/test locations

These paths are local evidence only and must never be committed or used as
shipped inputs:

- private engine proof tree:
  `/home/ted/Desktop/source-engine-patch-review-v12`
- private served site:
  `/tmp/source-wasm-game-site-v25.CSOjTe/game-site`
- current runtime container: `source-wasm-real-v26-run`
- current build image: `source-wasm-wasm:runbook-review-v26`
- headed test port: `18106` (`8088` in the container)
- auxiliary port: `18202` (`8201` in the container)
- currently served factory: v311 hardware-skin A/B; the source tree has the
  temporary software-skin force removed

A current proof build has used:

```bash
docker run --rm --name source-wasm-build-vNEXT \
  -v '/home/ted/Desktop/source-engine-patch-review-v12:/inputs/source:rw' \
  -v '/tmp/source-wasm-game-site-v25.CSOjTe/game-site:/opt/game-site:rw' \
  -e SOURCE_ENGINE_ROOT=/inputs/source \
  -e SOURCE_WASM_WEB_DIR=/opt/game-site \
  -e SOURCE_WASM_LOOP_DEBUG=1 \
  --entrypoint sh source-wasm-wasm:runbook-review-v26 \
  -lc 'unset SOURCE_WASM_TRACE; /opt/source-wasm/scripts/build-web.sh'
```

Use a unique explicit container name for each build. Do not overwrite owner
inputs or move generated JS/WASM into this repository.

If the named runtime container is deleted rather than merely stopped, recreate
its existing private mount contract (do not change source/owner contents):

```bash
docker run -d --name source-wasm-real-v26-run \
  -p 18106:8088 -p 18202:8201 \
  -v '/tmp/source-wasm-game-site-v25.CSOjTe/game-site:/opt/game-site:ro' \
  -v '/home/ted/.steam/debian-installation/steamapps/common/Half-Life 2:/inputs/steam:ro' \
  -v '/home/ted/Desktop/Half-Life 2 Collectors Edition (2153).iso:/inputs/iso/hl2.iso:ro' \
  -v '/home/ted/.local/share/source-wasm/docker-v26-data:/data:rw' \
  -v '/home/ted/Desktop/source-engine-patch-review-v12:/inputs/source:rw' \
  -e SOURCE_WASM_SKIP_COMPILE=1 \
  -e SOURCE_ENGINE_ROOT=/inputs/source \
  -e SOURCE_WASM_WEB_DIR=/opt/game-site \
  source-wasm-wasm:runbook-review-v26
```

The last controlled Chromium URL was:

```text
http://127.0.0.1:18106/?game=hl2&cb=v311-hardware-skin&source-wasm-map=d1_trainstation_01
```

Always change `cb=` after rebuilding. The framework Play button was near
viewport coordinate `750,598` at 1280x720 when semantic selection was not
available. Wait at least one second after navigation before clicking it.

## Cleanup after proof

Do not delete Desktop folders during the active renderer loop. After the proof
and patch-parity audit, inventory exact paths and distinguish the user's
original inputs from agent-created review copies. Preserve the original engine
tree, Steam install, ISO/extract, `/data` publication, current proof tree until
fresh-tree parity, and the private proof screenshot. Only agent-created,
superseded review/build directories may be moved to recoverable trash, and
their exact targets must be confirmed before doing so. Never use a broad
recursive Desktop deletion.

## Contradictions retired by this handoff

- Reaching the main menu or native `gameplay` state is not renderer proof.
- The old v246 motion-blur/dark-lighting diagnosis is not the latest blocker.
- The first-map owner assets are verified; adding more retail data is not the
  current fix path.
- WebGL 2 does provide `drawRangeElements`; it does not provide ToGL's desktop
  base-vertex draw, so base vertex must be emulated rather than discarded.
- Whole-archive monolithic linking is a proof bridge, not the correct module
  ownership model.
- The v293 shadow guard was passed; the current fault is later in studio
  geometry.
- v310 proves visible G-Man pixels, not recognizable G-Man geometry.
- v311 proves the hardware/static A/B is black; it is not a regression to the
  menu or map loader.
- The current direct client model and backed-away camera are diagnostics, not
  the authored intro acceptance path.
- No recognizable G-Man renderer screenshot exists yet, so the only truthful
  product status remains **Still in development**.
