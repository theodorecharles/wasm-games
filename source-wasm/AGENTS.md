# Source-family repository rules

- Never commit or image retail Valve data or the leaked Source engine tree. Owner files stay on `/data` (or a private cache). The engine tree is supplied at run time by the user.
- Ship only patches, the adapter, manifests, and the pinned framework. Do not vendor `source-engine`.
- End users must provide three inputs: their leaked 2017 ToGL/TOGLES tree, Steam Half-Life 2 on `steam_legacy`, and the 2014 GOTY/Collectors ISO. Shaders come from `steam_legacy` and are overlaid on the 2014 extract.
- Do not contact or submit changes upstream.
- Pin the browser contract to wasm-game-framework 0.9.6 and its `v0.9.6` commit.
- Do not author downstream HTML, CSS, service workers, or web manifests.
- Product status labels are exactly `Live` or `Still in development`.
- Do not describe a missing or failed native start as a playable game. Report only native truth from `readEngineState()`.
