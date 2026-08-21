# Counter-Strike multiplayer host

`start.sh` launches the pinned Xash3D-FWGS dedicated Counter-Strike host and WebRTC bridge. The derived host image installs pinned YaPB 4.4.957 as the standalone game DLL, including its `de_dust2` navigation graph. Its defaults match the browser adapter's local bridge fallback (`127.0.0.1:4190`), start `de_dust2`, and maintain nine bots.

For another machine on the LAN, set the advertised address before starting:

```sh
CS_PUBLIC_IP=192.168.1.50 ./runtime/counter-strike/start.sh
```

Set `CS_BOTS=0..15` and `CS_BOT_DIFFICULTY=0..4` to change the bot roster and difficulty. `build-host-image.sh` verifies the YaPB release SHA-256 before building; `start.sh` builds it automatically when absent.

Open the browser game with `?game=counter-strike`. For a non-default bridge, add `&server=host:port`. Stop the companion with `./runtime/counter-strike/stop.sh`.
