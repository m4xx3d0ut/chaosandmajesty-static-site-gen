(function() {
  const CONTRAST_KEY = 'cm-contrast-mode';
  const CONTRAST_CLASS = 'contrast-mode';

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

  var opacity = 0;
  var intervalID = null;
  var out = 0;
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
  var opts = ['paul', 'm4xx3d0ut', 'renee', 'matica'];
  var latestArticles = window.cmLatestArticles || {};
  var prof = [
      [
          'Seaching... Profile found!',
          '---',
          'Name: Paul Kolesa',
          'Handle: m4xx3d0ut',
          'Email: ',
          'mailto:hakr@theinfinitereality.com',
          'hakr@theinfinitereality.com',
          'LinkedIn: ',
          'https://www.linkedin.com/in/paul-k-a3a18196/',
          'The Architect',
          'About: Paul (m4xx3d0ut) is iR\'s Swiss Army Knife! Currently serving as Sr. Information Security Officer and InfoSec team lead, he is also the architect of the video infrastructure for their immersive experiences. A Pythonista at heart, he is capable of working across a number of languages and frameworks.',
          '---',
          'End of transmission...'
      ],
      [
          'Seaching... Profile found!',
          '---',
          'Name: Renee Kresho-Kolesa',
          'Handle: matica8',
          'LinkedIn: ',
          'https://www.linkedin.com/in/rene%C3%A9-k-025083bb/',
          'Producer/Audio Engineer/ICC',
          'About: Renee rules.',
          '---',
          'End of transmission...'
      ]
  ];
  var allowIn = true;
  var elementId = 0;
  var i = 0;
  var tSpeed = 75;
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
      }, 200);
  }

  function show() {
      var body = document.getElementById("tagline");
      if (!body) return; // ultra-defensive
      opacity = Number(window.getComputedStyle(body).getPropertyValue("opacity"));
      if (opacity < 1 && out === 0) {
        opacity += 0.1;
      } else if (opacity > 0) {
        out = 1;
        opacity -= 0.1;
      } else {
        out = 0;
        opacity += 0.1;
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

  function termFunc(input) {
      var term = input.toLowerCase();
      var trimmed = term.trim();

      if (trimmed.startsWith('latest')) {
          var parts = trimmed.split(/\s+/);
          if (parts.length < 2) {
              terminal(['Usage: latest <author>']);
              return;
          }
          var alias = parts[1];
          var entry = resolveLatest(alias);
          if (entry) {
              terminal(latestLines(entry));
          } else {
              terminal(['No recent dispatch found for "' + alias + '".']);
          }
          return;
      }
      var valid = false;
      opts.forEach((opt) => {
          if (term.includes(opt)) {
              valid = true;
              if (opt === opts[0] || opt === opts[1]) {
                  terminal(prof[0]);
              } else if (opt == opts[2] || opt == opts[3]) {
                  terminal(prof[1]);
              }
          }
      });
      if (!valid) {
          terminal(['DOES NOT COMPUTE!!!']);
      }
  }

  function terminal(msgOut) {
      var term = document.getElementById("tOut");
      if (!term) return; // Avoid error if missing
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
      }
      scrollTerm(term);
      if (elementId < msgOut.length) {
          setTimeout(terminal, tSpeed, msgOut, elementId);
      }
      if (tSpeed > 25 && elementId >= 3) {
          tSpeed = 25;
      }
      if (elementId === msgOut.length) {
          elementId = 0;
          allowIn = true;
      }
  }

  function scrollTerm(el) {
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  function main() {
      if (!document.getElementById("tOut") || !document.getElementById("tagline")) return;
      fadeBounce();
      terminal(hello);
  }

  // Only run everything after DOM is loaded!
  window.addEventListener('DOMContentLoaded', function() {
      initThemeToggle();
      initBackToTop();
      initBlogImageLightbox();

      var termOut = document.getElementById("tOut");
      var tagline = document.getElementById("tagline");
      if (!termOut || !tagline) {
          return;
      }

      window.scrollTo(0, 0);
      main();
      const termIn = document.getElementById("uIn");
      if (termIn) {
          termIn.addEventListener("keyup", function(e) {
              if (e.which === 13 && allowIn) {
          var cli = e.target.value;
          terminal([cli]);
          checkIn(cli);
          e.target.value = "";
          applyContrastPreference(window.localStorage.getItem(CONTRAST_KEY) || 'neon');
              }
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
