# Read-only native runtime repair —2026-09-07

Native startup testing during normal Lab reconciliation reproduced a real
Modernized multiplayer failure: Zandronum exited255 before loading its map,
reporting that it could not create `~/.config` on the read-only filesystem.
The launcher, assets, owner-data API and sleeping health checks all passed;
those checks did not prove the dedicated engine could actually start.

The pinned native source's `m_specialpaths.cpp:GetUserFile` uses
`NicePath("~/.config/")`. `cmdlib.cpp:NicePath` resolves that path using
`getpwuid(getuid())`, not HOME or XDG_CONFIG_HOME. uid1000 in this Ubuntu-based
image has home `/home/ubuntu`.

Normal Game Lab's suite and all seven private Trashcan deployments now provide:

```text
/home/ubuntu/.config:rw,nosuid,nodev,noexec,uid=1000,gid=1000,mode=0700,size=8m
```

This is an ephemeral container tmpfs, not a bind over a host home directory.
The root remains read-only and the service remains uid1000, cap-drop ALL, nnp,
1CPU/1GiB/128pids. No engine binary, owner data, credential or HOME value changed.
The deployment configuration is canonical in the Lab's `compose.yaml` and
`deploy/steam/generate-candidate.mjs`; the engine image stays unchanged.

Lab `deploy/steam/verify-idtech1-native.mjs` requires `--exercise-local` or
`--exercise-private`. Both14-case runs pass: seven game selections times Classic
and Zandronum. Classic observes the real three native processes and two waiting
lobby bots. Zandronum observes real native startup and map-load readiness; the
API's declared bot count is not independent bot-count evidence. All native
processes are uid1000. Each touched, player-free service is restarted afterward
and checked for zero native processes and no Classic temporary sessions.

The normal suite's nine owner files and private copy match preserved hashes
after testing. Exact image/served-artifact and deployment receipts, config backup
paths, all39 private-route rechecks, and remaining work are in the portfolio's
`VM-RETIREMENT-RUNBOOK.md`. Browser rendering, input, audio and save/reload
acceptance remain open. Historical browser proofs above are not new-image proof.
