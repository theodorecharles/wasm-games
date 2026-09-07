# Counter-Strike multiplayer host

## Current Game Lab / Trashcan deployment — 2026-09-07

The maintained Game Lab now uses the verified
`local/windows96:counter-strike-host-20260907` image and the GoldSrc signaling
gateway, not a direct browser connection to the host's HTTP port. Open
`http://127.0.0.1:8017/?game=counter-strike`; no `server=` override is needed.
The old direct4192/admin port is no longer published. Local RTC transport keeps
4191/TCP+UDP. Trashcan's private `/counter-strike/` route uses the same gateway,
with RTC transport bound to4.20.69.67:28140/TCP+UDP. Public TLS/ICE/NAT acceptance
and a real browser join remain pending; an HTTP or signaling offer is not proof
of gameplay.

Both hosts preserve the accepted native engine, YaPB library and graph, run
nine bots on de_dust2, and use uid1000, read-only roots, dropped capabilities,
one CPU and768MiB. Only bot configuration/log/training directories are writable
bounded tmpfs. These remain always-on hosts, not idle-managed servers; disposable
bot learning resets on recreation. The old normal-lab runtime is retained
privately under the workstation migration directory's `goldsource-local-before`.
No owner game data was deleted or packaged into a new layer.

`server/supervisor.cjs` exposes only game signaling, rejects wrong origins and
wrong variants, honors the framework password session, limits payloads/peers,
and never forwards native admin/config/console routes. See the portfolio's
`VM-RETIREMENT-RUNBOOK.md` and Game Lab `deploy/steam/goldsource-release.json`.
For local gateway tests, install its pinned dependency with
`npm ci --prefix server --ignore-scripts` from the GoldSrc root, then run
`npm run test:gateway` and `npm run test:cs-cleanup`.

## Legacy standalone launcher

`start.sh` launches the pinned Xash3D-FWGS dedicated Counter-Strike host and WebRTC bridge. The derived host image installs pinned YaPB 4.4.957 as the standalone game DLL, including its `de_dust2` navigation graph. Its defaults match the browser adapter's local bridge fallback (`127.0.0.1:4192`), start `de_dust2`, and maintain nine bots.

Signaling uses **4192/TCP**, with WebRTC still on **4191/TCP+UDP**. The old
4190 signaling port is on the [Fetch blocked-port list](https://fetch.spec.whatwg.org/#port-blocking)
and is rejected by conforming clients. Update old `?server=127.0.0.1:4190`
bookmarks to port 4192; do not disable browser port restrictions.

For another machine on the LAN, set the advertised address before starting:

```sh
CS_PUBLIC_IP=192.168.1.50 ./runtime/counter-strike/start.sh
```

Set `CS_BOTS=0..15` and `CS_BOT_DIFFICULTY=0..4` to change the bot roster and difficulty. `build-host-image.sh` verifies the YaPB release SHA-256 before building; `start.sh` builds it automatically when absent.

Open the browser game with `?game=counter-strike`. For a non-default bridge, add `&server=host:port`. Stop the companion with `./runtime/counter-strike/stop.sh`.

The current source honors a nonempty explicit `server=` selection: if that
bridge fails, the launcher reports its error instead of joining a different
host. Only root-path HTTP loopback development retains implicit local fallback;
public or prefixed pages never try a service on the player's own computer.
Historical evidence is in the [Chrome checkpoint](../../proofs/COUNTER-STRIKE-CHROME-2026-09-05.md);
the current deployed release is the September7 image above.

## Native host-error recovery

The host is rebuilt from pinned engine commit `f85aa0c8` and bridge commit
`12dd8598`, with the exact downstream patches recorded in `../../sources.json`.
It keeps the existing pinned base image's game-data layer and YaPB release.
No replacement game installation is downloaded by the native build.

`start-yapb.sh` enables `-exit-on-host-error`. After an unrecoverable native
match error, Xash cleans up and exits with status 1; the Go wrapper propagates
that status instead of leaving a live HTTP/WebRTC bridge with a dead match.
The lab and standalone launcher use Docker's `unless-stopped` policy to restart
the complete host on its configured starting map. A deliberate operator stop
stays stopped. `start.sh` can restart its existing stopped container when the
requested image matches; it does not silently replace an existing container.

This is recovery, not proof that the historical `MAX_MODELS` initiating bug is
fixed. Model-limit errors now identify the overflowing function and requested
filename to make a future occurrence diagnosable. Single-player/browser Xash
builds do not apply the host-only patch.

Run the native recovery integration against a built candidate:

```sh
CS_SERVER_IMAGE=local/goldsource-host:recovery-candidate \
  npm run test:cs-recovery -- --output /tmp/cs-recovery.json
```

It creates only fresh disposable containers on loopback ephemeral ports, has no
owner-data mounts, checks stable same-map model counts, injects a developer-only
`host_error` twice, and verifies process restarts plus native map/bot status.
It also verifies that explicit stop remains stopped. This is not a Chrome join
or gameplay test. `--expect-stalled` diagnoses the old image's dead-match/live-
bridge behavior without calling it a recovery pass.

After `stop.sh`, the stopped container is retained for explicit restart and
inspection; automatic removal is incompatible with Docker's restart policy.
