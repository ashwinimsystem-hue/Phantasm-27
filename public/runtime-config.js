// Frontend API base. Keep empty because Vercel serves the API on the same origin.
window.__VAAGAI_API_BASE_URL = "";
window.__VAAGAI_API_PREFIX = "/api";

/* PHANTASM'27 mobile homepage: one source of truth.
   The real React nodes are MOVED into one shell instead of being cloned or
   rebuilt from guessed asset URLs. This prevents duplicate Vaagai artwork,
   missing logos and conflicting hero blocks. Desktop is untouched. */
(function () {
  const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const isMobile = () => window.matchMedia?.('(max-width: 768px)').matches;
  const isHome = () => {
    const p = window.location.pathname.replace(/\/$/, '');
    return p === '' || p === '/index.html';
  };

  const loadCleanStyles = () => {
    if (document.querySelector('link[data-phantasm-clean-home]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/assets/phantasm-mobile-home-single-source.css';
    link.dataset.phantasmCleanHome = 'true';
    document.head.appendChild(link);
  };

  function findSmallest(root, regex) {
    const matches = Array.from(root.querySelectorAll('*')).filter((el) => regex.test(normalize(el.textContent)));
    matches.sort((a, b) => normalize(a.textContent).length - normalize(b.textContent).length);
    return matches[0] || null;
  }

  function findArt(hero) {
    const imgs = Array.from(hero.querySelectorAll('img'));
    return imgs.find((img) => {
      const src = (img.getAttribute('src') || '').toLowerCase();
      const alt = (img.getAttribute('alt') || '').toLowerCase();
      const cls = (img.className || '').toString().toLowerCase();
      return src.includes('vaagai') || alt.includes('vaagai') || cls.includes('logo-image-center') || cls.includes('vaagai');
    }) || null;
  }

  function rebuild() {
    if (!isMobile() || !isHome()) return;
    const root = document.getElementById('root');
    const hero = root?.querySelector('.hero');
    if (!hero) return;
    loadCleanStyles();

    const wrap = hero.querySelector(':scope > .wrap') || hero.querySelector('.wrap') || hero;
    if (wrap.querySelector('.phantasm-mobile-hero-shell[data-clean-home="true"]')) return;

    const institution = hero.querySelector('.hero-institution');
    const presents = hero.querySelector('.hero-tamil');
    const title = hero.querySelector('.hero-title');
    const art = findArt(hero);
    const description = hero.querySelector('.hero-subtitle, .hero-description, .hero-sub, .description');
    const actions = hero.querySelector('.hero-actions');
    const countdown = hero.querySelector('.countdown');
    const date = findSmallest(hero, /^september\s+17\s*,?\s*18$/i);

    if (!institution || !art || !description || !actions) return;

    const shell = document.createElement('section');
    shell.className = 'phantasm-mobile-hero-shell';
    shell.dataset.cleanHome = 'true';
    shell.setAttribute('aria-label', "Phantasm '27 homepage");

    // Move the actual nodes. No cloned images, no guessed asset paths.
    institution.classList.add('phantasm-mobile-hero-institution');
    institution.querySelectorAll('.inst-logo, img').forEach((img) => {
      img.classList.add('phantasm-mobile-hero-real-logo');
    });

    if (presents) {
      presents.classList.add('phantasm-mobile-hero-presents');
      presents.textContent = 'Presents';
    }
    if (title) {
      title.classList.add('phantasm-mobile-hero-title');
      title.textContent = "Phantasm'27";
    }

    const rule = document.createElement('div');
    rule.className = 'phantasm-mobile-hero-rule';
    rule.setAttribute('aria-hidden', 'true');

    art.classList.add('phantasm-mobile-hero-art');
    art.setAttribute('alt', "Vaagai '27");
    description.classList.add('phantasm-mobile-hero-description');
    actions.classList.add('phantasm-mobile-hero-actions');

    if (date) date.classList.add('phantasm-mobile-hero-date');

    shell.appendChild(institution);
    if (presents) shell.appendChild(presents);
    if (title) shell.appendChild(title);
    shell.appendChild(rule);
    shell.appendChild(art);
    shell.appendChild(description);
    shell.appendChild(actions);
    if (date) shell.appendChild(date);

    if (countdown) {
      countdown.classList.add('phantasm-mobile-hero-countdown');
      shell.appendChild(countdown);
    }

    // Remove the remainder of the old hero composition. Keep only the shell
    // and the decorative particle layer, if it is a direct child.
    Array.from(wrap.children).forEach((child) => {
      if (child !== shell && !child.classList.contains('particle-vignette')) child.remove();
    });
    wrap.insertBefore(shell, wrap.firstChild);
    root.classList.add('phantasm-mobile-rebuilt');
  }

  function registrationFallback() {
    if (window.__phantasmRegisterFallbackBound) return;
    window.__phantasmRegisterFallbackBound = true;
    document.addEventListener('click', (event) => {
      const target = event.target?.closest?.('a,button,[role="button"]');
      if (!target || normalize(target.textContent) !== 'register now') return;
      if (!target.closest('.hero, .events-page, .phantasm-mobile-hero-shell')) return;
      if (target.closest('.events-page')) return;
      event.preventDefault();
      event.stopPropagation();
      window.location.assign('/register');
    }, true);
  }

  function start() {
    registrationFallback();
    rebuild();
    const root = document.getElementById('root');
    if (!root || window.__phantasmCleanObserverBound) return;
    window.__phantasmCleanObserverBound = true;
    let timer = null;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(rebuild, 40);
    });
    observer.observe(root, { childList: true, subtree: true });
    setTimeout(rebuild, 150);
    setTimeout(rebuild, 700);
    setTimeout(rebuild, 1400);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

/* Returning participant flow is loaded independently so it cannot interfere
   with the mobile hero rebuild or the React application bootstrap. */
(function () {
  const load = () => {
    if (document.querySelector('script[data-phantasm-participant-flow]')) return;
    const script = document.createElement('script');
    script.src = '/assets/participant-email-flow.js';
    script.defer = true;
    script.dataset.phantasmParticipantFlow = 'true';
    document.head.appendChild(script);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true });
  else load();
})();

/* Gender-neutral registration pricing is loaded independently. */
(function () {
  const load = () => {
    if (document.querySelector('script[data-phantasm-gender-neutral-pricing]')) return;
    const script = document.createElement('script');
    script.src = '/assets/gender-neutral-pricing.js';
    script.defer = true;
    script.dataset.phantasmGenderNeutralPricing = 'true';
    document.head.appendChild(script);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true });
  else load();
})();
