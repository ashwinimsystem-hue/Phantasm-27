/* PHANTASM'27 — NAVBAR CLEANUP
   Removes only the Vaagai Tamil-label element from the navigation/header.
   Other navbar items and the homepage Vaagai artwork remain untouched.
*/
(function () {
  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

  function isTargetText(text) {
    const value = normalize(text);
    if (!value) return false;
    const hasTamil = /[\u0B80-\u0BFF]/.test(value);
    const hasEventRef = /27|2027/.test(value);
    return hasTamil && /வாகை/.test(value) && hasEventRef;
  }

  function cleanup(root) {
    root.querySelectorAll('header, nav, .navbar, .nav, [role="navigation"]').forEach((nav) => {
      const candidates = Array.from(nav.querySelectorAll('*')).filter((el) => {
        if (el.children.length > 0) return false;
        return isTargetText(el.textContent);
      });
      candidates.forEach((el) => el.remove());
    });
  }

  function start() {
    const root = document.getElementById('root');
    if (!root) return;
    cleanup(root);
    const observer = new MutationObserver(() => {
      window.clearTimeout(window.__phantasmNavbarCleanupTimer);
      window.__phantasmNavbarCleanupTimer = window.setTimeout(() => cleanup(root), 10);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    window.setTimeout(() => cleanup(root), 100);
    window.setTimeout(() => cleanup(root), 500);
    window.setTimeout(() => cleanup(root), 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
