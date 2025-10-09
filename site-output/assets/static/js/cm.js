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
