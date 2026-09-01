/* PHANTASM'27 — STEP 2: HOMEPAGE CTA / NAVIGATION REPAIR
   Development-branch-only repair layer.
   Goals:
   - Make homepage Register Now and View Events actions deterministic.
   - Preserve the existing React application and router/data flow.
   - Do not create duplicate buttons or move existing DOM nodes.
   - Do not touch event-card controls (handled separately in Step 4).
*/
(function () {
  'use strict';
  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  function isHomepage() {
    const path = window.location.pathname.replace(/\/+$/, '');
    return path === '' || path === '/index.html';
  }
  function setNativeHref(el, route) {
    if (!el || !route) return;
    if (el.tagName === 'A') {
      el.setAttribute('href', route);
      el.setAttribute('target', '_self');
      el.removeAttribute('download');
    }
  }
  function markCTA(el, route, kind) {
    if (!el) return;
    setNativeHref(el, route);
    el.dataset.phantasmHomeCta = kind;
    el.dataset.phantasmHomeRoute = route;
    el.style.pointerEvents = 'auto';
    el.style.cursor = 'pointer';
    if (!el.getAttribute('role') && el.tagName !== 'A' && el.tagName !== 'BUTTON') {
      el.setAttribute('role', 'link');
    }
    el.setAttribute('aria-label', kind === 'register' ? 'Register Now' : 'View Events');
  }
  function repairHomepageCTAs(root) {
    if (!isHomepage() || !root) return;
    root.querySelectorAll('a,button,[role="button"]').forEach((el) => {
      const text = normalize(el.childElementCount ? el.innerText : el.textContent);
      if (text === 'register now') markCTA(el, '/register', 'register');
      else if (text === 'view events') markCTA(el, '/events', 'events');
    });
  }
  function handleCTA(event) {
    const target = event.target?.closest?.('[data-phantasm-home-route]');
    if (!target) return;
    const route = target.dataset.phantasmHomeRoute;
    if (!route) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign(route);
  }
  function start() {
    if (window.__phantasmHomeCtaStep2Started) return;
    window.__phantasmHomeCtaStep2Started = true;
    document.addEventListener('click', handleCTA, true);
    const root = document.getElementById('root');
    if (!root) return;
    let scheduled = false;
    const refresh = () => { scheduled = false; repairHomepageCTAs(root); };
    const scheduleRefresh = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(refresh);
    };
    refresh();
    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(root, { childList: true, subtree: true });
    [50, 150, 500, 1000, 2000].forEach((delay) => window.setTimeout(refresh, delay));
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else start();
})();
