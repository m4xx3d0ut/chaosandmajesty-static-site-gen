---
title: "An Exercise in Futility (and DOOM): wasm Audio Port Pt. 2"
slug: doom-wasm-audio-part-2
author: m4xx3d0ut
summary: "Locking in the WebAudio pipeline, shipping a fresh wasm32 build, and teaching the mini terminal to save and load shareware runs."
publishedAt: '2025-10-20'
readingMinutes: 9
tags:
- wasm
- doom
- audio
- saves
hidden: false
---

## TL;DR

- Audio is no longer a science experiment: the `feat-doom-audio` logic merged, the buffer cache survived real-world hammering, and pointer/touch inputs now resume sound reliably.
- A newly minted `doom.wasm` exposes `cm_save_state_v1` / `cm_load_state_v1`; JavaScript handles slot management, base64 persistence, and deferred loads through LocalStorage.
- The console still only exposes `clear doom <slot|all>` for now; save/load plumbing lives under the hood until the launch glitches are sorted.
- We bumped the wasm heap to 96 MiB, validated the import surface (`js_audio_*`, `js_save_state_*`), and automated stripping custom sections during asset prep.

## State of the soundboard

Part I ended with WebAudio working (in a technical sense) with the warning "thar be dragons". Thar still be dragons, but less.

- Pointer/touch controls force `resumeDoomAudio()` before they inject virtual keys. Touchscreens no longer fall silent after a poke.
- `doomAudioState` tracks the active `ArrayBuffer`, so heap growth or wasm-instantiated reloads flush the cache instead of playing stale noise.
- Every exit path (`exit doom`, overlay button, pointer-lock failure) now calls `shutdownDoomAudio()`. When you bail out, the hum dies instantly.

The goal was to keep the entire sound path self-healing: no matter which input device prods the canvas, the audio context gets nudged awake and the master gain stays in front of the pipeline.

## Save states to local browser storage

The new wasm build exports three hooks:

```c
extern int cm_save_state_v1(int slot);
extern int cm_load_state_v1(int slot);
extern int cm_clear_state_v1(int slot);
```

All three funnel through `js_save_state_{store,load,clear}` imports that we satisfy in JavaScript. The browser side does the heavy lifting:

1. Clamp the requested slot (0–5) and describe it (`slot 2`) for user feedback.
2. Copy the wasm memory region into a fresh `Uint8Array`, base64 encode it, and stash the payload + checksum in `localStorage`.
3. Decode on demand, validate length & checksum, and stream bytes back to wasm when `cm_load_state_v1` asks.
4. Queue pending loads when DOOM isn't running yet; `maybeAutoLoadDoom()` hydrates them once `play doom` finishes booting.

Errors bubble up to the console with context—bad slots, missing exports, checksum mismatches—so the user isn't left guessing which part failed.

## Terminal muscle memory

We resisted the urge to bolt on new UI. The mini terminal already had a command vocabulary, but we learned quickly that exposing manual save/load verbs at launch confused the runtime and users alike. For now the CLI only advertises `clear doom <slot|all>`—handy when you want to wipe LocalStorage without DevTools. The underlying imports stay wired for automated tests and future UX, yet the day-to-day flow stays simple: launch DOOM, play, and nuke stale saves if things get weird.

## A heftier wasm payload

The new artefact comes from the upstream `wasm-fizzbuzz` fork with our patches applied:

- Memory now boots at 1,536 pages (≈96 MiB). Audio lumps and serialized game state coexist without exploding the heap.
- Custom sections are stripped as part of `build-site.sh`, keeping the payload lean for production.
- `js_audio_*` and `js_save_state_*` imports are mandatory; the JavaScript harness surfaces loud errors if any are missing, preventing silent regressions.

`spawnDoom.js` stays untouched for now—the CLI runtime remains the canonical host. Future work may consolidate the two harnesses, but that's a problem for another weekend.

## Testing the pipeline

To validate the merge:

- Run `./build-site.sh` (or `make build-local`) to generate `site-output/` with the new wasm.
- `make serve-local`, run `play doom`, and hammer the controls—audio should resume after every interaction and never fall silent.
- Use `clear doom 0` (or `clear doom all`) to sanity-check the storage hooks; verify LocalStorage entries disappear.

Edge cases worth trying: suspend/resume the browser tab, yank pointer lock, lose network mid-load. The audio layer and save plumbing should recover without a full refresh; if a slot looks corrupt, `clear doom all` remains the panic button.

## What's next

1. **Music, finally.** The MUS lumps still sit idle. Either wire an OPL synth (emulating the AdLib chip) or convert MUS → MIDI → WebAudio.
2. **State sync UI.** Surface save slots in the overlay without changing layout—maybe a subtle status line when auto-load fires.

For now, DOOM finally sounds like DOOM *and* remembers where you left off. That's good enough to make it playable. We'll tackle the soundtrack and polish once the headache subsides!

