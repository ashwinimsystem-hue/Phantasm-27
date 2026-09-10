/* PHANTASM'27 — INTERACTION REPAIR V3
   Reliable homepage CTA routing and one Register Now control per event card.
   Intentionally does not move or clone existing event controls.
*/
(function () {
  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const textOf = (el) => normalize(el?.textContent);
  const isHome = () => {
    const p = window.location.pathname.replace(/\/$/, '');
    return p === '' || p === '/index.html';
  };
  const isEvents = () => /\/events\/?$/i.test(window.location.pathname);

  function makeRouteClickable(el, route) {
    if (!el) return;
    el.dataset.phantasmRouteV2 = route;
    el.style.pointerEvents = 'auto';
    el.style.position = el.style.position || 'relative';
    el.style.zIndex = '50';
    el.setAttribute('role', el.getAttribute('role') || 'link');
    if (el.tagName === 'A') el.setAttribute('href', route);
  }

  function repairHome(root) {
    if (!isHome()) return;
    root.querySelectorAll('a,button,[role="button"]').forEach((el) => {
      const text = textOf(el);
      if (text.includes('register now')) makeRouteClickable(el, '/register');
      else if (text.includes('view events')) makeRouteClickable(el, '/events');
    });
  }

  function getEventKey(card) {
    const title = card.querySelector('h2,h3,h4,h5,[class*="title"],[class*="name"]');
    const raw = title ? titleOf(title) : textOf(card).slice(0, 180);
    return normalize(raw) || `card-${Array.from(document.querySelectorAll('.events-page .event-card')).indexOf(card)}`;
  }

  function titleOf(el) {
    return String(el?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function isRegisterControl(el) {
    return /^(register now|register|join now)$/.test(textOf(el));
  }

  function repairEvents(root) {
    if (!isEvents()) return;
    const cards = Array.from(root.querySelectorAll('.events-page .event-card'));
    cards.forEach((card, index) => {
      const controls = Array.from(card.querySelectorAll('a,button,[role="button"]'));
      controls.forEach((el) => {
        if (/^(view details|hide details)$/.test(textOf(el))) el.classList.add('phantasm-view-details');
        if (/^(rules|view rules|rules & judging)$/.test(textOf(el))) el.classList.add('phantasm-rules-action');
      });
      const existingRegisters = controls.filter(isRegisterControl);

      // Keep exactly one register control per event card.
      if (existingRegisters.length > 1) {
        existingRegisters.slice(1).forEach((el) => el.remove());
      }

      let register = existingRegisters[0];
      if (!register) {
        register = document.createElement('a');
        register.href = '/register';
        register.textContent = 'Register Now';
        register.setAttribute('aria-label', `Register Now for event ${index + 1}`);
        register.className = 'phantasm-register-now';
        register.dataset.phantasmRouteV2 = '/register';
        register.style.cssText = [
          'display:inline-flex',
          'align-items:center',
          'justify-content:center',
          'min-height:44px',
          'width:100%',
          'box-sizing:border-box',
          'margin-top:12px',
          'padding:10px 14px',
          'border-radius:8px',
          'background:linear-gradient(180deg,#f0cf8b 0%,#d9a441 100%)',
          'border:1px solid #d9a441',
          'color:#241703',
          'text-decoration:none',
          'font-family:Source Sans 3,Arial,sans-serif',
          'font-size:13px',
          'font-weight:800',
          'letter-spacing:.04em',
          'cursor:pointer',
          'pointer-events:auto',
          'position:relative',
          'z-index:50'
        ].join(';');

        // Put the button after the event content, without relocating any existing controls.
        card.appendChild(register);
      }
      makeRouteClickable(register, '/register');
    });
  }

  function handleRoute(event) {
    const el = event.target?.closest?.('a,button,[role="button"]');
    if (!el) return;
    // Resolve home CTAs at click time too: do not depend on observer timing.
    const text = textOf(el);
    const route = el.dataset?.phantasmRouteV2 || (isHome() &&
      (text === 'view events' ? '/events' : text === 'register now' ? '/register' : null));
    if (!route || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign(route);
  }

  function start() {
    document.addEventListener('click', handleRoute, true);
    const root = document.getElementById('root');
    if (!root) return;

    let scheduled = false;
    const refresh = () => {
      scheduled = false;
      repairHome(root);
      repairEvents(root);
    };
    const scheduleRefresh = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(refresh);
    };

    refresh();
    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(root, { childList: true, subtree: true });
    [100, 500, 1200, 2500].forEach((ms) => setTimeout(refresh, ms));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
