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
