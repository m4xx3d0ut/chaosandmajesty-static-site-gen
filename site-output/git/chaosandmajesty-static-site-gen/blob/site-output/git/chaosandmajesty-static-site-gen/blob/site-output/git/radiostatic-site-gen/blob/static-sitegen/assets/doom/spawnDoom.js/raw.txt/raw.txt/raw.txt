(function() {
  if (window.spawnDoom) return;

  const doomWasmUrl = (window.cmDoomConfig && window.cmDoomConfig.assetBase) ?
    window.cmDoomConfig.assetBase.replace(/\/+$/, '/') + 'doom.wasm' : 'assets/doom/doom.wasm';

  function spawnDoom(canvas, statusNode) {
    const doomScreenWidth = 320 * 2;
    const doomScreenHeight = 200 * 2;
    const memory = new WebAssembly.Memory({ initial: 108 });
    let context = canvas.getContext('2d');
    const startTime = performance.now();

    function readString(offset, length) {
      try {
        const bytes = new Uint8Array(memory.buffer, offset, length);
        return new TextDecoder('utf8').decode(bytes);
      } catch (err) {
        return '';
      }
    }

    function setStatus(message) {
      if (statusNode) {
        statusNode.textContent = message || '';
      }
    }

    function drawCanvas(ptr) {
      if (!context) return;
      const doomScreen = new Uint8ClampedArray(memory.buffer, ptr, doomScreenWidth * doomScreenHeight * 4);
      const renderScreen = new ImageData(doomScreen, doomScreenWidth, doomScreenHeight);
      context.putImageData(renderScreen, 0, 0);
    }

    const importObject = {
      js: {
        js_console_log: (offset, length) => console.log('[DOOM]', readString(offset, length)),
        js_stdout: (offset, length) => console.log('[DOOM stdout]', readString(offset, length)),
        js_stderr: (offset, length) => console.error('[DOOM stderr]', readString(offset, length)),
        js_milliseconds_since_start: () => performance.now() - startTime,
        js_draw_screen: drawCanvas,
      },
      env: {
        memory,
      },
    };

    function instantiate() {
      return fetch(doomWasmUrl).then(response => {
        if (!response.ok) throw new Error(`Failed to fetch DOOM wasm (${response.status})`);
        if (WebAssembly.instantiateStreaming) {
          return WebAssembly.instantiateStreaming(response.clone(), importObject).catch(() =>
            response.arrayBuffer().then(buffer => WebAssembly.instantiate(buffer, importObject))
          );
        }
        return response.arrayBuffer().then(buffer => WebAssembly.instantiate(buffer, importObject));
      });
    }

    function doomKeyCode(keyCode) {
      switch (keyCode) {
        case 8: return 127;
        case 17: return 0x80 + 0x1d;
        case 18: return 0x80 + 0x38;
        case 37: return 0xac;
        case 38: return 0xad;
        case 39: return 0xae;
        case 40: return 0xaf;
        default:
          if (keyCode >= 65 && keyCode <= 90) return keyCode + 32;
          if (keyCode >= 112 && keyCode <= 123) return keyCode + 75;
          return keyCode;
      }
    }

    return instantiate().then(({ instance }) => {
      const exports = instance.exports;
      if (!exports || typeof exports.main !== 'function' || typeof exports.doom_loop_step !== 'function' || typeof exports.add_browser_event !== 'function') {
        throw new Error('DOOM wasm missing expected exports');
      }

      exports.main();
      setStatus('Loaded. Click the canvas to capture controls.');

      if (!canvas.hasAttribute('tabindex')) {
        canvas.setAttribute('tabindex', '0');
      }

      const listeners = [];
      const addListener = (target, type, handler) => {
        target.addEventListener(type, handler, false);
        listeners.push({ target, type, handler });
      };

      const keyDown = code => exports.add_browser_event(0, code);
      const keyUp = code => exports.add_browser_event(1, code);

      addListener(canvas, 'keydown', event => {
        keyDown(doomKeyCode(event.keyCode));
        event.preventDefault();
      });
      addListener(canvas, 'keyup', event => {
        keyUp(doomKeyCode(event.keyCode));
        event.preventDefault();
      });
      addListener(canvas, 'click', () => {
        try {
          canvas.focus({ preventScroll: true });
        } catch (err) {
          canvas.focus();
        }
      });

      let running = true;

      const step = () => {
        if (!running) return;
        try {
          exports.doom_loop_step();
        } catch (err) {
          console.error('DOOM runtime error:', err);
          setStatus('Runtime error. See console for details.');
          running = false;
          return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);

      const teardown = message => {
        running = false;
        listeners.forEach(({ target, type, handler }) => {
          target.removeEventListener(type, handler, false);
        });
        listeners.length = 0;
        context = null;
        if (message) setStatus(message);
      };

      return {
        teardown,
        focusCanvas: () => {
          try {
            canvas.focus({ preventScroll: true });
          } catch (_) {
            canvas.focus();
          }
        },
        setStatus,
      };
    });
  }

  window.spawnDoom = spawnDoom;
})();
