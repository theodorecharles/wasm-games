# Canonical family migration

`build-wasm` was created as a history-preserving, no-hardlink clone of the clean
`blood-wasm` commit `3356b79cf4c4e054cddefaa161d672bf5108cbb1`. Its inherited
history retains the native NBlood/EDuke32 provenance and the earlier Blood
browser work. The clone has no Git remotes.

The existing `/home/ted/Development/wasm/blood-wasm` checkout was not moved,
deleted, or modified. Retire it only in a later explicit maintenance step after
consumers have moved to this family repository.

## Consumer mapping

- Former Blood suite or `blood-wasm` consumers use the locked `blood-wasm`
  image from this repository. Blood data filenames and the `/data` persistence
  mount remain compatible, while the browser cache namespace is now
  `build-blood-retail`.
- Duke Nukem 3D consumers use the locked `duke3d-wasm` image and provision the
  exact 1.3d data policy at `/data`.
- Family consumers use `build-wasm` and select `blood` or `duke3d`.

All images install the same framework-owned launcher and service worker. No
downstream HTML, CSS, web manifest, service worker, game data, or generated
native artifacts are migrated into Git or image layers.
