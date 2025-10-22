# DOOM WASM Assets

This folder stores the `doom.wasm` binary and browser loader consumed by the
console minigame.

## Provenance

- Upstream source: [`diekmann/wasm-fizzbuzz`](https://github.com/diekmann/wasm-fizzbuzz)
  `doom/` at commit `51a7030bea563d96027301a36619c17347b9270d`.
- Local changes: see `patches/0001-chaos-and-majesty-doom-wasm.patch` for the
  exact modifications applied during the Chaos & Majesty build (audio bridge,
  menu updates, wasm toolchain tweaks, and music playback shim).
- Build steps and packaging guidance live in `docs/doom.md`.

## Licensing

The DOOM engine is licensed under GPL-2.0-or-later. A copy of the license ships
with this repository as `COPYING`. Any redistribution of `doom.wasm` must
include:

1. The GPL text (`COPYING`).
2. The complete corresponding source, which you can regenerate by applying the
   patch above to the upstream repository and following the documented build
   steps.

If you further modify the engine, add your changes either to the existing patch
or as additional patches in this directory and document the update in
`docs/doom.md`.
