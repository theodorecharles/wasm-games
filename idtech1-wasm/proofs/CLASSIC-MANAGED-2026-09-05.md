# Managed Classic bots — 2026-09-05

Original and Smooth now have a managed two-bot deathmatch implementation using
real native Crispy clients. This supersedes the prototype-only status in
[the earlier checkpoint](CLASSIC-BOTS-2026-09-05.md), whose results and hashes
remain historical. Browser engines and the synchronized command protocol are
unchanged. This is first-map deathmatch acceptance, not campaign completion.

## Implementation

- The supervisor starts a Chocolate relay and two native clients in slots 0/1,
  then reports readiness only after both clients see the two-player lobby.
- Bots alone do not launch. The native controller starts an eight-second grace
  period after the first human joins; a second human can enter slot 3 before
  launch. The first human is slot 2. Classic cannot admit ordinary new players
  after synchronized play starts, so late POSTs and WebSocket upgrades reject
  explicitly instead of leaving a browser waiting indefinitely.
- Browser WebSocket peers alone count as humans. Idle sleep, bot/relay failure,
  and failed startup stop all owned children and remove only the generated
  session directory. A fresh wake produces a fresh lobby and match token.
- Network audio is enabled. The waiting lobby is reported as a menu, not
  gameplay. A gameplay-start capture request was added, but actual Chrome
  automatic capture still fails; physical click capture works.
- The AI still emits ordinary movement, aim, attack, Use and respawn commands.
  It does not modify actors, physics, damage, pickups, synchronized RNG, or
  consistency bytes. Native weapon pickup/out-of-ammo selection remains in
  charge; custom weapon preferences are **not implemented**.
- Read-only telemetry now includes attack tics, opponent frags, deaths, weapon
  and every active player's health. Chex native clients discover the packaged
  `chex.deh` through `DOOMWADPATH`, without writing owner data or applying it twice.
- Packaging includes three native executables and source/binary manifests.
  The tested candidate overlays the previous live image. The canonical full
  eight-image build script was updated but was not executed in this checkpoint.

## Verification

[Native results](classic-managed-native-2026-09-05.json) contain report summaries
and hashes of complete raw reports under `/tmp/idtech1-classic-managed.NY8E7w`.

- All seven titles × Original/Smooth pass real managed WebSocket joins with
  native movement, firing and nonzero PCM callbacks. These diagnostic clients
  use fake presentation/audio destinations; they are not browser acceptance.
- Two simultaneous real Wasm clients (Original + Smooth) enter slots 2/3 and
  play a four-player Doom II match. Bot and relay termination both clean up all
  children and permit fresh two-bot wake. Repeated missing-binary startup
  failures leave no relay or session-directory leak.
- Explicit stale/late Classic WebSocket rejection passes in the Doom II
  follow-up; rejected sockets do not inflate human count or wake a stale match.
- The final two-bot, 60-second combat matrix passes six of seven titles. Doom
  fails to acquire/attack within that minute. **That failure is retained.** The
  same final Doom binary passes a separate 180-second `--require-frag` test:
  bot 0 has 3 opponent frags / 4 deaths, bot 1 has 4 frags / 3 deaths. This is
  bounded endurance evidence, not a guarantee of fast encounters or all maps.
- The 32-case single-player native regression, adapter/static checks, and
  Modernized Doom II audio/match-selection regression pass.

[Actual Chrome evidence](classic-managed-chrome-2026-09-05.json) records all
fourteen Original/Smooth first-map joins, three native players in each, the
eight-second lobby, rendered gameplay, click capture, Escape release, and
48 kHz WebAudio suspended-to-running transitions. Screenshots were inspected
through Chrome control; running WebAudio is not audible listening acceptance.
Audio events were saved for thirteen candidate combinations; Doom II Original's
events are from the separately recorded port-8010 join on the identical image.

Physical firing is visible in the tested families. Important exceptions to
overclaiming the short sweep: the first Doom II attempt occurred while dead
(a later physical respawn/fire check consumed ammo and showed a muzzle flash);
the first Chex screenshots and TNT Smooth caught weapon raising with ammo 50.
Longer Chex Smooth firing consumed ammo to 45/44. Chex Smooth physical W taps
moved y from -1602 to -1606 while health stayed 100. Sustained held-key movement
remains unaccepted. Two-human admission is native/WebSocket evidence, not two
Chrome tabs. Automatic countdown-to-game capture remains open across all cases.

## Artifacts and deployment

Candidate image: `sha256:2f91f270c09d62957501c7ede74e60131bf1388d70150f809e98db3a655e0775`.
Previous image / rollback tag:
`local/idtech1-wasm:before-classic-managed-2026-09-05`,
`sha256:28359634e0a1412b59a93b7022d0efed8c936c1e0d1074080536767ee04bdc35`.

| Installed component | SHA-256 |
| --- | --- |
| Adapter | `2a0ce4d085a9f2ad67757b1405ca6e89b12761396649a61982cffb299042a9d7` |
| Supervisor | `889f88c6da1ced185b1f20f0bd350408ccd3f6599c5df7e05df0882af241a85d` |
| Managed Classic module | `25f649c61e4d7161159a5e47a25f72626b71fd343504dc869bf22ac165232325` |
| Doom bot | `0a2741912feca9d6b8a5658fe3564a3b6196d05f58bbb81b6bc17ed293ab723d` |
| Heretic bot | `5f0e52cf059e0e1f033178d059bf634bcfe8266d6fc0a9cd5821523d8f74b473` |
| Hexen bot | `24d53edc7f882c68c0a19da6e2311ddd5eab57ac158ee1d668aeb423b290bc29` |

Only the idle `idtech1` Compose service was replaced, with container
`8d2e9bca755d5f92d6b5a428b49df941d2965aefb142d0ad47de3932ee862c74`.
Pre/post lab image audits pass; the inventory comparison shows all 31 other
service IDs unchanged. Served adapter/supervisor/module hashes match the tested
candidate. Actual Chrome at port 8010 joins Doom II Original with two bots,
renders MAP01 and a pistol muzzle flash, consumes ammo to 43 at health 100,
starts WebAudio, captures on click and releases to the menu with Escape.
The disposable candidate container was stopped after testing. Owner data,
browser engine artifacts, framework, Blood, RTCW and other services are outside
this deployment's changes.

A byte comparison against the rollback image confirms all 28 files across
`/opt/game-site/dist`, `/opt/shared-shell`, `/opt/zandronum` and the Chocolate
server executable are unchanged. Final static/package checks and the scoped
whitespace check pass. The test tab was returned to the launcher, the WebAudio
observer disabled, and the normal five-minute live idle timer completed at
`2026-09-05T04:52:53.825Z`: sleeping, zero humans/peers/bots, no native bot or
relay process, and no leftover generated match directory.

Remaining acceptance: automatic capture/resume, sustained keyboard controls,
audible listening, fullscreen, longer/multiple-map bot quality and campaigns.
Blood's unreproduced pitchfork crash remains deferred at the user's request.
