# TODO

## Task 1 – Terminal enhancements ✅

Console now understands richer commands with the updated help prompt:
```
$ ?
$ Available commands:
$ ---
$ help, ?            Show this menu
$ latest <alias>     Fetch the latest dispatch
$ top <N>            Fetch the top N dispatches (default 3)
$ search <term>      Search dispatches for a term
$ random <N>         Pull N random dispatches (default 3)
$ profile <alias>    Reveal a dossier
$ theme <contrast|1337> Switch console contrast
$ theme toggle       Flip the current contrast mode
$ clear              Purge terminal output
$ ↑ / ↓              Browse command history
```

- `top`, `search`, and `random` hydrate from the generated dispatch feed and render in pages of three with narrative headers.
- `profile` supports alias pools for both operators (paul, pk, paulkolesa, m4xx3d0ut, th34rch1t3ct // renee, rr, rk, matica, matica8, reneerules).
- `theme contrast`, `theme 1337`, and `theme toggle` control the neon/soft contrast without leaving the console.

Further polish ideas: surface hidden posts behind a `--all` flag, add autocomplete hints, and let `search` accept tag filters like `tag:infra` once we curate metadata.

## Task 2 – DOOM wasm integration plan

we found additional resources for the wasm build: https://github.com/diekmann/wasm-fizzbuzz
- main will be suitable branch
the official doom shareware sources: https://github.com/id-Software/DOOM
- master branch
a working example of doom wasm fizbuz here: https://diekmann.github.io/wasm-fizzbuzz/doom/

1. **Evaluate port sources**
   - Confirm the WASM fork’s licensing and ensure we stick to the redistributable shareware WAD.
   - Review the upstream build scripts (expect Emscripten + SDL); pick a stable commit/tag and record it.
   - Decide if we vendor prebuilt `doom.wasm`/loader or build locally/CI; document choice in `docs/`.

2. **Provision build pipeline**
   - Add `scripts/build-doom.sh` that downloads the published wasm artefact (or copies from a local checkout) into `static-sitegen/assets/doom/`.
   - Update `build-site.sh` (or Make target) to invoke the script once, with checksum guard so rebuilds are optional.
   - Adjust `.gitignore` / repo policy for the generated binaries (track if stable and <25 MB, otherwise fetch on demand).

3. **Wire into console runtime**
   - Extend terminal commands: `play doom` mounts the game; `exit doom` tears it down.
   - When launched, swap the terminal output pane with a canvas container while keeping the prompt below.
   - Lazy-load the wasm loader via dynamic `import()` or injected `<script>`; if load fails, surface error text.
   - Capture focus/keyboard for the canvas and provide on-screen instructions and exit control.

4. **UI/UX shell**
   - Style the canvas to live within the existing console frame (fixed height matching terminal); include optional pixel scaling buttons.
   - Provide overlay text for controls (WASD, space, ESC) plus a “Back to console” action.
   - Ensure theme toggles/color modes don’t interfere with the game container styling.

5. **Runtime constraints**
   - Check wasm memory footprint and gate command for narrow/mobile viewports if perf is poor.
   - Handle audio unlock (require explicit click before starting); fallback message if WebAssembly unsupported.
   - Validate graceful teardown so subsequent terminal commands still behave normally.

6. **Testing & docs**
   - QA checklist: run `play doom`, verify load, exit, re-entry; test theme toggle during gameplay.
   - Optionally stub loader for automated tests that confirm command routing without full wasm load.
   - Document setup and maintenance in `docs/doom.md` (build instructions, upstream commit, asset sources).
