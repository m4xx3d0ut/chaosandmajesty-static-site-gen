---
title: "An Exercise in Futility (and DOOM): wasm Audio Port Pt. 1"
slug: doom-wasm-audio-part-1
author: m4xx3d0ut
summary: "Wiring the shareware build's 8-bit sound effects into a modern WebAudio pipeline without breaking everything else..."
publishedAt: '2025-10-13'
readingMinutes: 8
tags:
- wasm
- doom
- audio
hidden: false
---

## TL;DR

- The working branch `feat-doom-audio` now boots DOOM with WebAudio-driven sound effects, closing the silence we lived with in the first wasm drops.
- We expose `js_audio_init`, `js_audio_play_sfx`, and `js_audio_shutdown` so the wasm module treats our browser runtime like a soundcard.
- 8-bit PCM lumps are cached, resampled, and mixed per-channel before they hit an `AudioBufferSourceNode`, keeping overlapping shots from crackling.
- We gate autoplay rules by resuming the `AudioContext` on key, click, and pointer-lock events, while scheduling buffers against `currentTime` to stay in sync.

## Bringing the old soundcard back online

The first integration of DOOM (commit `866c611`, what you see on the site as of today) got DOOM sitting pretty in the terminal screen, but the build stayed mute. The past week on `feat-doom-audio` moved the shareware soundboard into the browser. The opening salvo:

- `b52c11e` introduced a JavaScript bridge that let the wasm runtime push raw samples into our memory view.
- `6d7d067` rewired playback, converting 8-bit lumps to floating point and scheduling them against a shared gain node so multiple SFX can play cleanly.
- `23971cd` tightened the pipeline with buffer caching, pitch-aware resampling, and guard rails for browsers that suspend audio contexts.

Each pass kept the terminal commands intact—`play doom` still deploys the overlay, `exit doom` tears it down—while giving us room to iterate on audio without breaking the UI shell.

## WebAssembly wants a soundcard

`instantiateDoom()` now provisions a 96 MiB `WebAssembly.Memory` block and wires a custom import object:

```js
js: {
  js_audio_init(sampleRate) { initDoomAudio(sampleRate); },
  js_audio_play_sfx(ptr, length, sampleRate, left, right, pitch) {
    playDoomSfx(ptr, length, sampleRate, left, right, pitch);
  },
  js_audio_shutdown() { shutdownDoomAudio(); }
}
```

The game still thinks it is talking to a DOS-era mixer. We translate that conversation into WebAudio primitives. `initDoomAudio` spins up an `AudioContext`, seeds a master gain node, records the wasm-provided sample rate (11025 Hz by default), and marks the engine live. `shutdownDoomAudio` flips the switch, clears the cache, and closes the context so re-entry stays clean.

## Resampling the shareware lumps

Every sound effect the shareware WAD ships (door slides, plasma bolts, the cyberdemon's roar) arrives as unsigned 8-bit PCM. `playDoomSfx` pulls the bytes directly from the wasm memory buffer, normalises them to the `[-1, 1]` range, and caches the result in `doomAudioState.bufferCache`. The cache key ties the pointer and length, so repeated shots reuse decoded data instead of hammering the GC.

Pitch adjustments from the engine arrive as a single byte. We convert that to an exponential ratio (`Math.pow(2, (pitch - 128) / 64)`) and scale the effective playback rate before shoving frames into a stereo buffer. Volume is handled per-channel (left/right gain derived from the game's 0-127 range) so directional audio survives intact. By feeding the finished `AudioBuffer` through a shared gain node we can add future master controls without rewriting the wasm side.

## Keeping the browser happy

Modern browsers refuse to autoplay audio until a user interacts. `resumeDoomAudio()` tackles that rule by listening for keydown, keyup, click, focus, and pointer-lock events on the DOOM canvas. The first interaction calls `context.resume()` and subsequent inputs keep the context warm. We also schedule each `AudioBufferSource` against a `nextTime` cursor tracked in `doomAudioState`, ensuring overlapping shotgun blasts queue seamlessly even when a frame drops.

Mouse capture still works the way the earlier branch taught us: clicking the canvas requests pointer lock, Esc releases it, and the overlay's status area tells you where you stand. The only new behaviour is that every exit path calls `shutdownDoomAudio()` so leaving the game stops the hum instantly.

## Memory and performance guard rails

The wasm module now receives a 1,536-page (≈96 MiB) memory block. Audio lumps and texture tables chew through headroom fast—a smaller heap led to hard faults once we added streaming samples. The buffer cache tracks the active memory buffer and flushes itself if the wasm heap relocates, defending against stale `ArrayBuffer` references. Combined with the shared `masterGain` node and sequential scheduling, we minimise garbage collection churn and keep the terminal responsive while the game screams in the background.

## What's next

Part II will chase the remaining gaps:

1. Stream the music subsystem (the shareware IWAD ships MUS data that needs a MIDI-to-WAV bridge or an FM synth shim).

For now, we can boot the branch, run `play doom`, and enjoy the return of E1M1's soundscape—silence is officially dead.

But head our warning: "thar be dragons".  I'm still thinking through the approach and testing stability, this is my first foray into WebAudio and WebAssembly.  I'm sure there are better ways to do this, but it's a start.  And it works... for now.  If/when I'm happy with the state of audio, I'll push the project to a public repo and put a little more time into it, there are a few other features I'd like to see before calling it done!

