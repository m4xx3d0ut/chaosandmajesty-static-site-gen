(function() {
  const CONTRAST_KEY = 'cm-contrast-mode';
  const CONTRAST_CLASS = 'contrast-mode';
  const LOGO_PAUSE_REASON_TERMINAL = 'terminal-input';
  const LOGO_PAUSE_REASON_DOOM = 'doom';
  const DOOM_DEFAULT_ZONE_MB = 96;
  // Boost DOOM's zone allocator so save / audio heaps fit comfortably.
  const DOOM_DEFAULT_LAUNCH_ARGS = ['-mb', String(DOOM_DEFAULT_ZONE_MB)];
  const TERMINAL_STORAGE_KEY = 'cm-terminal-buffer';
  const TERMINAL_MAX_SEGMENTS = 320;

  function ensureLogoControl() {
    if (typeof window === 'undefined') {
      return {
        setController: function() {},
        pause: function() {},
        resume: function() {},
        toggleManualPause: function() {},
        isPaused: function() { return false; }
      };
    }

    const existing = window.cmLogoControl;
    if (existing && typeof existing.pause === 'function' && typeof existing.resume === 'function') {
      return existing;
    }

    const pendingReasons = new Set();
    let controller = null;

    const stub = {
      setController(nextController) {
        controller = nextController;
        if (!controller || typeof controller.pause !== 'function') {
          return;
        }
        if (pendingReasons.size > 0) {
          pendingReasons.forEach(reason => {
            try {
              controller.pause(reason);
            } catch (err) {
              console.error('Failed to apply pending CM logo pause reason', reason, err);
            }
          });
          pendingReasons.clear();
        }
      },
      pause(reason) {
        const key = reason || 'manual';
        if (controller && typeof controller.pause === 'function') {
          controller.pause(key);
          return;
        }
        pendingReasons.add(key);
      },
      resume(reason) {
        const key = reason || 'manual';
        if (controller && typeof controller.resume === 'function') {
          controller.resume(key);
          return;
        }
        pendingReasons.delete(key);
      },
      toggleManualPause() {
        if (controller && typeof controller.toggleManualPause === 'function') {
          controller.toggleManualPause();
          return;
        }
        if (pendingReasons.has('manual')) {
          pendingReasons.delete('manual');
        } else {
          pendingReasons.add('manual');
        }
      },
      isPaused() {
        if (controller && typeof controller.isPaused === 'function') {
          return controller.isPaused();
        }
        return pendingReasons.size > 0;
      }
    };

    window.cmLogoControl = stub;
    return stub;
  }

  const logoControl = ensureLogoControl();

  function pauseLogo(reason) {
    if (logoControl && typeof logoControl.pause === 'function') {
      logoControl.pause(reason);
    }
  }

  function resumeLogo(reason) {
    if (logoControl && typeof logoControl.resume === 'function') {
      logoControl.resume(reason);
    }
  }

  function updateToggleState(toggle, isSoft) {
    if (!toggle) return;
    toggle.textContent = '1337';
    toggle.title = '1337 Mode';
    toggle.setAttribute('aria-label', 'Toggle 1337 Mode');
    toggle.setAttribute('aria-pressed', isSoft ? 'false' : 'true');
    toggle.classList.toggle('is-1337', !isSoft);
  }

  function applyContrastPreference(pref, toggle) {
    const body = document.body;
    if (!body) return;
    const isSoft = pref !== 'neon';

    if (isSoft) {
      body.classList.add(CONTRAST_CLASS);
      body.setAttribute('data-contrast', 'soft');
    } else {
      body.classList.remove(CONTRAST_CLASS);
      body.removeAttribute('data-contrast');
    }

    updateToggleState(toggle, isSoft);
  }

  function initThemeToggle() {
    const toggle = document.querySelector('.theme-toggle');
    const stored = window.localStorage.getItem(CONTRAST_KEY) || 'soft';

    applyContrastPreference(stored, toggle);

    if (!toggle) return;

    toggle.addEventListener('click', function() {
      const body = document.body;
      if (!body) return;
      const next = body.classList.contains(CONTRAST_CLASS) ? 'neon' : 'soft';
      applyContrastPreference(next, toggle);
      window.localStorage.setItem(CONTRAST_KEY, next);
    });
  }

  function initBackToTop() {
    const btn = document.querySelector('.blog-back-to-top');
    if (!btn) return;

    const toggleVisibility = () => {
      const scrolled = window.pageYOffset || document.documentElement.scrollTop || 0;
      if (scrolled > 400) {
        btn.classList.add('is-visible');
      } else {
        btn.classList.remove('is-visible');
      }
    };

    btn.addEventListener('click', function() {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    window.addEventListener('scroll', toggleVisibility, { passive: true });
    toggleVisibility();
  }

  function fallbackCopyText(text) {
    return new Promise(function(resolve) {
      if (typeof document === 'undefined' || !document.body) {
        resolve(false);
        return;
      }
      var textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('aria-hidden', 'true');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      document.body.appendChild(textarea);
      textarea.select();
      var succeeded = false;
      try {
        succeeded = document.execCommand('copy');
      } catch (copyError) {
        console.warn('Copy failed', copyError);
      }
      document.body.removeChild(textarea);
      resolve(!!succeeded);
    });
  }

  function copyTextToClipboard(text) {
    if (!text) {
      return Promise.resolve(false);
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text).then(function() {
        return true;
      }).catch(function() {
        return fallbackCopyText(text);
      });
    }
    return fallbackCopyText(text);
  }

  function resolvePermalink(value) {
    if (!value) return '';
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) {
      return value;
    }
    if (typeof window === 'undefined' || !window.location) {
      return value;
    }
    try {
      return new URL(value, window.location.href).toString();
    } catch (err) {
      return value;
    }
  }

  function setPermalinkLabel(button, text) {
    if (!button) return;
    var label = button.querySelector('[data-permalink-label]');
    if (label) {
      label.textContent = text;
      return;
    }
    button.textContent = text;
  }

  function updatePermalinkButton(button, success) {
    if (!button) return;
    var defaultLabel = button.getAttribute('data-default-label');
    if (!defaultLabel) {
      var labelNode = button.querySelector('[data-permalink-label]');
      defaultLabel = (labelNode ? labelNode.textContent : button.textContent || '').trim() || 'Copy permalink';
      button.setAttribute('data-default-label', defaultLabel);
    }
    var message = success ? 'Permalink copied' : 'Copy failed';
    setPermalinkLabel(button, message);
    button.classList.toggle('is-copied', success);
    button.classList.toggle('is-error', !success);
    if (button.__permalinkTimeout) {
      window.clearTimeout(button.__permalinkTimeout);
    }
    button.__permalinkTimeout = window.setTimeout(function() {
      setPermalinkLabel(button, defaultLabel);
      button.classList.remove('is-copied');
      button.classList.remove('is-error');
    }, 1600);
  }

  function initBlogPermalinks() {
    if (typeof document === 'undefined' || !document.body) return;
    if (document.body.getAttribute('data-permalink-ready') === 'true') {
      return;
    }
    document.body.setAttribute('data-permalink-ready', 'true');
    document.body.addEventListener('click', function(event) {
      if (!event.target || typeof event.target.closest !== 'function') return;
      var button = event.target.closest('.blog-permalink-button');
      if (!button) return;
      event.preventDefault();
      if (button.getAttribute('data-copy-loading') === 'true') return;
      var raw = button.getAttribute('data-permalink') || '';
      var resolved = resolvePermalink(raw);
      if (!resolved) {
        updatePermalinkButton(button, false);
        return;
      }
      button.setAttribute('data-copy-loading', 'true');
      copyTextToClipboard(resolved).then(function(success) {
        button.removeAttribute('data-copy-loading');
        updatePermalinkButton(button, success);
      });
    });
  }

  function isLikelyMobileViewport() {
    if (typeof window === 'undefined') {
      return false;
    }

    var matchesMobileWidth = false;
    if (typeof window.matchMedia === 'function') {
      try {
        matchesMobileWidth = window.matchMedia('(max-width: 768px)').matches;
      } catch (_err) {
        matchesMobileWidth = false;
      }
    }

    var hasTouchCapability = false;
    try {
      hasTouchCapability = ('ontouchstart' in window) || (navigator && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0);
    } catch (_err2) {
      hasTouchCapability = false;
    }

    return matchesMobileWidth || hasTouchCapability;
  }

  function isLikelyIOS() {
    if (typeof navigator === 'undefined') {
      return false;
    }

    try {
      var platform = navigator.platform || '';
      var userAgent = navigator.userAgent || '';
      var maxTouchPoints = typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0;

      if (/iP(hone|od|ad)/.test(platform)) {
        return true;
      }
      if (/iPhone|iPad|iPod/.test(userAgent)) {
        return true;
      }
      if (/Mac/.test(platform) && maxTouchPoints > 1) {
        return true;
      }
    } catch (_err) {
      return false;
    }

    return false;
  }

  function initMobileConsoleKeyboardScaling() {
    if (typeof document === 'undefined') {
      return;
    }

    var body = document.body;
    if (!body || !isLikelyMobileViewport()) {
      return;
    }

    var consoleEl = document.getElementById('console');
    var inputEl = document.getElementById('uIn');
    if (!consoleEl || !inputEl) {
      return;
    }

    var viewport = typeof window !== 'undefined' ? window.visualViewport : null;
    var baselineHeight = viewport ? viewport.height : null;
    var keyboardActive = false;
    var keyboardMarker = null;
    var consoleWrapper = consoleEl.closest('.console-center');
    var consoleTranslateY = 0;
    var KEYBOARD_STATE_CLASS = 'cm-keyboard-open';
    var KEYBOARD_MARKER_CLASS = 'cm-keyboard-anchor';
    var KEYBOARD_MARKER_THICKNESS = 12; // Mirror --cm-keyboard-marker-thickness
    var HEIGHT_THRESHOLD = 120;
    var prefersScrollAlignment = isLikelyIOS();

    function getViewportBottom() {
      if (viewport) {
        return viewport.height + viewport.offsetTop;
      }
      return window.innerHeight || (document.documentElement && document.documentElement.clientHeight) || 0;
    }

    function ensureKeyboardMarker() {
      if (keyboardMarker && keyboardMarker.parentNode === body) {
        return keyboardMarker;
      }
      keyboardMarker = document.createElement('div');
      keyboardMarker.className = KEYBOARD_MARKER_CLASS;
      keyboardMarker.setAttribute('aria-hidden', 'true');
      body.appendChild(keyboardMarker);
      return keyboardMarker;
    }

    function updateKeyboardMarker(isActive) {
      if (!isActive && !keyboardMarker) {
        return;
      }
      var marker = ensureKeyboardMarker();
      if (!marker) {
        return;
      }
      if (!isActive) {
        marker.classList.remove('is-active');
        marker.style.top = '';
        return;
      }
      var viewportBottom = getViewportBottom();
      var markerTop = viewportBottom - KEYBOARD_MARKER_THICKNESS;
      if (markerTop < 0) {
        markerTop = 0;
      }
      marker.style.top = markerTop + 'px';
      marker.classList.add('is-active');
    }

    function applyConsoleTranslate(nextValue) {
      if (!consoleWrapper) {
        consoleTranslateY = 0;
        return;
      }
      if (prefersScrollAlignment) {
        if (consoleWrapper.style.getPropertyValue('--cm-keyboard-translate')) {
          consoleWrapper.style.removeProperty('--cm-keyboard-translate');
        }
        consoleWrapper.classList.remove('is-keyboard-adjusted');
        consoleTranslateY = 0;
        return;
      }
      if (!nextValue) {
        consoleWrapper.style.removeProperty('--cm-keyboard-translate');
        consoleWrapper.classList.remove('is-keyboard-adjusted');
        consoleTranslateY = 0;
        return;
      }
      consoleWrapper.style.setProperty('--cm-keyboard-translate', nextValue + 'px');
      consoleWrapper.classList.add('is-keyboard-adjusted');
      consoleTranslateY = nextValue;
    }

    function updateConsoleAlignment(isActive) {
      if (!consoleWrapper) {
        return;
      }
      if (!isActive) {
        if (consoleTranslateY !== 0) {
          applyConsoleTranslate(0);
        }
        return;
      }

      window.requestAnimationFrame(function() {
        var viewportBottom = getViewportBottom();
        if (!viewportBottom) {
          return;
        }
        var rect = consoleWrapper.getBoundingClientRect();
        var originalBottom = rect.bottom - consoleTranslateY;
        var desiredBottom = viewportBottom;
        var delta = originalBottom - desiredBottom;
        if (prefersScrollAlignment) {
          if (delta > 4 && typeof window.scrollBy === 'function') {
            var scrollAmount = delta > 600 ? 600 : delta;
            window.scrollBy(0, scrollAmount);
          }
          return;
        }
        var nextTranslate = delta > 1 ? -delta : 0;
        if (Math.abs(nextTranslate - consoleTranslateY) < 1) {
          return;
        }
        applyConsoleTranslate(nextTranslate);
      });
    }

    function setKeyboardState(nextState) {
      var stateChanged = keyboardActive !== nextState;
      keyboardActive = nextState;
      if (stateChanged) {
        if (keyboardActive) {
          body.classList.add(KEYBOARD_STATE_CLASS);
        } else {
          body.classList.remove(KEYBOARD_STATE_CLASS);
        }
      }
      if (!keyboardActive && consoleTranslateY !== 0) {
        applyConsoleTranslate(0);
      }
      updateKeyboardMarker(keyboardActive);
      updateConsoleAlignment(keyboardActive);
    }

    function updateBaseline() {
      if (!viewport) {
        return;
      }
      if (baselineHeight === null || viewport.height > baselineHeight) {
        baselineHeight = viewport.height;
      }
    }

    function detectKeyboardWithViewport() {
      if (!viewport) {
        return;
      }
      if (document.activeElement !== inputEl) {
        setKeyboardState(false);
        updateBaseline();
        return;
      }

      updateBaseline();
      var heightDelta = baselineHeight !== null ? (baselineHeight - viewport.height) : 0;
      setKeyboardState(heightDelta > HEIGHT_THRESHOLD);
    }

    if (!viewport) {
      inputEl.addEventListener('focus', function() {
        setKeyboardState(true);
      });
      inputEl.addEventListener('blur', function() {
        setKeyboardState(false);
      });
      return;
    }

    viewport.addEventListener('resize', detectKeyboardWithViewport);
    viewport.addEventListener('scroll', detectKeyboardWithViewport);

    inputEl.addEventListener('focus', function() {
      baselineHeight = viewport ? viewport.height : baselineHeight;
      window.setTimeout(detectKeyboardWithViewport, 50);
    });

    inputEl.addEventListener('blur', function() {
      setKeyboardState(false);
      updateBaseline();
    });

    window.addEventListener('orientationchange', function() {
      baselineHeight = viewport ? viewport.height : baselineHeight;
      window.setTimeout(detectKeyboardWithViewport, 50);
    });
  }

  const LIGHTBOX_STATE = {
    overlay: null,
    imageEl: null,
    captionEl: null,
    closeBtn: null,
    targets: new Map(),
    counter: 0,
    previousActive: null
  };

  function isLightboxOptOut(el) {
    if (!el) return false;
    if (el.dataset) {
      const flag = el.dataset.lightbox;
      if (flag && (flag === 'false' || flag === 'off' || flag === 'no')) {
        return true;
      }
    }
    if (typeof el.closest === 'function') {
      return !!el.closest('[data-lightbox="false"], [data-lightbox="off"], [data-lightbox="no"]');
    }
    return false;
  }

  function setLightboxCaption(text) {
    const captionEl = LIGHTBOX_STATE.captionEl;
    if (!captionEl) return;
    const trimmed = (text || '').trim();
    if (!trimmed) {
      captionEl.textContent = '';
      captionEl.hidden = true;
      return;
    }
    captionEl.textContent = trimmed;
    captionEl.hidden = false;
  }

  function pruneLightboxTargets() {
    LIGHTBOX_STATE.targets.forEach(function(node, id) {
      if (!node || !document.body.contains(node)) {
        LIGHTBOX_STATE.targets.delete(id);
      }
    });
  }

  function handleLightboxKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeLightbox();
    }
  }

  function closeLightbox() {
    const overlay = LIGHTBOX_STATE.overlay;
    if (!overlay || !overlay.classList.contains('is-active')) return;
    overlay.classList.remove('is-active');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-lightbox-open');

    const imageEl = LIGHTBOX_STATE.imageEl;
    if (imageEl) {
      imageEl.removeAttribute('src');
      imageEl.removeAttribute('srcset');
      imageEl.removeAttribute('sizes');
      imageEl.alt = '';
    }

    setLightboxCaption('');
    document.removeEventListener('keydown', handleLightboxKeydown);

    const previousActive = LIGHTBOX_STATE.previousActive;
    if (previousActive && typeof previousActive.focus === 'function') {
      try {
        previousActive.focus({ preventScroll: true });
      } catch (err) {
        // ignore focus errors
      }
    }

    LIGHTBOX_STATE.previousActive = null;
  }

  function ensureLightboxOverlay() {
    if (LIGHTBOX_STATE.overlay) {
      return LIGHTBOX_STATE.overlay;
    }

    if (!document.body) {
      return null;
    }

    const template = document.createElement('template');
    template.innerHTML = '' +
      '<div class="blog-image-lightbox" aria-hidden="true">' +
      '  <div class="blog-image-lightbox-backdrop" data-lightbox-dismiss></div>' +
      '  <div class="blog-image-lightbox-dialog" role="dialog" aria-modal="true" aria-label="Expanded image">' +
      '    <button type="button" class="blog-image-lightbox-close" data-lightbox-dismiss aria-label="Close expanded image">' +
      '      <span aria-hidden="true">&times;</span>' +
      '    </button>' +
      '    <figure class="blog-image-lightbox-frame">' +
      '      <img class="blog-image-lightbox-media" alt="">' +
      '      <figcaption class="blog-image-lightbox-caption" hidden></figcaption>' +
      '    </figure>' +
      '  </div>' +
      '</div>';

    const overlay = template.content.firstElementChild;
    if (!overlay) {
      return null;
    }

    document.body.appendChild(overlay);
    LIGHTBOX_STATE.overlay = overlay;
    LIGHTBOX_STATE.imageEl = overlay.querySelector('.blog-image-lightbox-media');
    LIGHTBOX_STATE.captionEl = overlay.querySelector('.blog-image-lightbox-caption');
    LIGHTBOX_STATE.closeBtn = overlay.querySelector('.blog-image-lightbox-close');

    const closeTriggers = overlay.querySelectorAll('[data-lightbox-dismiss]');
    closeTriggers.forEach(function(trigger) {
      trigger.addEventListener('click', function(event) {
        event.preventDefault();
        closeLightbox();
      });
    });

    overlay.addEventListener('click', function(event) {
      if (event.target === overlay) {
        closeLightbox();
      }
    });

    overlay.closeLightbox = closeLightbox;
    return overlay;
  }

  function openLightbox(img) {
    const overlay = ensureLightboxOverlay();
    if (!overlay || !img) return;

    const imageEl = LIGHTBOX_STATE.imageEl;
    if (!imageEl) return;

    const source = img.currentSrc || img.src;
    if (!source) return;

    LIGHTBOX_STATE.previousActive = document.activeElement;

    imageEl.src = source;
    if (img.srcset) {
      imageEl.srcset = img.srcset;
    } else {
      imageEl.removeAttribute('srcset');
    }
    if (img.sizes) {
      imageEl.sizes = img.sizes;
    } else {
      imageEl.removeAttribute('sizes');
    }

    const figure = typeof img.closest === 'function' ? img.closest('figure') : null;
    const figureCaption = figure && figure.querySelector('figcaption');
    const altText = img.getAttribute('alt') || '';
    const captionText = figureCaption ? figureCaption.textContent : altText;
    imageEl.alt = altText || '';
    setLightboxCaption(captionText);

    overlay.classList.add('is-active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-lightbox-open');
    document.addEventListener('keydown', handleLightboxKeydown);

    if (LIGHTBOX_STATE.closeBtn) {
      try {
        LIGHTBOX_STATE.closeBtn.focus({ preventScroll: true });
      } catch (err) {
        // ignore focus errors
      }
    }
  }

  function registerLightboxImage(img) {
    if (!img || !(img instanceof HTMLImageElement)) return;
    if (isLightboxOptOut(img)) return;

    let imageId = img.dataset.lightboxId;
    if (!imageId) {
      imageId = `blog-lightbox-${++LIGHTBOX_STATE.counter}`;
      img.dataset.lightboxId = imageId;
    }

    LIGHTBOX_STATE.targets.set(imageId, img);

    const alreadyInitialised = img.dataset.lightboxReady === 'true';
    const accessibleLabel = (img.getAttribute('alt') || '').trim() || 'Expand image';

    const wrapperLink = typeof img.closest === 'function' ? img.closest('a') : null;
    const useWrapper = wrapperLink && !isLightboxOptOut(wrapperLink);

    if (!alreadyInitialised) {
      img.dataset.lightboxReady = 'true';
      img.classList.add('blog-image-lightbox-target');
    }

    if (useWrapper) {
      wrapperLink.dataset.lightboxId = imageId;
      wrapperLink.classList.add('blog-image-lightbox-trigger');
      if (!wrapperLink.hasAttribute('role')) {
        wrapperLink.setAttribute('role', 'button');
      }
      wrapperLink.setAttribute('aria-haspopup', 'dialog');
      if (!wrapperLink.hasAttribute('aria-label')) {
        wrapperLink.setAttribute('aria-label', accessibleLabel);
      }
    } else {
      img.classList.add('blog-image-lightbox-trigger');
      if (!img.hasAttribute('tabindex')) {
        img.setAttribute('tabindex', '0');
      }
      img.setAttribute('role', 'button');
      img.setAttribute('aria-haspopup', 'dialog');
      if (!img.hasAttribute('aria-label')) {
        img.setAttribute('aria-label', accessibleLabel);
      }
    }
  }

  function collectArticleElements(root) {
    if (!root) return [];
    const collection = [];
    if (typeof root.matches === 'function' && root.matches('.blog-article-content')) {
      collection.push(root);
    }
    if (typeof root.querySelectorAll === 'function') {
      root.querySelectorAll('.blog-article-content').forEach(function(article) {
        if (collection.indexOf(article) === -1) {
          collection.push(article);
        }
      });
    }
    return collection;
  }

  function registerAllBlogImages(root) {
    pruneLightboxTargets();
    const articles = collectArticleElements(root || document);
    if (!articles.length) return;
    articles.forEach(function(article) {
      article.querySelectorAll('img').forEach(registerLightboxImage);
    });
  }

  function resolveImageFromTrigger(triggerEl) {
    if (!triggerEl) return null;
    const imageId = triggerEl.getAttribute('data-lightbox-id');
    if (!imageId) return null;

    const known = LIGHTBOX_STATE.targets.get(imageId);
    if (known && document.body.contains(known)) {
      return known;
    }

    let candidate = null;
    if (typeof triggerEl.matches === 'function' && triggerEl.matches('img')) {
      candidate = triggerEl;
    } else if (typeof triggerEl.querySelector === 'function') {
      candidate = triggerEl.querySelector('img[data-lightbox-id]');
    }

    if (candidate && candidate.dataset && candidate.dataset.lightboxId === imageId) {
      LIGHTBOX_STATE.targets.set(imageId, candidate);
      return candidate;
    }

    const allImages = document.querySelectorAll ? document.querySelectorAll('img[data-lightbox-id]') : [];
    for (var i = 0; i < allImages.length; i += 1) {
      var imgEl = allImages[i];
      if (imgEl.dataset && imgEl.dataset.lightboxId === imageId) {
        LIGHTBOX_STATE.targets.set(imageId, imgEl);
        return imgEl;
      }
    }

    return null;
  }

  function initBlogImageLightbox() {
    if (!document.body) return;

    ensureLightboxOverlay();
    registerAllBlogImages(document);

    document.body.addEventListener('click', function(event) {
      if (!event.target || typeof event.target.closest !== 'function') return;
      const trigger = event.target.closest('[data-lightbox-id]');
      if (!trigger) return;
      if (!trigger.closest('.blog-article-content')) return;
      const image = resolveImageFromTrigger(trigger);
      if (!image) return;
      event.preventDefault();
      openLightbox(image);
    });

    document.body.addEventListener('keydown', function(event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (!event.target || typeof event.target.closest !== 'function') return;
      const trigger = event.target.closest('[data-lightbox-id]');
      if (!trigger) return;
      if (!trigger.closest('.blog-article-content')) return;
      const image = resolveImageFromTrigger(trigger);
      if (!image) return;
      event.preventDefault();
      openLightbox(image);
    });

    if (window.htmx && typeof window.htmx.on === 'function') {
      const rehydrate = function(evt) {
        const target = evt && evt.detail && evt.detail.target ? evt.detail.target : (evt.target || document);
        registerAllBlogImages(target || document);
      };
      window.htmx.on('htmx:afterSwap', rehydrate);
      window.htmx.on('htmx:afterSettle', rehydrate);
    }
  }

  var opacity = 0.85;
  var intervalID = null;
  var out = 0;
  var taglineMinOpacity = 0.7;
  var taglineMaxOpacity = 1;
  var taglineStep = 0.02;
  var taglineIntervalMs = 120;
  var terminalRestored = false;
  var hello = [
      'GREETINGS PROFESSOR FALKEN.',
      'HOW ARE YOU FEELING TODAY?',
      'SHALL WE PLAY A GAME?',
      'S2VybmVsIFBhbmljIQo=',
      'Payload_Execute......',
      'Reverse_Shell_Starting...',
      'ALL YOUR BASE ARE BELONG TO US!',
      'Awaiting command...'
  ];
  var profileAliases = {
      'paul': 0,
      'pk': 0,
      'paulkolesa': 0,
      'm4xx3d0ut': 0,
      'architect': 0,
      'th34rch1t3ct': 0,
      'renee': 1,
      'rr': 1,
      'rk': 1,
      'matica': 1,
      'matica8': 1,
      'reneerules': 1
  };
  var commandHistory = [];
  var historyIndex = 0;
  var DISPATCH_PAGE_SIZE = 3;
  var doomState = {
      active: false,
      overlay: null,
      canvas: null,
      statusNode: null,
      instancePromise: null,
      instance: null,
      memory: null,
      loopHandle: null,
      loopFn: null,
      listeners: [],
      context: null,
      screenEl: null,
      prevScrollTop: null,
      prevOverflow: null,
      touchControlsRoot: null,
      virtualKeyReleasers: [],
      sendVirtualKey: null,
      keyboardToggleBtn: null,
      keyboardVisible: false,
      keyboardProxy: null,
      pendingLoadSlot: null,
      lastSaveMeta: null,
      lastLoadResult: null,
      supportsSaveStates: false
  };
  var doomAudioState = {
      context: null,
      masterGain: null,
      nextTime: 0,
      sampleRate: 11025,
      enabled: false,
      bufferCache: new Map(),
      memoryBuffer: null
  };
  var doomTextDecoder = (typeof TextDecoder === 'function') ? new TextDecoder('utf8') : null;
  var DOOM_SAVE_MAX_SLOT = 5;
  var DOOM_SAVE_KEY_PREFIX = 'cm-doom-save-slot-';
  var DOOM_SAVE_VERSION = 1;

  function clampDoomSlot(slot) {
      var value = typeof slot === 'number' ? slot : parseInt(slot, 10);
      if (!Number.isFinite(value)) {
          return null;
      }
      if (value < 0) {
          value = 0;
      }
      if (value > DOOM_SAVE_MAX_SLOT) {
          value = DOOM_SAVE_MAX_SLOT;
      }
      return value | 0;
  }

  function getDoomSaveKey(slot) {
      return DOOM_SAVE_KEY_PREFIX + slot;
  }

  function computeDoomChecksum(bytes) {
      if (!bytes) {
          return 0;
      }
      var sum = 0;
      for (var i = 0; i < bytes.length; i++) {
          sum = (sum + bytes[i]) & 0xffff;
      }
      return sum;
  }

  function encodeBase64Bytes(bytes) {
      if (!bytes || typeof window === 'undefined' || typeof window.btoa !== 'function') {
          return null;
      }
      var chunkSize = 0x8000;
      var segments = [];
      for (var offset = 0; offset < bytes.length; offset += chunkSize) {
          var slice = bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize));
          var chars = new Array(slice.length);
          for (var idx = 0; idx < slice.length; idx++) {
              chars[idx] = String.fromCharCode(slice[idx]);
          }
          segments.push(chars.join(''));
      }
      try {
          return window.btoa(segments.join(''));
      } catch (_err) {
          return null;
      }
  }

  function decodeBase64ToBytes(encoded) {
      if (!encoded || typeof window === 'undefined' || typeof window.atob !== 'function') {
          return null;
      }
      try {
          var binary = window.atob(encoded);
          var length = binary.length;
          var view = new Uint8Array(length);
          for (var i = 0; i < length; i++) {
              view[i] = binary.charCodeAt(i);
          }
          return view;
      } catch (_err) {
          return null;
      }
  }

  function storeDoomSaveBytes(slot, bytes) {
      var storage = getTerminalStorage();
      if (!storage) {
          return { ok: false, reason: 'storage-unavailable' };
      }
      if (!bytes || !bytes.length) {
          return { ok: false, reason: 'empty' };
      }
      var encoded = encodeBase64Bytes(bytes);
      if (!encoded) {
          return { ok: false, reason: 'encode-failed' };
      }
      var record = {
          version: DOOM_SAVE_VERSION,
          checksum: computeDoomChecksum(bytes),
          length: bytes.length,
          savedAt: Date.now(),
          data: encoded
      };
      try {
          storage.setItem(getDoomSaveKey(slot), JSON.stringify(record));
          doomState.lastSaveMeta = {
              slot: slot,
              savedAt: record.savedAt,
              length: record.length
          };
          return { ok: true, record: record };
      } catch (error) {
          return { ok: false, reason: 'write-failed', error: error };
      }
  }

  function loadDoomSaveBytes(slot) {
      var storage = getTerminalStorage();
      if (!storage) {
          return { ok: false, reason: 'storage-unavailable' };
      }
      try {
          var raw = storage.getItem(getDoomSaveKey(slot));
          if (!raw) {
              return { ok: false, reason: 'missing' };
          }
          var parsed = JSON.parse(raw);
          if (!parsed || parsed.version !== DOOM_SAVE_VERSION || typeof parsed.data !== 'string') {
              return { ok: false, reason: 'invalid-metadata' };
          }
          var decoded = decodeBase64ToBytes(parsed.data);
          if (!decoded) {
              return { ok: false, reason: 'decode-failed' };
          }
          if (parsed.length && parsed.length !== decoded.length) {
              return { ok: false, reason: 'length-mismatch' };
          }
          var checksum = computeDoomChecksum(decoded);
          if (parsed.checksum !== undefined && parsed.checksum !== checksum) {
              return { ok: false, reason: 'checksum-mismatch' };
          }
          return { ok: true, bytes: decoded, record: parsed };
      } catch (error) {
          return { ok: false, reason: 'read-failed', error: error };
      }
  }

  function clearDoomSaveSlot(slot) {
      var storage = getTerminalStorage();
      if (!storage) {
          return { ok: false, reason: 'storage-unavailable' };
      }
      try {
          storage.removeItem(getDoomSaveKey(slot));
          if (doomState.lastSaveMeta && doomState.lastSaveMeta.slot === slot) {
              doomState.lastSaveMeta = null;
          }
          if (doomState.pendingLoadSlot === slot) {
              doomState.pendingLoadSlot = null;
          }
          return { ok: true };
      } catch (error) {
          return { ok: false, reason: 'clear-failed', error: error };
      }
  }

  function doomSaveExists(slot) {
      var storage = getTerminalStorage();
      if (!storage) {
          return false;
      }
      try {
          return !!storage.getItem(getDoomSaveKey(slot));
      } catch (_err) {
          return false;
      }
  }

  function queueDoomLoad(slot) {
      doomState.pendingLoadSlot = slot;
  }

  function describeDoomSlot(slot) {
      return 'slot ' + slot;
  }

  function formatDoomStorageError(result) {
      if (!result) {
          return 'Unexpected DOOM storage error.';
      }
      if (result.reason === 'storage-unavailable') {
          return 'Browser storage unavailable.';
      }
      if (result.reason === 'encode-failed' || result.reason === 'decode-failed') {
          return 'Unable to serialise DOOM save data.';
      }
      if (result.reason === 'checksum-mismatch') {
          return 'Stored DOOM save appears corrupted.';
      }
      return 'DOOM storage operation failed.';
  }

  function ensureDoomAudioContext() {
      if (!doomAudioState.enabled) {
          return null;
      }
      if (doomAudioState.context) {
          return doomAudioState.context;
      }
      var AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) {
          doomAudioState.enabled = false;
          return null;
      }
      try {
          var context = new AudioContextCtor();
          var gain = context.createGain();
          gain.gain.value = 1;
          gain.connect(context.destination);
          doomAudioState.context = context;
          doomAudioState.masterGain = gain;
          doomAudioState.nextTime = context.currentTime;
          return context;
      } catch (_err) {
          doomAudioState.enabled = false;
          return null;
      }
  }

  function initDoomAudio(sampleRate) {
      doomAudioState.sampleRate = (typeof sampleRate === 'number' && sampleRate > 0) ? sampleRate : 11025;
      doomAudioState.enabled = true;
      ensureDoomAudioContext();
  }

  function resumeDoomAudio() {
      if (!doomAudioState.enabled) {
          return;
      }
      var context = ensureDoomAudioContext();
      if (!context) {
          return;
      }
      if (context.state === 'suspended' && typeof context.resume === 'function') {
          context.resume().catch(function() {});
      }
  }

  function shutdownDoomAudio() {
      doomAudioState.enabled = false;
      doomAudioState.nextTime = 0;
      doomAudioState.bufferCache.clear();
      doomAudioState.memoryBuffer = null;
      if (doomAudioState.context && typeof doomAudioState.context.close === 'function') {
          var ctx = doomAudioState.context;
          doomAudioState.context = null;
          doomAudioState.masterGain = null;
          ctx.close().catch(function() {});
      } else if (doomAudioState.context && typeof doomAudioState.context.suspend === 'function') {
          doomAudioState.context.suspend().catch(function() {});
      }
  }

  function playDoomSfx(ptr, length, sampleRate, leftVolume, rightVolume, pitch) {
      if (!doomAudioState.enabled) {
          return;
      }
      var context = ensureDoomAudioContext();
      if (!context || !doomState.memory || context.state === 'suspended') {
          return;
      }
      if ((!leftVolume || leftVolume <= 0) && (!rightVolume || rightVolume <= 0)) {
          return;
      }
      try {
          if (doomAudioState.memoryBuffer !== doomState.memory.buffer) {
              doomAudioState.bufferCache.clear();
              doomAudioState.memoryBuffer = doomState.memory.buffer;
          }
          var cacheKey = ptr + ':' + length;
          var cached = doomAudioState.bufferCache.get(cacheKey);
          var baseRate = (sampleRate && sampleRate > 0) ? sampleRate : doomAudioState.sampleRate;
          if (!baseRate || !isFinite(baseRate)) {
              baseRate = 11025;
          }
          if (!cached) {
              var view = new Uint8Array(doomState.memory.buffer, ptr, length);
              var monoData = new Float32Array(length);
              for (var idx = 0; idx < length; idx++) {
                  monoData[idx] = (view[idx] - 128) / 128;
              }
              cached = { data: monoData, sampleRate: baseRate };
              doomAudioState.bufferCache.set(cacheKey, cached);
          } else {
              baseRate = cached.sampleRate;
          }
          var mono = cached.data;
          var ratio = Math.pow(2, (pitch - 128) / 64);
          if (!isFinite(ratio) || ratio <= 0) {
              ratio = 1;
          }
          var effectiveRate = baseRate * ratio;
          if (!isFinite(effectiveRate) || effectiveRate <= 0) {
              effectiveRate = baseRate;
          }
          var playbackRatio = effectiveRate / context.sampleRate;
          if (!isFinite(playbackRatio) || playbackRatio <= 0) {
              playbackRatio = baseRate / context.sampleRate;
          }
          if (!isFinite(playbackRatio) || playbackRatio <= 0) {
              playbackRatio = 1;
          }
          var frames = Math.max(1, Math.ceil(mono.length / playbackRatio));
          var buffer = context.createBuffer(2, frames, context.sampleRate);
          var leftData = buffer.getChannelData(0);
          var rightData = buffer.getChannelData(1);
          var leftGain = Math.max(0, Math.min(1, leftVolume / 127));
          var rightGain = Math.max(0, Math.min(1, rightVolume / 127));
          for (var i = 0; i < frames; i++) {
              var sourceIndex = i * playbackRatio;
              var baseIndex = sourceIndex | 0;
              if (baseIndex >= mono.length) {
                  break;
              }
              var fraction = sourceIndex - baseIndex;
              var sample0 = mono[baseIndex];
              var sample1 = (baseIndex + 1 < mono.length) ? mono[baseIndex + 1] : sample0;
              var sample = sample0 + (sample1 - sample0) * fraction;
              leftData[i] = sample * leftGain;
              rightData[i] = sample * rightGain;
          }
          var source = context.createBufferSource();
          source.buffer = buffer;
          if (doomAudioState.masterGain) {
              source.connect(doomAudioState.masterGain);
          } else {
              source.connect(context.destination);
          }
          var now = context.currentTime;
          var scheduledTime = Math.max(now, doomAudioState.nextTime);
          source.start(scheduledTime);
          doomAudioState.nextTime = scheduledTime + buffer.duration;
          source.onended = function() {
              if (doomAudioState.context && doomAudioState.context.currentTime > doomAudioState.nextTime) {
                  doomAudioState.nextTime = doomAudioState.context.currentTime;
              }
          };
      } catch (_err) {
          // Ignore playback errors to keep gameplay responsive.
      }
  }

  function getDoomSaveApi() {
      if (!doomState.instance || !doomState.instance.exports) {
          return null;
      }
      var exports = doomState.instance.exports;
      var saveFn = exports.cm_save_state_v1 || exports.cm_save_state;
      var loadFn = exports.cm_load_state_v1 || exports.cm_load_state;
      var clearFn = exports.cm_clear_state_v1 || exports.cm_clear_state;
      if (typeof saveFn === 'function' && typeof loadFn === 'function') {
          return { saveFn: saveFn, loadFn: loadFn, clearFn: clearFn };
      }
      return null;
  }

  function detectDoomSaveSupport(/* instance */) {
      var api = getDoomSaveApi();
      doomState.supportsSaveStates = !!api;
      return doomState.supportsSaveStates;
  }

  function triggerDoomSave(slot) {
      if (!doomState.instance || !doomState.instance.exports) {
          return { ok: false, reason: 'inactive' };
      }
      var api = getDoomSaveApi();
      if (!api) {
          doomState.supportsSaveStates = false;
          return { ok: false, reason: 'missing-export' };
      }
      doomState.supportsSaveStates = true;
      try {
          var code = api.saveFn(slot | 0);
          if (code === undefined || code === 0) {
              return { ok: true, code: code };
          }
          return { ok: false, reason: 'engine', code: code };
      } catch (error) {
          return { ok: false, reason: 'exception', error: error };
      }
  }

  function triggerDoomLoad(slot) {
      if (!doomState.instance || !doomState.instance.exports) {
          return { ok: false, reason: 'inactive' };
      }
      var api = getDoomSaveApi();
      if (!api) {
          doomState.supportsSaveStates = false;
          return { ok: false, reason: 'missing-export' };
      }
      doomState.supportsSaveStates = true;
      try {
          var code = api.loadFn(slot | 0);
          if (code === undefined || code === 0) {
              return { ok: true, code: code };
          }
          return { ok: false, reason: 'engine', code: code };
      } catch (error) {
          return { ok: false, reason: 'exception', error: error };
      }
  }

  function wasmStoreDoomSave(slot, ptr, length) {
      var resolvedSlot = clampDoomSlot(slot);
      if (resolvedSlot === null) {
          return 2;
      }
      try {
          var bytes = new Uint8Array(doomState.memory.buffer, ptr, length);
          var copy = new Uint8Array(bytes.length);
          copy.set(bytes);
          var outcome = storeDoomSaveBytes(resolvedSlot, copy);
          if (outcome.ok) {
              return 0;
          }
          return 3;
      } catch (error) {
          console.error('Failed to persist DOOM save state:', error);
          return -5;
      }
  }

  function wasmLoadDoomSave(slot, ptr, capacity) {
      var resolvedSlot = clampDoomSlot(slot);
      if (resolvedSlot === null) {
          return 2;
      }
      var outcome = loadDoomSaveBytes(resolvedSlot);
      if (!outcome.ok) {
          return outcome.reason === 'missing' ? 1 : 3;
      }
      try {
          var bytes = outcome.bytes;
          if (!doomState.memory || !doomState.memory.buffer) {
              return -4;
          }
          if (capacity <= 0 || ptr === 0) {
              return bytes.length;
          }
          var writeLength = Math.min(bytes.length, capacity);
          var target = new Uint8Array(doomState.memory.buffer, ptr, writeLength);
          target.set(bytes.subarray(0, writeLength));
          doomState.lastLoadResult = {
              slot: resolvedSlot,
              length: writeLength,
              savedAt: outcome.record && outcome.record.savedAt
          };
          return writeLength;
      } catch (error) {
          console.error('Failed to hydrate DOOM save state:', error);
          return -5;
      }
  }

  function wasmClearDoomSave(slot) {
      var resolvedSlot = clampDoomSlot(slot);
      if (resolvedSlot === null) {
          return 2;
      }
      var result = clearDoomSaveSlot(resolvedSlot);
      return result.ok ? 0 : 3;
  }

  function handleDoomSaveCommand(slot) {
      var normalized = clampDoomSlot(slot);
      if (normalized === null) {
          terminal(['Invalid DOOM slot. Use numbers 0-' + DOOM_SAVE_MAX_SLOT + '.']);
          return;
      }
      if (!doomState.active || !doomState.instance) {
          terminal(['Launch DOOM (`play doom`) before saving progress.']);
          return;
      }
      if (!getDoomSaveApi()) {
          doomState.supportsSaveStates = false;
          terminal(['This DOOM build does not expose save-state support yet.']);
          return;
      }
      var outcome = triggerDoomSave(normalized);
      if (outcome.ok) {
          terminal(['Save request issued for ' + describeDoomSlot(normalized) + '.']);
          return;
      }
      if (outcome.reason === 'missing-export') {
          terminal(['This DOOM build does not support save-states yet.']);
          return;
      }
      if (outcome.reason === 'engine') {
          terminal(['Save request failed (code ' + outcome.code + ').']);
          return;
      }
      if (outcome.reason === 'exception') {
          var message = outcome.error && outcome.error.message ? outcome.error.message : 'Unexpected error.';
          terminal(['Save request failed: ' + message]);
          return;
      }
      terminal(['Unable to trigger DOOM save.']);
  }

  function handleDoomLoadCommand(slot) {
      var normalized = clampDoomSlot(slot);
      if (normalized === null) {
          terminal(['Invalid DOOM slot. Use numbers 0-' + DOOM_SAVE_MAX_SLOT + '.']);
          return;
      }
      if (!doomSaveExists(normalized)) {
          terminal(['No stored DOOM save for ' + describeDoomSlot(normalized) + '.']);
          return;
      }
      if (!doomState.active || !doomState.instance) {
          queueDoomLoad(normalized);
          terminal(['Queued ' + describeDoomSlot(normalized) + ' to load when DOOM launches. Run `play doom` to continue.']);
          return;
      }
      if (!getDoomSaveApi()) {
          doomState.supportsSaveStates = false;
          terminal(['This DOOM build does not expose save-state support yet.']);
          return;
      }
      var outcome = triggerDoomLoad(normalized);
      if (outcome.ok) {
          terminal(['Loaded DOOM save ' + describeDoomSlot(normalized) + '.']);
          return;
      }
      if (outcome.reason === 'missing-export') {
          terminal(['This DOOM build does not support save-state loading yet.']);
          return;
      }
      if (outcome.reason === 'engine') {
          if (outcome.code === 1) {
              terminal(['No stored DOOM save for ' + describeDoomSlot(normalized) + '.']);
          } else {
              terminal(['Load request failed (code ' + outcome.code + ').']);
          }
          return;
      }
      if (outcome.reason === 'exception') {
          var message = outcome.error && outcome.error.message ? outcome.error.message : 'Unexpected error.';
          terminal(['Load request failed: ' + message]);
          return;
      }
      terminal(['Unable to trigger DOOM load.']);
  }

  function handleDoomClearSlotCommand(slot) {
      var normalized = clampDoomSlot(slot);
      if (normalized === null) {
          terminal(['Invalid DOOM slot. Use numbers 0-' + DOOM_SAVE_MAX_SLOT + '.']);
          return;
      }
      var existed = doomSaveExists(normalized);
      var outcome = clearDoomSaveSlot(normalized);
      if (!outcome.ok) {
          terminal([formatDoomStorageError(outcome)]);
          return;
      }
      if (existed) {
          terminal(['Cleared DOOM save ' + describeDoomSlot(normalized) + '.']);
      } else {
          terminal(['No stored DOOM save for ' + describeDoomSlot(normalized) + '.']);
      }
  }

  function handleDoomClearAllCommand() {
      var clearedAny = false;
      for (var slot = 0; slot <= DOOM_SAVE_MAX_SLOT; slot++) {
          if (doomSaveExists(slot)) {
              var outcome = clearDoomSaveSlot(slot);
              if (outcome.ok) {
                  clearedAny = true;
              }
          }
      }
      if (clearedAny) {
          terminal(['Cleared all stored DOOM saves.']);
      } else {
          terminal(['No DOOM saves to clear.']);
      }
  }

  function parseDoomSlotInput(token) {
      if (token === undefined || token === null || token === '') {
          return 0;
      }
      return clampDoomSlot(token);
  }

  function doomStorageHelpLines() {
      return [
          'DOOM storage usage:',
          '  clear doom <slot|all>  Remove a stored run',
          'Note: requires updated DOOM build with save support.'
      ];
  }

  function maybeAutoLoadDoom() {
      if (!doomState.active || !doomState.instance) {
          return;
      }
      var api = getDoomSaveApi();
      if (!api) {
          doomState.supportsSaveStates = false;
          doomState.pendingLoadSlot = null;
          return;
      }
      doomState.supportsSaveStates = true;
      var slot = doomState.pendingLoadSlot;
      if (slot === null || slot === undefined) {
          return;
      }
      doomState.pendingLoadSlot = null;
      if (!doomSaveExists(slot)) {
          terminal(['No stored DOOM save for ' + describeDoomSlot(slot) + '.']);
          return;
      }
      window.setTimeout(function() {
          if (!doomState.active || !doomState.instance) {
              queueDoomLoad(slot);
              return;
          }
          var outcome = triggerDoomLoad(slot);
          if (outcome.ok) {
              terminal(['Loaded DOOM save ' + describeDoomSlot(slot) + '.']);
              return;
          }
          if (outcome.reason === 'missing-export') {
              terminal(['This DOOM build does not support save-state loading yet.']);
              return;
          }
          if (outcome.reason === 'engine') {
              terminal(['DOOM load request failed (code ' + outcome.code + ').']);
              return;
          }
          if (outcome.reason === 'exception') {
              var message = outcome.error && outcome.error.message ? outcome.error.message : 'Unexpected error.';
              terminal(['Failed to load DOOM save: ' + message]);
              return;
          }
          terminal(['Unable to load DOOM save.']);
      }, 250);
  }

  function getLatestArticles() {
      var articles = window.cmLatestArticles;
      if (!articles || typeof articles !== 'object') {
          return {};
      }
      return articles;
  }

  function getConsoleDispatches() {
      var list = window.cmConsoleDispatches;
      if (!Array.isArray(list)) {
          return [];
      }
      return list
        .map(function(entry) {
          if (!entry) return null;
          return {
              slug: entry.slug || '',
              title: entry.title || 'Untitled dispatch',
              authorId: entry.authorId || '',
              authorName: entry.authorName || entry.authorId || '',
              summary: entry.summary || '',
              url: entry.url || '',
              publishedAtIso: entry.publishedAtIso || '',
              displayPublishedAt: entry.displayPublishedAt || '',
              readingMinutes: entry.readingMinutes,
              tags: Array.isArray(entry.tags) ? entry.tags : []
          };
        })
        .filter(Boolean)
        .sort(function(a, b) {
          var aTime = a && a.publishedAtIso ? Date.parse(a.publishedAtIso) : 0;
          var bTime = b && b.publishedAtIso ? Date.parse(b.publishedAtIso) : 0;
          return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
        });
  }
  var prof = [
      [
          'Seaching... Profile found!',
          '---',
          'Name: Paul Kolesa',
          'Handle: m4xx3d0ut',
          'Email: ',
          'mailto:chaosandmajesty@gmail.com',
          'chaosandmajesty@gmail.com',
          'LinkedIn: ',
          'https://www.linkedin.com/in/paul-k-a3a18196/',
          'The Architect',
          'About: Paul (m4xx3d0ut) is Napster\'s Swiss Army Knife! Currently serving as Principal Technologist on the AI Tiger Team, he embeds with teams as an IC and arhitectural advisor. A Pythonista at heart, with an expansive background from InfoSec to Studio Production/Broadcast, he is capable of working across a number of languages and frameworks.',
          'Specialties: Python, Node, JS, React/TS, Kubernetes, Docker, AWS, GCP, OpenStack, Microk8s, InfoSec, DevOps/DevSecOps, GitOps, LlmOps',
          '---',
          'End of transmission...'
      ],
      [
          'Seaching... Profile found!',
          '---',
          'Name: Renee Kresho-Kolesa',
          'Handle: ReneeRules',
          'LinkedIn: ',
          'https://www.linkedin.com/in/rene%C3%A9-k-025083bb/',
          'Producer/Audio Engineer/Management',
          'About: Renee rules.',
          '---',
          'End of transmission...'
      ]
  ];
  var allowIn = true;
  var elementId = 0;
  var i = 0;
  var TERMINAL_INITIAL_SPEED = 75;
  var tSpeed = TERMINAL_INITIAL_SPEED;
  var terminalTimeoutId = null;
  String.prototype.trim = function() {
    return this.replace(/^\s+|\s+$/g, "");
  };

  function fadeBounce() {
      var tagline = document.getElementById("tagline");
      if (!tagline) return;
      if (intervalID !== null) clearInterval(intervalID);
      intervalID = setInterval(function() {
        // Re-check every interval before running!
        var body = document.getElementById("tagline");
        if (!body) return;
        show();
      }, taglineIntervalMs);
  }

  function show() {
      var body = document.getElementById("tagline");
      if (!body) return; // ultra-defensive
      opacity = Number(window.getComputedStyle(body).getPropertyValue("opacity"));
      if (!Number.isFinite(opacity)) {
        opacity = taglineMaxOpacity;
      }
      if (out === 0) {
        opacity += taglineStep;
        if (opacity >= taglineMaxOpacity) {
          opacity = taglineMaxOpacity;
          out = 1;
        }
      } else {
        opacity -= taglineStep;
        if (opacity <= taglineMinOpacity) {
          opacity = taglineMinOpacity;
          out = 0;
        }
      }
      body.style.opacity = opacity;
  }

  function checkIn(cli) {
      var i = cli;
      if(!allowIn) {
           window.setTimeout(checkIn, 100, i);
      } else {
          termFunc(i);
      }
  }

  function blink(element) {
      var speed = 1000;
      var eId = document.getElementById(element);
      if (!eId) return;
      var eolChar = '█'; // Define the cursor character
      eId.innerHTML += eolChar;
      setInterval(function (eId) {
          eId.style.visibility = (eId.style.visibility == 'hidden' ? '' : 'hidden');
      }, speed, eId);
  }

  function resolveLatest(alias) {
      if (!alias) return null;
      var latestArticles = getLatestArticles();
      var key = alias.toLowerCase();
      for (var id in latestArticles) {
          if (!Object.prototype.hasOwnProperty.call(latestArticles, id)) continue;
          var entry = latestArticles[id];
          if (!entry) continue;
          if (entry.id && entry.id.toLowerCase() === key) return entry;
          if (entry.aliases && entry.aliases.indexOf(key) !== -1) return entry;
          if (entry.name && entry.name.toLowerCase() === key) return entry;
      }
      return null;
  }

  function latestLines(entry) {
      var lines = [
          'Searching neon feeds... match found!',
          '---',
          'Author: ' + (entry.name || entry.id),
          'Title: ' + entry.title
      ];
      if (entry.summary) {
          lines.push('Summary: ' + entry.summary);
      }
      if (entry.url) {
          lines.push('Read: ');
          lines.push(entry.url);
          lines.push(entry.url);
      }
      lines.push('---');
      lines.push('End of transmission...');
      return lines;
  }

  function normaliseCount(value, fallback, max) {
      var parsed = parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
          parsed = fallback;
      }
      if (max && parsed > max) {
          parsed = max;
      }
      return parsed;
  }

  function formatPageHeading(label, pageIndex, totalPages) {
      var header = label ? label : 'Dispatch feed';
      return '// ' + header + ' // page ' + (pageIndex + 1) + '/' + totalPages;
  }

  function formatDispatchMeta(entry) {
      var bits = [];
      if (entry.displayPublishedAt) {
          bits.push(entry.displayPublishedAt);
      }
      if (entry.readingMinutes) {
          bits.push(entry.readingMinutes + ' min');
      }
      if (entry.tags && entry.tags.length) {
          bits.push('tags: ' + entry.tags.join(', '));
      }
      return bits.length ? '   ' + bits.join(' • ') : null;
  }

  function formatDispatchSummary(entry, index) {
      var author = entry.authorName || entry.authorId || 'Unknown operative';
      var base = '[' + String(index + 1).padStart(2, '0') + '] ' + entry.title + ' // ' + author;
      return base;
  }

  function buildDispatchLines(entries, options) {
      var opts = options || {};
      var perPage = opts.pageSize || DISPATCH_PAGE_SIZE;
      var heading = opts.heading || 'Dispatch feed';
      var emptyMessage = opts.emptyMessage || 'No dispatches to display.';

      if (!entries || !entries.length) {
          return [emptyMessage];
      }

      var lines = [];
      var totalPages = Math.ceil(entries.length / perPage);

      entries.forEach(function(entry, idx) {
          var pageIndex = Math.floor(idx / perPage);
          if (idx % perPage === 0) {
              lines.push(formatPageHeading(heading, pageIndex, totalPages));
              lines.push('---');
          }

          lines.push(formatDispatchSummary(entry, idx));
          var meta = formatDispatchMeta(entry);
          if (meta) {
              lines.push(meta);
          }
          if (entry.summary) {
              lines.push('   ' + entry.summary);
          }
          if (entry.url) {
              lines.push('Read: ');
              lines.push(entry.url);
              lines.push(entry.url);
          }

          var isEndOfPage = ((idx + 1) % perPage === 0) && (idx !== entries.length - 1);
          if (isEndOfPage) {
              lines.push('--- continue ---');
          } else if (idx !== entries.length - 1) {
              lines.push('---');
          }
      });

      lines.push('End of transmission...');
      return lines;
  }

  function sampleDispatches(entries, count) {
      if (!entries || !entries.length) {
          return [];
      }
      var pool = entries.slice();
      var limit = Math.min(count, pool.length);
      var picked = [];
      for (var i = 0; i < limit; i += 1) {
          var idx = Math.floor(Math.random() * pool.length);
          picked.push(pool[idx]);
          pool.splice(idx, 1);
      }
      return picked;
  }

  function searchDispatches(term, entries) {
      if (!term) return [];
      var normalised = term.toLowerCase();
      return entries.filter(function(entry) {
          if (!entry) return false;
          var haystacks = [entry.title, entry.summary, entry.authorName, entry.authorId];
          if (entry.tags && entry.tags.length) {
              haystacks = haystacks.concat(entry.tags.join(' '));
          }
          return haystacks.some(function(value) {
              if (!value) return false;
              return value.toLowerCase().indexOf(normalised) !== -1;
          });
      });
  }

  function getDoomConfig() {
      var config = window.cmDoomConfig || {};
      var base = config.assetBase || 'assets/doom/';
      if (typeof base === 'string' && base.slice(-1) !== '/') {
          base += '/';
      }
      var args = null;
      if (Array.isArray(config.args)) {
          args = config.args.map(function(value) {
              if (value === null || value === undefined) {
                  return null;
              }
              var text = String(value);
              return text.length ? text : null;
          }).filter(function(entry) {
              return entry !== null;
          });
          if (!args.length) {
              args = null;
          }
      }
      return {
          assetBase: base,
          canvasId: config.canvasId || 'doom-canvas',
          args: args
      };
  }

  function isDoomSupported() {
      return typeof WebAssembly === 'object';
  }

  function setDoomStatus(message) {
      if (doomState.statusNode) {
          doomState.statusNode.textContent = message || '';
      }
  }

  function pointerLockElement() {
      if (typeof document === 'undefined') {
          return null;
      }
      return document.pointerLockElement ||
          document.mozPointerLockElement ||
          document.webkitPointerLockElement ||
          null;
  }

  function supportsPointerLock(element) {
      if (!element) {
          return false;
      }
      return !!(element.requestPointerLock ||
          element.mozRequestPointerLock ||
          element.webkitRequestPointerLock);
  }

  function requestPointerLock(element) {
      if (!element) {
          return;
      }
      var request = element.requestPointerLock ||
          element.mozRequestPointerLock ||
          element.webkitRequestPointerLock;
      if (request) {
          try {
              request.call(element);
          } catch (_err) {
              // Browsers may throw if pointer lock is denied; ignore silently.
          }
      }
  }

  function exitPointerLock() {
      if (typeof document === 'undefined') {
          return;
      }
      var exit = document.exitPointerLock ||
          document.mozExitPointerLock ||
          document.webkitExitPointerLock;
      if (exit) {
          try {
              exit.call(document);
          } catch (_err) {
              // Pointer lock might already be released; ignore failures.
          }
      }
  }

  function isPointerLockedTo(element) {
      return !!element && pointerLockElement() === element;
  }

  function shouldShowDoomTouchControls() {
      if (typeof window === 'undefined') {
          return false;
      }
      var hasTouchSupport = false;
      try {
          hasTouchSupport = ('ontouchstart' in window) || (navigator && navigator.maxTouchPoints > 0);
      } catch (_err) {
          hasTouchSupport = false;
      }
      if (!hasTouchSupport) {
          return false;
      }
      if (typeof window.matchMedia === 'function') {
          try {
              var prefersFinePointer = window.matchMedia('(pointer: fine)').matches;
              var isLargeViewport = window.matchMedia('(min-width: 901px)').matches;
              if (prefersFinePointer && !window.matchMedia('(pointer: coarse)').matches) {
                  return false;
              }
              if (isLargeViewport) {
                  return false;
              }
          } catch (_err2) {
              // Ignore matchMedia errors/unsupported values.
          }
      }
      return true;
  }

  function isDesktopDoomEnvironment() {
      return !shouldShowDoomTouchControls();
  }

  function setVirtualKeyboardState(isOpen) {
      doomState.keyboardVisible = !!isOpen;
      if (doomState.keyboardToggleBtn) {
          doomState.keyboardToggleBtn.textContent = 'Toggle KB';
          doomState.keyboardToggleBtn.setAttribute('aria-pressed', doomState.keyboardVisible ? 'true' : 'false');
      }
  }

  function toggleVirtualKeyboard() {
      var inputEl = document.getElementById('uIn');
      if (!inputEl) {
          return;
      }
      if (!doomState.keyboardVisible) {
          var focused = false;
          if (navigator.virtualKeyboard && typeof navigator.virtualKeyboard.show === 'function') {
              try {
                  navigator.virtualKeyboard.show();
              } catch (_err) {
                  // ignore navigator virtual keyboard failures
              }
          }
          try {
              inputEl.focus({ preventScroll: true });
              focused = true;
          } catch (_err) {
              inputEl.focus();
              focused = true;
          }
          attachDoomKeyboardProxy(inputEl);
          setVirtualKeyboardState(focused || (document.activeElement === inputEl));
      } else {
          if (navigator.virtualKeyboard && typeof navigator.virtualKeyboard.hide === 'function') {
              try {
                  navigator.virtualKeyboard.hide();
              } catch (_err2) {
                  // ignore navigator virtual keyboard hide failures
              }
          }
          inputEl.blur();
          setVirtualKeyboardState(false);
          detachDoomKeyboardProxy();
          if (doomState.active) {
              focusDoomCanvas();
          }
      }
  }

  function syncKeyboardStateFromInput(inputEl) {
      if (!inputEl) {
          setVirtualKeyboardState(false);
          detachDoomKeyboardProxy();
          return;
      }
      var isActive = document.activeElement === inputEl;
      setVirtualKeyboardState(isActive);
      if (isActive) {
          attachDoomKeyboardProxy(inputEl);
      } else {
          detachDoomKeyboardProxy();
      }
  }

  function convertDomKeyToDoom(keyCode, keyValue) {
      var code = keyCode || 0;
      var keyLower = '';
      if (keyValue && typeof keyValue === 'string') {
          keyLower = keyValue.toLowerCase();
      }

      if (!code || code === 229) {
          if (keyLower.length === 1) {
              code = keyLower.charCodeAt(0);
          } else if (keyLower) {
              switch (keyLower) {
                  case 'arrowleft':
                      code = 37;
                      break;
                  case 'arrowup':
                      code = 38;
                      break;
                  case 'arrowright':
                      code = 39;
                      break;
                  case 'arrowdown':
                      code = 40;
                      break;
                  case 'escape':
                  case 'esc':
                      code = 27;
                      break;
                  case 'enter':
                  case 'return':
                      code = 13;
                      break;
                  case 'tab':
                      code = 9;
                      break;
                  case 'backspace':
                      code = 8;
                      break;
                  case 'space':
                  case 'spacebar':
                      code = 32;
                      break;
                  case 'control':
                  case 'ctrl':
                      code = 17;
                      break;
                  case 'alt':
                      code = 18;
                      break;
                  case 'shift':
                      code = 16;
                      break;
                  default:
                      code = 0;
              }
          }
      }

      if (!code) {
          return null;
      }

      switch (code) {
          case 8: return 127;
          case 9: return 9;
          case 13: return 13;
          case 16: return 0x80 + 0x2a; // shift
          case 17: return 0x80 + 0x1d;
          case 18: return 0x80 + 0x38;
          case 27: return 27;
          case 32: return 32;
          case 37: return 0xac;
          case 38: return 0xad;
          case 39: return 0xae;
          case 40: return 0xaf;
          default:
              if (code >= 65 && code <= 90) {
                  return code + 32;
              }
              if (code >= 112 && code <= 123) {
                  return code + 75;
              }
              if (keyLower.length === 1) {
                  return keyLower.charCodeAt(0);
              }
              return code;
      }
  }

  function attachDoomKeyboardProxy(inputEl) {
      if (!doomState.active || !inputEl || doomState.keyboardProxy) {
          return;
      }
      var sendChar = function(ch) {
          if (!doomState.active || !doomState.handleKeyDown) {
              return;
          }
          var mapped = convertDomKeyToDoom(ch.charCodeAt(0), ch);
          if (mapped === null) {
              return;
          }
          doomState.handleKeyDown(mapped);
          window.setTimeout(function() {
              doomState.handleKeyUp(mapped);
          }, 0);
      };

      var keydownHandler = function(event) {
          if (!doomState.active || !doomState.handleKeyDown) {
              return;
          }
          var code = convertDomKeyToDoom(event.keyCode || event.which || 0, event.key);
          if (code === null) {
              return;
          }
          event.preventDefault();
          event.stopPropagation();
          doomState.handleKeyDown(code);
      };
      var keyupHandler = function(event) {
          if (!doomState.active || !doomState.handleKeyUp) {
              return;
          }
          var code = convertDomKeyToDoom(event.keyCode || event.which || 0, event.key);
          if (code === null) {
              return;
          }
          event.preventDefault();
          event.stopPropagation();
          doomState.handleKeyUp(code);
      };

      var inputHandler = function(event) {
          if (!doomState.active) {
              return;
          }
          var value = inputEl.value;
          if (!value && event && typeof event.data === 'string') {
              value = event.data;
          }
          if (typeof value !== 'string' || !value.length) {
              inputEl.value = '';
              return;
          }
          for (var idx = 0; idx < value.length; idx += 1) {
              var ch = value.charAt(idx);
              sendChar(ch);
          }
          inputEl.value = '';
      };

      var compositionHandler = function(event) {
          if (!event || typeof event.data !== 'string') {
              return;
          }
          for (var idx = 0; idx < event.data.length; idx += 1) {
              sendChar(event.data.charAt(idx));
          }
          inputEl.value = '';
      };

      inputEl.addEventListener('keydown', keydownHandler, true);
      inputEl.addEventListener('keyup', keyupHandler, true);
      inputEl.addEventListener('input', inputHandler, true);
      inputEl.addEventListener('compositionend', compositionHandler, true);
      inputEl.value = '';
      doomState.keyboardProxy = {
          element: inputEl,
          onKeydown: keydownHandler,
          onKeyup: keyupHandler,
          onInput: inputHandler,
          onComposition: compositionHandler
      };
  }

  function detachDoomKeyboardProxy() {
      var proxy = doomState.keyboardProxy;
      if (!proxy || !proxy.element) {
          doomState.keyboardProxy = null;
          return;
      }
      try {
          proxy.element.removeEventListener('keydown', proxy.onKeydown, true);
          proxy.element.removeEventListener('keyup', proxy.onKeyup, true);
          proxy.element.removeEventListener('input', proxy.onInput, true);
          proxy.element.removeEventListener('compositionend', proxy.onComposition, true);
      } catch (_err) {
          // ignore detach errors
      }
      doomState.keyboardProxy = null;
  }

  function ensureDoomOverlay() {
      var consoleEl = document.getElementById('console');
      var screen = document.getElementById('tOut');
      if (!consoleEl || !screen) {
          return null;
      }

      var overlay = document.createElement('div');
      overlay.className = 'doom-overlay';

      var status = document.createElement('div');
      status.className = 'doom-overlay__status';
      overlay.appendChild(status);

      var canvasWrap = document.createElement('div');
      canvasWrap.className = 'doom-overlay__canvas-wrap';
      var canvas = document.createElement('canvas');
      canvas.id = getDoomConfig().canvasId;
      canvas.tabIndex = -1;
      canvas.width = 640;
      canvas.height = 400;
      canvasWrap.appendChild(canvas);
      overlay.appendChild(canvasWrap);

      var controls = document.createElement('div');
      controls.className = 'doom-overlay__controls';
      var instructions = document.createElement('span');
      instructions.textContent = 'WASD / arrows to move · Ctrl / Space to shoot · `exit doom` to leave';
      controls.appendChild(instructions);
      var controlButtons = document.createElement('div');
      controlButtons.className = 'doom-overlay__buttons';

      var escBtn = document.createElement('button');
      escBtn.type = 'button';
      escBtn.textContent = 'Esc';
      escBtn.addEventListener('click', function() {
          var canvas = doomState.canvas;
          var hasPointerLock = supportsPointerLock(canvas);
          if (hasPointerLock && isPointerLockedTo(canvas)) {
              exitPointerLock();
              setDoomStatus('Mouse free; tap canvas to capture again.');
              focusDoomCanvas();
              return;
          }
          if (typeof doomState.sendVirtualKey === 'function') {
              doomState.sendVirtualKey(27);
          }
      });
      controlButtons.appendChild(escBtn);

      var exitBtn = document.createElement('button');
      exitBtn.type = 'button';
      exitBtn.textContent = 'Exit DOOM';
      exitBtn.addEventListener('click', function() {
          teardownDoom('User exit.');
          terminal(['Exited DOOM.']);
      });
      controlButtons.appendChild(exitBtn);

      var keyboardBtn = document.createElement('button');
      keyboardBtn.type = 'button';
      keyboardBtn.textContent = 'Toggle KB';
      registerDoomListener(keyboardBtn, 'click', function() {
          var inputEl = document.getElementById('uIn');
          if (!doomState.keyboardVisible) {
              toggleVirtualKeyboard();
              return;
          }
          if (navigator.virtualKeyboard && typeof navigator.virtualKeyboard.hide === 'function') {
              try {
                  navigator.virtualKeyboard.hide();
              } catch (_err) {
                  // ignore virtual keyboard hide failures
              }
          }
          if (inputEl && document.activeElement === inputEl) {
              inputEl.blur();
          } else {
              setVirtualKeyboardState(false);
              detachDoomKeyboardProxy();
              if (doomState.active) {
                  focusDoomCanvas();
              }
          }
      });
      controlButtons.appendChild(keyboardBtn);

      doomState.keyboardToggleBtn = keyboardBtn;

      controls.appendChild(controlButtons);
      overlay.appendChild(controls);

      var keyboardInput = document.getElementById('uIn');
      if (keyboardInput) {
          registerDoomListener(keyboardInput, 'focus', function() {
              if (doomState.active) {
                  syncKeyboardStateFromInput(keyboardInput);
              }
          });
          registerDoomListener(keyboardInput, 'blur', function() {
              syncKeyboardStateFromInput(keyboardInput);
          });
          syncKeyboardStateFromInput(keyboardInput);
      } else {
          setVirtualKeyboardState(false);
      }

      if (shouldShowDoomTouchControls()) {
          var touchControls = document.createElement('div');
          touchControls.className = 'doom-touch-controls';
          overlay.appendChild(touchControls);
          doomState.touchControlsRoot = touchControls;
      } else {
          doomState.touchControlsRoot = null;
      }

      screen.appendChild(overlay);
      consoleEl.classList.add('has-doom');

      doomState.screenEl = screen;
      doomState.prevScrollTop = screen.scrollTop;
      doomState.prevOverflow = screen.style.overflowY;
      screen.scrollTop = 0;
      screen.style.overflowY = 'hidden';

      doomState.overlay = overlay;
      doomState.canvas = canvas;
      doomState.statusNode = status;

      return overlay;
  }

  function registerDoomListener(target, type, handler, options) {
      if (!target || !type || typeof handler !== 'function') {
          return;
      }
      target.addEventListener(type, handler, options || false);
      doomState.listeners.push({ target: target, type: type, handler: handler, options: options || false });
  }

  function removeDoomListeners() {
      doomState.listeners.forEach(function(binding) {
          var target = binding.target;
          if (target && typeof target.removeEventListener === 'function') {
              try {
                  target.removeEventListener(binding.type, binding.handler, binding.options);
              } catch (_err) {
                  // ignore
              }
          }
      });
      doomState.listeners = [];
  }

  function instantiateDoom() {
      if (doomState.instancePromise) {
          return doomState.instancePromise;
      }

      var config = getDoomConfig();
      var wasmUrl = config.assetBase + 'doom.wasm';
      var canvas = doomState.canvas;
      if (!canvas) {
          return Promise.reject(new Error('DOOM canvas missing.'));
      }

      var context = canvas.getContext('2d');
      doomState.context = context;
      var doomScreenWidth = 320 * 2;
      var doomScreenHeight = 200 * 2;

      doomState.memory = new WebAssembly.Memory({ initial: DOOM_DEFAULT_ZONE_MB * 16 });
      doomAudioState.bufferCache.clear();
      doomAudioState.memoryBuffer = doomState.memory.buffer;
      var startTime = performance.now();

      function readString(offset, length) {
          try {
              var bytes = new Uint8Array(doomState.memory.buffer, offset, length);
              if (doomTextDecoder) {
                  return doomTextDecoder.decode(bytes);
              }
              return new TextDecoder('utf8').decode(bytes);
          } catch (_err) {
              return '';
          }
      }

      function drawCanvas(ptr) {
          if (!doomState.context) {
              return;
          }
          var doomScreen = new Uint8ClampedArray(doomState.memory.buffer, ptr, doomScreenWidth * doomScreenHeight * 4);
          var renderScreen = new ImageData(doomScreen, doomScreenWidth, doomScreenHeight);
          doomState.context.putImageData(renderScreen, 0, 0);
      }

      var importObject = {
          js: {
              js_console_log: function(offset, length) {
                  console.log('[DOOM]', readString(offset, length));
              },
              js_stdout: function(offset, length) {
                  console.log('[DOOM stdout]', readString(offset, length));
              },
              js_stderr: function(offset, length) {
                  console.error('[DOOM stderr]', readString(offset, length));
              },
              js_milliseconds_since_start: function() {
                  return performance.now() - startTime;
              },
              js_draw_screen: drawCanvas,
              js_audio_init: function(sampleRate) {
                  initDoomAudio(sampleRate);
              },
              js_audio_play_sfx: function(ptr, length, sampleRate, leftVolume, rightVolume, pitch) {
                  playDoomSfx(ptr, length, sampleRate, leftVolume, rightVolume, pitch);
              },
              js_audio_shutdown: function() {
                  shutdownDoomAudio();
              },
              js_save_state_store: function(slot, ptr, length) {
                  return wasmStoreDoomSave(slot, ptr, length);
              },
              js_save_state_load: function(slot, ptr, capacity) {
                  return wasmLoadDoomSave(slot, ptr, capacity);
              },
              js_save_state_clear: function(slot) {
                  return wasmClearDoomSave(slot);
              }
          },
          env: {
              memory: doomState.memory
          }
      };

      setDoomStatus('Fetching DOOM wasm...');

      doomState.instancePromise = fetch(wasmUrl).then(function(response) {
          if (!response.ok) {
              throw new Error('Failed to fetch DOOM wasm at ' + wasmUrl + ' (' + response.status + ')');
          }
          if (WebAssembly.instantiateStreaming) {
              return WebAssembly.instantiateStreaming(response.clone(), importObject).catch(function(streamError) {
                  return response.arrayBuffer().then(function(buffer) {
                      return WebAssembly.instantiate(buffer, importObject);
                  });
              });
          }
          return response.arrayBuffer().then(function(buffer) {
              return WebAssembly.instantiate(buffer, importObject);
          });
      }).then(function(result) {
          doomState.instance = result.instance;
          detectDoomSaveSupport(result.instance);
          setDoomStatus('WASM ready. Initialising...');
          return result.instance;
      }).catch(function(error) {
          doomState.instancePromise = null;
          doomState.instance = null;
          doomState.memory = null;
          doomState.context = null;
          shutdownDoomAudio();
          throw error;
      });

      return doomState.instancePromise;
  }

  function normalizeDoomArgs(args) {
      if (!Array.isArray(args) || !args.length) {
          return [];
      }
      var normalized = [];
      for (var i = 0; i < args.length; i += 1) {
          var current = args[i];
          if (current === null || current === undefined) {
              continue;
          }
          var value = String(current);
          if (!value) {
              continue;
          }
          if (value.toLowerCase() === '-mb') {
              var next = (i + 1 < args.length) ? args[i + 1] : null;
              var nextValue = (next === null || next === undefined) ? '' : String(next).trim();
              if (nextValue) {
                  normalized.push('-mb' + nextValue);
                  i += 1;
                  continue;
              }
          }
          normalized.push(value);
      }
      return normalized;
  }

  function invokeDoomMain(instance) {
      if (!instance || !instance.exports || typeof instance.exports.main !== 'function') {
          throw new Error('DOOM wasm missing main() export');
      }

      var exports = instance.exports;
      if (!doomState.memory || typeof exports.malloc !== 'function') {
          exports.main();
          return;
      }

      var config = getDoomConfig();
      var extraArgs = config.args ? config.args.slice() : [];
      var hasMbArg = extraArgs.some(function(arg) {
          if (typeof arg !== 'string') {
              return false;
          }
          if (arg.toLowerCase() === '-mb') {
              return true;
          }
          if (arg.length > 3 && arg.slice(0, 3).toLowerCase() === '-mb') {
              return true;
          }
          return false;
      });

      var finalArgs = ['doom.wasm'];
      if (!hasMbArg) {
          finalArgs = finalArgs.concat(DOOM_DEFAULT_LAUNCH_ARGS);
      }
      if (extraArgs.length) {
          finalArgs = finalArgs.concat(extraArgs);
      }

      var argvStrings = normalizeDoomArgs(finalArgs);

      try {
          if (typeof console !== 'undefined' && typeof console.log === 'function') {
              console.log('[DOOM] Launch argv:', argvStrings);
          }
          var writeCString = function(text) {
              var content = (typeof text === 'string') ? text : '';
              var length = content.length + 1;
              var ptr = exports.malloc(length);
              if (!ptr) {
                  throw new Error('Failed to allocate DOOM argv string.');
              }
              var view = new Uint8Array(doomState.memory.buffer, ptr, length);
              for (var j = 0; j < content.length; j += 1) {
                  view[j] = content.charCodeAt(j) & 0xff;
              }
              view[length - 1] = 0;
              return ptr;
          };

          var argc = argvStrings.length;
          if (argc === 0) {
              argvStrings = ['doom.wasm'];
              argc = 1;
          }
          var argvPtr = exports.malloc((argc + 1) * 4);
          if (!argvPtr) {
              throw new Error('Failed to allocate DOOM argv table.');
          }

          var argvView = new Uint32Array(doomState.memory.buffer, argvPtr, argc + 1);
          for (var index = 0; index < argc; index += 1) {
              argvView[index] = writeCString(argvStrings[index]);
          }
          argvView[argc] = 0;

          exports.main(argc, argvPtr);
      } catch (error) {
          console.error('Failed to launch DOOM with custom argv. Falling back to bare main()', error);
          exports.main();
      }
  }

  function setupDoomInteractions(instance) {
      var canvas = doomState.canvas;
      if (!canvas || !instance || !instance.exports || typeof instance.exports.add_browser_event !== 'function') {
          return;
      }

      if (!canvas.hasAttribute('tabindex')) {
          canvas.setAttribute('tabindex', '0');
      }

      var exports = instance.exports;

      var keyDown = function(code) { exports.add_browser_event(0, code); };
      var keyUp = function(code) { exports.add_browser_event(1, code); };

      doomState.handleKeyDown = keyDown;
      doomState.handleKeyUp = keyUp;

      doomState.sendVirtualKey = function(keyCode) {
          var code = convertDomKeyToDoom(keyCode, null);
          if (code === null) {
              return;
          }
          keyDown(code);
          setTimeout(function() {
              keyUp(code);
          }, 0);
      };

      registerDoomListener(canvas, 'keydown', function(event) {
          var mapped = convertDomKeyToDoom(event.keyCode, event.key);
          if (mapped === null) {
              return;
          }
          keyDown(mapped);
          resumeDoomAudio();
          event.preventDefault();
      });
      registerDoomListener(canvas, 'keyup', function(event) {
          var mapped = convertDomKeyToDoom(event.keyCode, event.key);
          if (mapped === null) {
              return;
          }
          keyUp(mapped);
          resumeDoomAudio();
          event.preventDefault();
      });

      var pointerLockSupported = supportsPointerLock(canvas);

      registerDoomListener(canvas, 'click', function() {
          if (pointerLockSupported && !isPointerLockedTo(canvas)) {
              requestPointerLock(canvas);
          }
          resumeDoomAudio();
          focusDoomCanvas();
      });

      if (pointerLockSupported) {
          var handlePointerLockChange = function() {
              if (!doomState.active || !doomState.overlay || !doomState.statusNode) {
                  return;
              }
              if (isPointerLockedTo(canvas)) {
                  setDoomStatus('Running. Press Esc to release mouse. Type `exit doom` to leave.');
              } else {
                  setDoomStatus('Running. Mouse free; click canvas to capture. Type `exit doom` to leave.');
              }
          };
          var handlePointerLockError = function() {
              if (doomState.active) {
                  setDoomStatus('Unable to capture mouse. Click canvas to try again.');
              }
          };
          registerDoomListener(document, 'pointerlockchange', handlePointerLockChange);
          registerDoomListener(document, 'mozpointerlockchange', handlePointerLockChange);
          registerDoomListener(document, 'webkitpointerlockchange', handlePointerLockChange);
          registerDoomListener(document, 'pointerlockerror', handlePointerLockError);
          registerDoomListener(document, 'mozpointerlockerror', handlePointerLockError);
          registerDoomListener(document, 'webkitpointerlockerror', handlePointerLockError);
      }

      if (isDesktopDoomEnvironment()) {
          var blockedMetaKeys = { w: true, r: true, t: true, n: true, l: true, tab: true, s: true, p: true, o: true };
          registerDoomListener(window, 'keydown', function(event) {
              if (!doomState.active || !isDesktopDoomEnvironment()) {
                  return;
              }
              var key = (event.key || '').toLowerCase();
              var metaCombo = event.metaKey || event.ctrlKey;
              if (metaCombo && blockedMetaKeys[key]) {
                  event.preventDefault();
                  event.stopPropagation();
                  return;
              }
              if (!metaCombo && (key === 'f5' || key === 'f11')) {
                  event.preventDefault();
                  event.stopPropagation();
              }
          }, true);
      }

      if (shouldShowDoomTouchControls() && doomState.touchControlsRoot) {
          setupTouchControls();
      }

      function bindVirtualButton(button, keyCode) {
          if (!button) {
              return;
          }
          var doomKey = convertDomKeyToDoom(keyCode, null);
          if (doomKey === null) {
              return;
          }
          var activeIds = new Set();
          var pointerSupported = typeof window !== 'undefined' && typeof window.PointerEvent === 'function';

          var pressPointer = function(pointerId) {
              if (activeIds.size === 0) {
                  keyDown(doomKey);
              }
              activeIds.add(pointerId);
              button.classList.add('is-active');
              focusDoomCanvas();
          };
          var releasePointer = function(pointerId) {
              if (!activeIds.has(pointerId)) {
                  return;
              }
              activeIds.delete(pointerId);
              if (activeIds.size === 0) {
                  button.classList.remove('is-active');
                  keyUp(doomKey);
              }
          };
          var releaseAll = function() {
              if (activeIds.size > 0) {
                  activeIds.clear();
                  button.classList.remove('is-active');
                  keyUp(doomKey);
              }
          };

          doomState.virtualKeyReleasers.push(releaseAll);

          registerDoomListener(button, 'contextmenu', function(event) {
              event.preventDefault();
          });

          if (pointerSupported) {
              registerDoomListener(button, 'pointerdown', function(event) {
                  event.preventDefault();
                  event.stopPropagation();
                  resumeDoomAudio();
                  if (typeof button.setPointerCapture === 'function') {
                      try {
                          button.setPointerCapture(event.pointerId);
                      } catch (_err) {
                          // Ignore capture errors on unsupported targets.
                      }
                  }
                  pressPointer(event.pointerId);
              });
              var finishPointer = function(event) {
                  event.preventDefault();
                  event.stopPropagation();
                  if (typeof button.releasePointerCapture === 'function') {
                      try {
                          button.releasePointerCapture(event.pointerId);
                      } catch (_err) {
                          // Ignore release errors if pointer capture was never taken.
                      }
                  }
                  releasePointer(event.pointerId);
              };
          registerDoomListener(button, 'pointerup', finishPointer);
          registerDoomListener(button, 'pointercancel', finishPointer);
          } else {
              var touchIdPrefix = 'touch-';
              registerDoomListener(button, 'touchstart', function(event) {
                  event.preventDefault();
                  event.stopPropagation();
                  resumeDoomAudio();
                  Array.prototype.forEach.call(event.changedTouches || [], function(touch) {
                      pressPointer(touchIdPrefix + touch.identifier);
                  });
                  if (!event.changedTouches || event.changedTouches.length === 0) {
                      pressPointer(touchIdPrefix + '0');
                  }
              }, { passive: false });
              var finishTouch = function(event) {
                  event.preventDefault();
                  event.stopPropagation();
                  var handled = false;
                  Array.prototype.forEach.call(event.changedTouches || [], function(touch) {
                      handled = true;
                      releasePointer(touchIdPrefix + touch.identifier);
                  });
                  if (!handled) {
                      releasePointer(touchIdPrefix + '0');
                  }
              };
              registerDoomListener(button, 'touchend', finishTouch);
              registerDoomListener(button, 'touchcancel', finishTouch);
              registerDoomListener(button, 'mousedown', function(event) {
                  event.preventDefault();
                  event.stopPropagation();
                  resumeDoomAudio();
                  pressPointer('mouse');
              });
              registerDoomListener(button, 'mouseup', function(event) {
                  event.preventDefault();
                  event.stopPropagation();
                  releasePointer('mouse');
              });
              registerDoomListener(button, 'mouseleave', function(event) {
                  event.preventDefault();
                  event.stopPropagation();
                  releasePointer('mouse');
              });
          }
      }

      function makeTouchButton(label, keyCode, extraClass) {
          var button = document.createElement('button');
          button.type = 'button';
          button.textContent = label;
          button.className = 'doom-touch-button' + (extraClass ? ' ' + extraClass : '');
          bindVirtualButton(button, keyCode);
          return button;
      }

      function setupTouchControls() {
          var root = doomState.touchControlsRoot;
          if (!root) {
              return;
          }

          doomState.virtualKeyReleasers.forEach(function(releaseFn) {
              if (typeof releaseFn === 'function') {
                  try {
                      releaseFn();
                  } catch (_err) {
                      // ignore cleanup errors when rehydrating controls
                  }
              }
          });
          doomState.virtualKeyReleasers = [];

          root.innerHTML = '';

          var leftCluster = document.createElement('div');
          leftCluster.className = 'doom-touch-controls__cluster doom-touch-controls__cluster--left';
          var leftRow = document.createElement('div');
          leftRow.className = 'doom-touch-controls__row';
          leftRow.appendChild(makeTouchButton('Alt', 18, 'doom-touch-button--alt'));
          leftRow.appendChild(makeTouchButton('Ctrl', 17, 'doom-touch-button--ctrl'));
          leftCluster.appendChild(leftRow);

          var rightCluster = document.createElement('div');
          rightCluster.className = 'doom-touch-controls__cluster doom-touch-controls__cluster--right';
          var enterButton = makeTouchButton('Enter', 13, 'doom-touch-button--enter');
          var spaceButton = makeTouchButton('Space', 32, 'doom-touch-button--space');
          spaceButton.setAttribute('aria-label', 'Space');

          var actionRow = document.createElement('div');
          actionRow.className = 'doom-touch-controls__row doom-touch-controls__row--actions';
          actionRow.appendChild(spaceButton);
          actionRow.appendChild(enterButton);
          rightCluster.appendChild(actionRow);

          var dpad = document.createElement('div');
          dpad.className = 'doom-touch-dpad';

          var dpadTop = document.createElement('div');
          dpadTop.className = 'doom-touch-dpad__row doom-touch-dpad__row--top';
          dpadTop.appendChild(document.createElement('span'));
          dpadTop.appendChild(makeTouchButton('↑', 38, 'doom-touch-button--up'));
          dpadTop.appendChild(document.createElement('span'));

          var dpadMid = document.createElement('div');
          dpadMid.className = 'doom-touch-dpad__row doom-touch-dpad__row--middle';
          dpadMid.appendChild(makeTouchButton('←', 37, 'doom-touch-button--left'));
          dpadMid.appendChild(makeTouchButton('↓', 40, 'doom-touch-button--down'));
          dpadMid.appendChild(makeTouchButton('→', 39, 'doom-touch-button--right'));

          var dpadBottom = document.createElement('div');
          dpadBottom.className = 'doom-touch-dpad__row doom-touch-dpad__row--bottom';
          dpadBottom.appendChild(document.createElement('span'));
          dpadBottom.appendChild(document.createElement('span'));
          dpadBottom.appendChild(document.createElement('span'));

          dpad.appendChild(dpadTop);
          dpad.appendChild(dpadMid);
          dpad.appendChild(dpadBottom);

          rightCluster.appendChild(dpad);

          root.appendChild(leftCluster);
          root.appendChild(rightCluster);
      }
  }

  function beginDoomLoop(instance) {
      if (!instance || !instance.exports || typeof instance.exports.doom_loop_step !== 'function') {
          setDoomStatus('DOOM runtime missing loop entry point.');
          return;
      }

      var step = function() {
          if (!doomState.active || !doomState.instance) {
              return;
          }
          try {
              instance.exports.doom_loop_step();
          } catch (error) {
              console.error('DOOM runtime error:', error);
              setDoomStatus('Runtime error. See console for details.');
              teardownDoom();
              return;
          }
          doomState.loopHandle = requestAnimationFrame(step);
      };

      doomState.loopFn = step;
      doomState.loopHandle = requestAnimationFrame(step);
      if (supportsPointerLock(doomState.canvas)) {
          setDoomStatus('Running. Mouse free; click canvas to capture. Type `exit doom` to leave.');
      } else {
          setDoomStatus('Running. Type `exit doom` to leave.');
      }
  }

  function focusDoomCanvas() {
      if (doomState.canvas && typeof doomState.canvas.focus === 'function') {
          try {
              doomState.canvas.focus({ preventScroll: true });
          } catch (_err) {
              doomState.canvas.focus();
          }
      }
  }

  function startDoom() {
      if (!isDoomSupported()) {
          terminal(['This browser does not support WebAssembly. Unable to launch DOOM.']);
          return;
      }
      if (doomState.active) {
          terminal(['DOOM is already running. Type `exit doom` to return.']);
          return;
      }

      var overlay = ensureDoomOverlay();
      if (!overlay) {
          terminal(['Unable to mount DOOM viewport.']);
          return;
      }

      if (typeof document !== 'undefined' && document.body) {
          document.body.classList.add('doom-prevent-highlight');
      }
      setVirtualKeyboardState(false);

      doomState.active = true;
      pauseLogo(LOGO_PAUSE_REASON_DOOM);
      setDoomStatus('Initializing DOOM runtime...');

      instantiateDoom().then(function(instance) {
          invokeDoomMain(instance);
          detectDoomSaveSupport(instance);
          setupDoomInteractions(instance);
          setDoomStatus('Loaded. Click canvas to capture controls.');
          focusDoomCanvas();
          beginDoomLoop(instance);
          maybeAutoLoadDoom();
      }).catch(function(error) {
          terminal(['Failed to load DOOM assets.', error && error.message ? error.message : '']);
          teardownDoom();
      });
  }

  function teardownDoom(message) {
      resumeLogo(LOGO_PAUSE_REASON_DOOM);
      if (!doomState.active && !doomState.overlay) {
          return;
      }

      shutdownDoomAudio();
      if (typeof document !== 'undefined' && document.body) {
          document.body.classList.remove('doom-prevent-highlight');
      }

      var consoleEl = document.getElementById('console');
      if (consoleEl) {
          consoleEl.classList.remove('has-doom');
      }
      if (doomState.overlay && doomState.overlay.parentNode) {
          doomState.overlay.parentNode.removeChild(doomState.overlay);
      }

      if (doomState.loopHandle) {
          cancelAnimationFrame(doomState.loopHandle);
      }

      doomState.active = false;

      removeDoomListeners();

      exitPointerLock();

      doomState.overlay = null;
      doomState.canvas = null;
      doomState.statusNode = null;
      doomState.instance = null;
      doomState.instancePromise = null;
      doomState.context = null;
      doomState.memory = null;
      doomState.loopHandle = null;
      doomState.loopFn = null;
      doomState.sendVirtualKey = null;
      doomState.supportsSaveStates = false;
      doomState.pendingLoadSlot = null;
      doomState.handleKeyDown = null;
      doomState.handleKeyUp = null;
      detachDoomKeyboardProxy();
      if (doomState.screenEl) {
          if (doomState.prevOverflow !== null) {
              doomState.screenEl.style.overflowY = doomState.prevOverflow;
          } else {
              doomState.screenEl.style.removeProperty('overflow-y');
          }
          if (doomState.prevScrollTop !== null && doomState.prevScrollTop !== undefined) {
              doomState.screenEl.scrollTop = doomState.prevScrollTop;
          }
      }
      doomState.screenEl = null;
      doomState.prevScrollTop = null;
      doomState.prevOverflow = null;
      doomState.virtualKeyReleasers.forEach(function(releaseFn) {
          if (typeof releaseFn === 'function') {
              try {
                  releaseFn();
              } catch (_err) {
                  // ignore failures while unwinding virtual key state
              }
          }
      });
      doomState.virtualKeyReleasers = [];
      if (doomState.touchControlsRoot) {
          doomState.touchControlsRoot.innerHTML = '';
      }
      doomState.touchControlsRoot = null;
      doomState.lastSaveMeta = null;
      doomState.lastLoadResult = null;
      setVirtualKeyboardState(false);
      doomState.keyboardToggleBtn = null;
      doomState.keyboardVisible = false;
      detachDoomKeyboardProxy();

      if (message) {
          terminal([message]);
      }
  }

  function helpLines() {
      return [
          'Available commands:',
          '---',
          'help, ?            Show this menu',
          'latest <alias>     Fetch the latest dispatch',
          'top <N>            Fetch the top N dispatches (default 3)',
          'search <term>      Search dispatches for a term',
          'random <N>         Pull N random dispatches (default 3)',
          'profile <alias>    Reveal a dossier',
          'play doom          Boot the shareware DOOM build',
          'exit doom          Shut down the DOOM session',
          'clear doom <slot|all> Remove stored DOOM saves',
          'theme <contrast|1337> Switch console contrast',
          'theme toggle       Flip the current contrast mode',
          'clear              Purge terminal output',
          '↑ / ↓              Browse command history'
      ];
  }

  function profileHelpLines() {
      return [
          'Usage: profile <alias>',
          'Aliases:',
          '  m4xx3d0ut → paul, pk, paulkolesa, m4xx3d0ut, architect, th34rch1t3ct',
          '  ReneéRules → renee, rr, rk, matica, matica8, reneerules'
      ];
  }

  function themeHelpLines() {
      return [
          'Usage: theme <contrast|1337|toggle>',
          '  theme contrast   Engage soft contrast mode',
          '  theme 1337       Engage neon / 1337 mode',
          '  theme toggle     Flip between stored modes'
      ];
  }

  function detectProfileIndex(alias) {
      if (!alias) return null;
      var key = alias.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(profileAliases, key)) {
          return profileAliases[key];
      }
      return null;
  }

  function detectProfileIndexFromInput(input) {
      if (!input) return null;
      var direct = detectProfileIndex(input);
      if (direct !== null && direct !== undefined) {
          return direct;
      }
      for (var key in profileAliases) {
          if (!Object.prototype.hasOwnProperty.call(profileAliases, key)) continue;
          if (input.indexOf(key) !== -1) {
              return profileAliases[key];
          }
      }
      return null;
  }

  function getTerminalStorage() {
      try {
          if (typeof window === 'undefined' || !window.localStorage) {
              return null;
          }
          return window.localStorage;
      } catch (_err) {
          return null;
      }
  }

  function trimTerminalHtml(html) {
      if (!html || TERMINAL_MAX_SEGMENTS <= 0) {
          return html;
      }
      var segments = html.split('<br>');
      if (segments.length <= TERMINAL_MAX_SEGMENTS) {
          return html;
      }
      return segments.slice(segments.length - TERMINAL_MAX_SEGMENTS).join('<br>');
  }

  function persistTerminalBuffer(term) {
      if (!term) {
          return;
      }
      var storage = getTerminalStorage();
      if (!storage) {
          return;
      }
      try {
          var html = term.innerHTML;
          if (!html) {
              storage.removeItem(TERMINAL_STORAGE_KEY);
              return;
          }
          var trimmed = trimTerminalHtml(html);
          if (trimmed !== html) {
              term.innerHTML = trimmed;
          }
          storage.setItem(TERMINAL_STORAGE_KEY, trimmed);
      } catch (_err) {
          // Ignore persistence failures (e.g. storage disabled)
      }
  }

  function restoreTerminalBuffer(term) {
      var storage = getTerminalStorage();
      if (!term || !storage) {
          return false;
      }
      try {
          var stored = storage.getItem(TERMINAL_STORAGE_KEY);
          if (!stored) {
              return false;
          }
          term.innerHTML = stored;
          if (stored.slice(-2) !== '$ ') {
              term.innerHTML += '<br>$ ';
          }
          terminalRestored = true;
          allowIn = true;
          elementId = 0;
          i = 0;
          persistTerminalBuffer(term);
          scrollTerm(term);
          return true;
      } catch (_err) {
          return false;
      }
  }

  function clearTerminal() {
      var term = document.getElementById("tOut");
      if (!term) return;
      term.innerHTML = '$ ';
      elementId = 0;
      i = 0;
      allowIn = true;
      historyIndex = commandHistory.length;
      scrollTerm(term);
      persistTerminalBuffer(term);
  }

  function cancelTerminalPlayback() {
      if (terminalTimeoutId !== null) {
          clearTimeout(terminalTimeoutId);
          terminalTimeoutId = null;
      }
  }

  function resetTerminalSession() {
      var termIn = document.getElementById('uIn');
      if (termIn) {
          termIn.blur();
          termIn.value = '';
      }

      cancelTerminalPlayback();

      if (commandHistory && commandHistory.length) {
          commandHistory.length = 0;
      }
      historyIndex = commandHistory.length;
      terminalRestored = false;
      elementId = 0;
      i = 0;
      allowIn = true;
      tSpeed = TERMINAL_INITIAL_SPEED;
      clearTerminal();
      terminal(hello);
  }

  function recordCommand(command) {
      if (!command || !command.trim()) {
          historyIndex = commandHistory.length;
          return;
      }
      commandHistory.push(command);
      historyIndex = commandHistory.length;
  }

  function navigateHistory(direction, inputEl) {
      if (!inputEl || !commandHistory.length) {
          return;
      }
      if (direction === -1) {
          if (historyIndex > 0) {
              historyIndex -= 1;
          } else {
              historyIndex = 0;
          }
      } else if (direction === 1) {
          if (historyIndex < commandHistory.length) {
              historyIndex += 1;
          }
      }

      if (historyIndex >= commandHistory.length) {
          historyIndex = commandHistory.length;
          inputEl.value = '';
      } else {
          inputEl.value = commandHistory[historyIndex];
          var caretPos = inputEl.value.length;
          if (typeof inputEl.setSelectionRange === 'function') {
              inputEl.setSelectionRange(caretPos, caretPos);
          }
      }
  }

  function setThemePreference(mode) {
      if (!mode) return null;
      var normalized = mode.toLowerCase();
      if (normalized === 'toggle' || normalized === 'switch') {
          if (document.body && document.body.classList.contains(CONTRAST_CLASS)) {
              normalized = 'neon';
          } else {
              normalized = 'soft';
          }
      }
      if (normalized === 'contrast') {
          normalized = 'soft';
      }
      if (normalized === '1337' || normalized === 'leet') {
          normalized = 'neon';
      }
      if (normalized !== 'soft' && normalized !== 'neon') {
          return null;
      }
      var toggle = document.querySelector('.theme-toggle');
      applyContrastPreference(normalized, toggle);
      try {
          window.localStorage.setItem(CONTRAST_KEY, normalized);
      } catch (storageError) {
          // ignore storage failures (Safari private mode, etc.)
      }
      return ['Console contrast channel set to ' + (normalized === 'neon' ? '1337.' : 'contrast.')];
  }

  function termFunc(input) {
      var raw = typeof input === 'string' ? input : '';
      var term = raw.toLowerCase();
      var trimmed = term.trim();
      var trimmedOriginal = raw.trim();

      if (!trimmed) {
          terminal(['Type `help` for available commands.']);
          return;
      }

      var tokens = trimmed.split(/\s+/);
      var command = tokens[0];
      var argsLower = tokens.slice(1);
      var remainderLower = trimmed.slice(command.length).trim();
      var remainderOriginal = trimmedOriginal.slice(command.length).trim();
      var tokensOriginal = trimmedOriginal ? trimmedOriginal.split(/\s+/) : [];
      var argsOriginal = tokensOriginal.slice(1);

      switch (command) {
          case '?':
          case 'help':
              terminal(helpLines());
              return;
          case 'clear':
          case 'cls':
              if (argsLower.length && argsLower[0] === 'doom') {
                  if (argsLower.length === 1) {
                      terminal(doomStorageHelpLines());
                      return;
                  }
                  if (argsLower[1] === 'all') {
                      handleDoomClearAllCommand();
                      return;
                  }
                  var clearToken = argsOriginal.length > 1 ? argsOriginal[1] : argsLower[1];
                  var clearSlot = parseDoomSlotInput(clearToken);
                  if (clearSlot === null) {
                      terminal(['Invalid DOOM slot. Use numbers 0-' + DOOM_SAVE_MAX_SLOT + '.']);
                  } else {
                      handleDoomClearSlotCommand(clearSlot);
                  }
                  return;
              }
              clearTerminal();
              terminal(['Console buffer zeroed.']);
              return;
          case 'theme': {
              if (!remainderLower) {
                  terminal(themeHelpLines());
          return;
          }
          var feedback = setThemePreference(remainderLower);
          if (feedback) {
              terminal(feedback);
          } else {
              terminal(themeHelpLines());
          }
          return;
          }
          case 'play': {
              if (!remainderLower) {
                  terminal(['Usage: play <target>', 'Example: play doom']);
                  return;
              }
              if (argsLower[0] === 'doom') {
                  startDoom();
              } else {
                  terminal(['Unknown play target "' + remainderOriginal + '".']);
              }
              return;
          }
          case 'exit': {
              if (!remainderLower) {
                  terminal(['Usage: exit <target>', 'Example: exit doom']);
                  return;
              }
              if (argsLower[0] === 'doom') {
                  if (doomState.active) {
                      teardownDoom('Closed DOOM session.');
                  } else {
                      terminal(['DOOM is not running.']);
                  }
              } else {
                  terminal(['Unknown exit target "' + remainderOriginal + '".']);
              }
              return;
          }
          case 'profile': {
              if (!remainderLower) {
                  terminal(profileHelpLines());
                  return;
              }
              var profileIndex = detectProfileIndex(remainderLower);
              if (profileIndex !== null && profileIndex !== undefined) {
                  terminal(prof[profileIndex]);
              } else {
                  terminal(['No dossier found for "' + (remainderOriginal || remainderLower) + '".']);
              }
              return;
          }
          case 'latest': {
              if (!remainderLower) {
                  terminal(['Usage: latest <alias>']);
                  return;
              }
              var entry = resolveLatest(remainderLower);
              if (entry) {
                  terminal(latestLines(entry));
              } else {
                  terminal(['No recent dispatch found for "' + (remainderOriginal || remainderLower) + '".']);
              }
              return;
          }
          case 'top': {
              var dispatches = getConsoleDispatches();
              if (!dispatches.length) {
                  terminal(['No dispatch intel logged yet.']);
                  return;
              }
              var requested = argsLower[0];
              var countTop = normaliseCount(requested, DISPATCH_PAGE_SIZE, dispatches.length);
              var topLines = buildDispatchLines(dispatches.slice(0, countTop), {
                  heading: 'top feed',
                  pageSize: DISPATCH_PAGE_SIZE,
                  emptyMessage: 'No dispatch intel logged yet.'
              });
              terminal(topLines);
              return;
          }
          case 'search': {
              if (!remainderLower) {
                  terminal(['Usage: search <term>']);
                  return;
              }
              var corpus = getConsoleDispatches();
              if (!corpus.length) {
                  terminal(['No dispatch intel logged yet.']);
                  return;
              }
              var matches = searchDispatches(remainderLower, corpus);
              if (!matches.length) {
                  terminal(['No matches for "' + (remainderOriginal || remainderLower) + '" in dispatch logs.']);
                  return;
              }
              terminal(buildDispatchLines(matches, {
                  heading: 'search "' + (remainderOriginal || remainderLower) + '"',
                  pageSize: DISPATCH_PAGE_SIZE
              }));
              return;
          }
          case 'random': {
              var deck = getConsoleDispatches();
              if (!deck.length) {
                  terminal(['No dispatch intel logged yet.']);
                  return;
              }
              var requestedRandom = argsLower[0];
              var countRandom = normaliseCount(requestedRandom, DISPATCH_PAGE_SIZE, deck.length);
              var randomSelection = sampleDispatches(deck, countRandom);
              terminal(buildDispatchLines(randomSelection, {
                  heading: 'random feed',
                  pageSize: DISPATCH_PAGE_SIZE
              }));
              return;
          }
      }

      var exactProfileIndex = detectProfileIndex(trimmed);
      if (exactProfileIndex !== null && exactProfileIndex !== undefined) {
          terminal(prof[exactProfileIndex]);
          return;
      }

      var fuzzyProfileIndex = detectProfileIndexFromInput(trimmed);
      if (fuzzyProfileIndex !== null && fuzzyProfileIndex !== undefined) {
          terminal(prof[fuzzyProfileIndex]);
          return;
      }

      terminal(['DOES NOT COMPUTE!!!', 'Type `help` to see available commands.']);
  }

  function terminal(msgOut) {
      var term = document.getElementById("tOut");
      if (!term) return; // Avoid error if missing
      if (terminalTimeoutId !== null) {
          clearTimeout(terminalTimeoutId);
          terminalTimeoutId = null;
      }
      var msg = msgOut[elementId];
      if (msg === undefined) {
          return;
      }
      allowIn = false;
      var msgLen = msg.length;
      if (i < msg.length) {
          term.innerHTML += msg.charAt(i);
          i++;
      } else {
          i = 0;
          if (msg === 'Email: ' || msg === 'LinkedIn: ' || msg === 'Read: ') {
              var a = document.createElement('a');
              var link = document.createTextNode(msgOut[elementId+2])
              a.appendChild(link);
              a.title = msgOut[elementId+2];
              a.href = msgOut[elementId+1];
              a.target = '_blank';
              term.append(a);
              elementId += 2;
          }
          elementId++;
          term.innerHTML += '<br>$ ';
          persistTerminalBuffer(term);
      }
      scrollTerm(term);
      if (elementId < msgOut.length) {
          terminalTimeoutId = setTimeout(terminal, tSpeed, msgOut, elementId);
      }
      if (tSpeed > 25 && elementId >= 3) {
          tSpeed = 25;
      }
      if (elementId === msgOut.length) {
          elementId = 0;
          allowIn = true;
          terminalTimeoutId = null;
      }
  }

  function scrollTerm(el) {
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  function main() {
      if (!document.getElementById("tOut") || !document.getElementById("tagline")) return;
      fadeBounce();
      if (!terminalRestored) {
          terminal(hello);
      }
  }

  // Only run everything after DOM is loaded!
  window.addEventListener('DOMContentLoaded', function() {
      initThemeToggle();
      initBackToTop();
      initBlogImageLightbox();
      initBlogPermalinks();

      var termOut = document.getElementById("tOut");
      var tagline = document.getElementById("tagline");
      if (!termOut || !tagline) {
          return;
      }

      initMobileConsoleKeyboardScaling();

      restoreTerminalBuffer(termOut);

      window.scrollTo(0, 0);
      main();
      const termIn = document.getElementById("uIn");
      const resetButton = document.getElementById('cm-terminal-reset');
      if (resetButton) {
          resetButton.addEventListener('click', function() {
              resetTerminalSession();
          });
      }
      if (termIn) {
          termIn.addEventListener('keydown', function(e) {
              pauseLogo(LOGO_PAUSE_REASON_TERMINAL);
              if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  navigateHistory(-1, termIn);
              } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  navigateHistory(1, termIn);
              }
          });

          termIn.addEventListener('keyup', function(e) {
              if ((e.key === 'Enter' || e.which === 13) && allowIn) {
                  var cli = e.target.value;
                  recordCommand(cli);
                  terminal([cli]);
                  checkIn(cli);
                  e.target.value = "";
                  applyContrastPreference(window.localStorage.getItem(CONTRAST_KEY) || 'soft');
              }
          });

          termIn.addEventListener('pointerdown', function() {
              pauseLogo(LOGO_PAUSE_REASON_TERMINAL);
          });

          termIn.addEventListener('focus', function() {
              pauseLogo(LOGO_PAUSE_REASON_TERMINAL);
          });

          termIn.addEventListener('blur', function() {
              resumeLogo(LOGO_PAUSE_REASON_TERMINAL);
          });
      }
  });

  // Defensive: If the DOM is removed (e.g. SPA nav), clear the interval
  window.addEventListener('beforeunload', function() {
      if (intervalID !== null) {
          clearInterval(intervalID);
          intervalID = null;
      }
  });
})();
