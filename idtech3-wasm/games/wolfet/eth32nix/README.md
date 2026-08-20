# ETH32NIX (compiled into WolfET)

Port of [eth32nix-rabbmod](https://github.com/rabb/eth32nix-rabbmod)
into the ET: Legacy browser client. There is no injector, detour, or
offset table — the aimbot, wallhack/ESP, and settings UI compile into
cgame and toggle with the console command `aimbot`.

Arcade-only. Vanilla mode refuses the command and the `cl_aimbot` cvar.

| Command | Effect |
| --- | --- |
| `aimbot` | Toggle the full ETH32NIX layer |
| `aimbot on` / `aimbot off` | Force on or off |
| `aimbot menu` / `aimbotmenu` | Toggle the in-game settings UI |

Defaults match rabbmod `settings.ini` (normal aim, always-on, head
priority, ETPro hitboxes, wallhack + name/class ESP, radar).
