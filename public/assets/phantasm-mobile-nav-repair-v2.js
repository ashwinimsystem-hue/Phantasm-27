/* PHANTASM'27 — MOBILE NAV REPAIR v2
   Keeps the hamburger menu state synchronized and prevents the drawer from
   surviving navigation or blocking other pages.
*/
(function () {
  const SELECTOR = '.nav-menu, .nav-links, .mobile-menu, [role="navigation"] .nav-links';
  const TOGGLE_SELECTOR = '.menu-icon, .nav-toggle, button[aria-label*="menu" i], button[aria-label*="navigation" i]';

  function isMobile() {
    return window.matchMedia('(max-width: 768px)').matches;
  }

  function getMenus() {
    return Array.from(document.querySelectorAll(SELECTOR)).filter((el) => {
      return el.matches('.nav-menu, .nav-links, .mobile-menu') || el.querySelector('a');
    });
  }

  function getToggles() {
    return Array.from(document.querySelectorAll(TOGGLE_SELECTOR));
  }

  function setMenu(open) {
    const value = Boolean(open);
    getMenus().forEach((menu) => {
      menu.classList.toggle('open', value);
      menu.classList.toggle('is-open', value);
      menu.setAttribute('aria-hidden', String(!value));
    });
    getToggles().forEach((button) => {
      button.setAttribute('aria-expanded', String(value));
      button.classList.toggle('is-open', value);
    });
    document.body.classList.toggle('menu-open', value);
    document.body.classList.toggle('nav-open', value);
    document.documentElement.classList.toggle('menu-open', value);
  }

  function currentState() {
    const toggle = getToggles()[0];
    if (toggle) return toggle.getAttribute('aria-expanded') === 'true';
    const menu = getMenus()[0];
    return Boolean(menu && (menu.classList.contains('open') || menu.classList.contains('is-open')));
  }

  function closeMenu() {
    if (isMobile()) setMenu(false);
  }

  function onToggle(event) {
    if (!isMobile()) return;
    const button = event.target.closest?.(TOGGLE_SELECTOR);
    if (!button) return;

    // Let the app's own handler run first, then force the DOM into the
    // opposite state. This also works when the original handler is missing.
    const wasOpen = currentState();
    window.setTimeout(() => setMenu(!wasOpen), 0);
  }

  function onLink(event) {
    if (!isMobile()) return;
    const link = event.target.closest?.('.nav-links a, .nav-menu a, .mobile-menu a');
    if (!link) return;
    closeMenu();
  }

  function onKey(event) {
    if (event.key === 'Escape') closeMenu();
  }

  function sync() {
    if (!isMobile()) {
      setMenu(false);
      return;
    }
    // Do not open a menu automatically. Only preserve an explicitly open state.
    const toggle = getToggles()[0];
    const menu = getMenus()[0];
    if (!toggle && !menu) return;
    const open = toggle
      ? toggle.getAttribute('aria-expanded') === 'true'
      : Boolean(menu.classList.contains('open') || menu.classList.contains('is-open'));
    setMenu(open);
  }

  function start() {
    document.addEventListener('click', onToggle, true);
    document.addEventListener('click', onLink, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('popstate', closeMenu);
    window.addEventListener('hashchange', closeMenu);
    window.addEventListener('pageshow', closeMenu);
    window.addEventListener('resize', sync);

    const root = document.getElementById('root') || document.body;
    const observer = new MutationObserver(() => {
      window.clearTimeout(window.__phantasmMobileNavRepairTimer);
      window.__phantasmMobileNavRepairTimer = window.setTimeout(sync, 0);
    });
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-expanded'] });

    sync();
    [50, 250, 750, 1500].forEach((ms) => window.setTimeout(sync, ms));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
