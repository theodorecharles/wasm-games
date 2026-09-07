# Counter-Strike host checkpoint — 2026-09-04

Status: native host-error recovery and signaling portability repaired and
deployed. **Not a Chrome gameplay pass. The original model-overflow cause
remains open.** No existing portfolio status labels were changed.

The [September 5 Chrome follow-up](COUNTER-STRIKE-CHROME-2026-09-05.md)
supersedes the browser-closed/join gap below with actual live and isolated
Chrome evidence, and adds an explicit-endpoint policy repair in a separate
candidate. The live image identities here remain unchanged.

## Findings and changes

The old image reproduces the reported dead-match/live-bridge failure: after a
developer-injected `host_error`, native `status` says `no server running.`, the
process remains alive, and the bridge still returns HTTP 200. Docker's restart
policy cannot recover a process that has not exited. The pinned
[engine error handler](https://github.com/theodorecharles/xash3d-fwgs/blob/f85aa0c8f7d46c27191132b44d872c8e331308de/engine/common/host.c)
cleans up the match and aborts the current frame rather than terminating.

The managed-host-only patch adds opt-in `-exit-on-host-error`: after normal
match cleanup, exit with status 1. The rebuilt Go wrapper propagates Xash's
return code. The entrypoint opts in, and both the lab and standalone launcher
use `unless-stopped` recovery. Explicit stop remains stopped; explicit start
can resume the retained stopped container. There is no log-grep watchdog,
periodic forced restart, or blanket increase to model limits.

The three distinct native `MAX_MODELS` checks previously printed the same
message. They now identify their function and requested filename. A separate
15-transition investigation across `de_dust`, `cs_italy`, `de_inferno`,
`de_nuke`, and `de_dust2` returned stable model counts (219, 280, 326, 268,
and 214 respectively). The committed regression repeats three of those maps.
This weakens a simple map-rotation leak hypothesis; it does **not** explain
the historical overflow. Injecting `host_error` tests recovery, not that cause.

Signaling moved from 4190 to **4192/TCP**; WebRTC remains **4191/TCP+UDP**.
Port 4190 is on the [Fetch blocked-port list](https://fetch.spec.whatwg.org/#port-blocking),
and Node 24's WHATWG Fetch rejected it with `bad port` before any connection.
The inspected [Chromium port list](https://raw.githubusercontent.com/chromium/chromium/main/net/base/port_util.cc)
does not list 4190, so this is a portability repair, not proof of the original
Chrome timeout's cause. No browser restrictions were disabled. Adapter
fallback, standalone defaults, lab shortcut, Compose binding, and validation
now agree on 4192. Old explicit `?server=127.0.0.1:4190` bookmarks need updating.

## Evidence

- [Recovery report](counter-strike-recovery.json): two real native host-error
  recoveries under Docker `on-failure:3` (therefore requiring nonzero exit),
  changed process start times, authoritative `de_dust2`/four-bot status after
  each restart, stable repeated-map model counts, explicit stop, and explicit
  restart through `start.sh`.
- [Legacy negative control](counter-strike-recovery-legacy.json): the previous
  image remains alive with no native server and HTTP 200 after the same error.
  Its `passed` field means the expected broken behavior was reproduced, not
  that the old host recovered.
- `npm test --prefix goldsource-wasm`: adapter, package, native-host build/pin,
  and fallback-port contracts pass.
- `npm run test:cs-bridge --prefix goldsource-wasm`: real WHATWG Fetch and
  WebSocket requests on 4192 pass and receive `v1:offer` with a data-channel SDP.
  This does not establish ICE completion, a connected player, or Chrome play.
- Full native C/Go image compilation and exact patch application pass. The
  YaPB binary is unchanged from the previous host.
- All 13 browser support/native artifacts are byte-identical to the preceding
  log-selection image. The frontend changes only the bridge fallback; its
  framework bootstrap remains the previously tested local logger repair.
- Live host: nine bot connection messages, no startup Host_Error/permission
  failure, native server-start message, bridge HTTP 200, and admin still disabled
  (503). Live frontend: expected adapter bytes, all four owner-data gates ready,
  and non-public `/data`. Served portal shortcut selects 4192.
- Pre/post `./validate.sh --images` passes. Container-ID comparisons show only
  GoldSource and its Counter-Strike support host changed; RTCW and all other
  lab services were preserved. No owner-data mounts or volumes were removed.

Temporary investigation/build logs are under
`/tmp/goldsource-host-recovery.1h5adH/`. Test containers were removed after their
reports; the live host was never fault-injected.

## Identity and rollback

| Item | Identity |
| --- | --- |
| Native engine source | `f85aa0c8f7d46c27191132b44d872c8e331308de` |
| Patched engine tree | `43c9e99a25630e33d38762e71a265b3145e0f16c` |
| Go bridge source | `12dd859883276081fb58952b1af3b1068de6b3bf` |
| Patched bridge tree | `7cac043b3fbaf3699c8f3ebff93e179285d4e991` |
| Host image | `sha256:a108d96bbddf632160cef0d597ef4c87dcf1927fa4d0eaa5f1f9237493d00997` |
| Host tags | `local/goldsource-host:recovery-candidate`, `wasm-games/counter-strike-yapb:4.4.957` |
| Host container | `29e8cdf04d92994a9a1c6f8b2d380bd84f88020ba8126b3a9ab309ebb6bbda5d` |
| Previous host image (retained) | `sha256:124e7c0d66f2b92d88476b669a49601b8ac03c2392a14dd6611359b7ee328527` |
| Frontend image | `sha256:c20b2d218bc26c41b040863616a3d29beb5f2dd72ff53a6154558d9b5530fdcd` |
| Frontend tags | `local/goldsource-wasm:cs-host-recovery-candidate`, `goldsource-wasm:dev` |
| Frontend container | `72b2f55f3cea65f0dbd72bf0f780c9cfe4232bddeaca0f08820ed05a4966802d` |
| Previous frontend image (retained) | `sha256:f181cc4382acbba690827d2929b3a1b65fd844eb942bd6d95ffe4268697c09ff` |
| Native host executable SHA-256 | `2b18e8dd844764ef650f7cf6ae40f63b164bd16fa1c2d4372c721f9beaff3277` |
| Frontend adapter SHA-256 | `3aaa46fdcc213209fa26bcfd8aa0b65aac9cefd178ee8c390aa05e5dd7e81c0b` |
| Bootstrap SHA-256 (unchanged) | `7c6b91d5f1fa69c7132f39b576f77e6b26b9d4ec461e81c0bda9f6f53d52eb33` |

`patches/xash-managed-host-error.patch` SHA-256:
`7c40dead2936909f1ec1f860a11b35d9e7d32067bd3503ddd06419edffcd5dfc`.
`patches/webxash-host-exit-code.patch` SHA-256:
`71ab77de10503b07817b8db7796f4a9a303807d441d15b8919b49739dd467119`.

The native host rebuild uses the existing pinned base image for its data and
the same YaPB archive; it does not fetch a replacement game installation.
The frontend retains exact framework 0.9.6/`ebb1ebe` plus the documented local
logger patch. No framework release was published or portfolio pins changed.

Rollback must be targeted and audited. Restoring the old frontend also restores
its old fallback port; keep Compose and the explicit portal bridge URL aligned.
Do not bulk-restart the lab or remove data. The prior host can also run on 4192
through its `ADDR` environment setting, so recovery rollback does not require
reintroducing the blocked signaling port.

## Remaining work

1. Chrome join/render/input/audio acceptance and reconnect after a controlled
   isolated host restart. Chrome remains closed pending reopening permission.
2. Reproduce the historical `MAX_MODELS` initiating error; use the new function
   and filename diagnostics if it recurs. Do not mark the crash item resolved
   merely because service now recovers.
3. GoldSource HL/BS/OF mouse look and expansion startup acceptance; the browser
   native artifacts were intentionally unchanged in this host-focused pass.
