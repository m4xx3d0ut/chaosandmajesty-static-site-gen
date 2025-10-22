# DOOM WASM Integration

This project embeds the shareware build of DOOM inside the console minigame. The
runtime expects the wasm binary (`doom.wasm`) under
`static-sitegen/assets/doom/`.

## Building the assets

1. Run `./scripts/build-doom.sh`. By default the script downloads the published
   wasm artefact from the
   [wasm-fizzbuzz GitHub Pages](https://diekmann.github.io/wasm-fizzbuzz/doom/).
   - Set `DOOM_SOURCE_DIR` to copy from a local checkout (after building the
     wasm artefact yourself).
   - Set `DOOM_WASM_URL` to override the download location.
2. Re-run `./build-site.sh` (or `ENABLE_DOOM_BUILD=1 ./build-site.sh` to let the
   build invoke the helper automatically) and `make serve-local`. Launch
   `play doom` from the console to verify.

## Runtime notes

- The loader looks under `assets/doom/` relative to the current page. Override
  `window.cmDoomConfig.assetBase` if you host the assets elsewhere.
- WebAssembly support, audio auto-play, and performance vary across devices.
  The terminal prints a friendly message when the browser is unsupported.
- `exit doom` tears down the game and restores the terminal display.

## Licensing

- The original DOOM shareware data is © id Software. Ensure you only ship the
  redistributable shareware WAD when sharing builds.
- The wasm port inherits the GPL/other licensing from the upstream project.
  Consult the upstream repo for details.

## Source provenance & GPL compliance

- Upstream engine sources come from [`diekmann/wasm-fizzbuzz`](https://github.com/diekmann/wasm-fizzbuzz)
  (the `doom/` directory) at commit `51a7030bea563d96027301a36619c17347b9270d`.
- Chaos & Majesty specific changes (audio worklet bridge, save-system hooks,
  toolchain upgrades, and music playback) are recorded in
  `static-sitegen/assets/doom/patches/0001-chaos-and-majesty-doom-wasm.patch`.
- The repository ships the GPL text as `COPYING`. Keep that file with every
  distribution that includes `doom.wasm`.

Whenever you change the engine or supporting runtime, update the patch file and
add a short bullet to this section noting the change and date.

## Regenerating `doom.wasm` from source

The build depends on Rust (with the `wasm32-unknown-unknown` target installed),
clang/llvm 12, Binaryen’s `wasm-opt`, and the DOOM shareware WAD (not included).

1. Clone the upstream repo and check out the recorded commit:
   ```bash
   git clone https://github.com/diekmann/wasm-fizzbuzz.git
   cd wasm-fizzbuzz/doom
   git checkout 51a7030bea563d96027301a36619c17347b9270d
   ```
2. Apply the Chaos & Majesty patch bundle:
   ```bash
   git apply /path/to/static-sitegen/assets/doom/patches/0001-chaos-and-majesty-doom-wasm.patch
   ```
3. Provide `doom1.wad` (shareware data) next to the Makefile. The patch keeps
   the WAD unmodified; fetch it from the official shareware drop.
4. Build:
   ```bash
   rustup target add wasm32-unknown-unknown
   make doom.wasm
   ```
   Or run the helper script which encapsulates the steps above (including
   Binaryen download):
   ```bash
   DOOM_WAD_PATH=/absolute/path/to/doom1.wad ./scripts/rebuild-doom.sh
   ```
5. Copy the resulting `doom.wasm` into `static-sitegen/assets/doom/` and keep
   the patched source tree archived (e.g., `tar czf doom-source.tar.gz doom/`)
   alongside any distributed binaries.

## Release checklist

- Include `COPYING` and the source archive (or a public URL that serves it) in
  the same place you publish `doom.wasm`.
- Update `static-sitegen/assets/doom/patches/` whenever you modify the engine.
- Verify `docs/doom.md` references the correct commit hash and patch filename.
