/* PHANTASM'27 — INTERACTION REPAIR
   Keeps navigation and event actions independent of the React bundle's
   transient DOM state. Safe to run repeatedly after React re-renders.
*/
(function () {
  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

  function repairHomepageLinks(root) {
    const home = window.location.pathname === '/' || /\/index\.html$/i.test(window.location.pathname);
    if (!home) return;

    root.querySelectorAll('a,button,[role="button"]').forEach((el) => {
      const text = normalize(el.textContent);
      if (text === 'register now') {
        el.dataset.phantasmRoute = '/register';
        if (el.tagName === 'A') el.setAttribute('href', '/register');
      } else if (text === 'view events') {
        el.dataset.phantasmRoute = '/events';
        if (el.tagName === 'A') el.setAttribute('href', '/events');
      }
    });
  }

  function repairEventCards(root) {
    root.querySelectorAll('.events-page .event-card').forEach((card) => {
      let row = card.querySelector('.phantasm-event-action-row');
      if (!row) {
        const existingActionHost = card.querySelector('.btn-grp,.event-actions,.actions,[class*="action"]');
        row = document.createElement('div');
        row.className = 'phantasm-event-action-row';
        if (existingActionHost) {
          while (existingActionHost.firstChild) row.appendChild(existingActionHost.firstChild);
          existingActionHost.replaceWith(row);
        } else {
          card.appendChild(row);
        }
      }

      const controls = Array.from(row.querySelectorAll('a,button,[role="button"]'));
      let register = controls.find((el) => normalize(el.textContent) === 'register now');
      const details = controls.find((el) => normalize(el.textContent) === 'view details');
      const rules = controls.find((el) => /^(rules|view rules)$/.test(normalize(el.textContent)));

      if (!register) {
        register = document.createElement('a');
        register.textContent = 'Register Now';
        register.href = '/register';
        register.className = 'phantasm-register-now';
        register.setAttribute('aria-label', 'Register Now');
        row.appendChild(register);
      }
      register.dataset.phantasmRoute = '/register';
      if (register.tagName === 'A') register.setAttribute('href', '/register');
      if (details) details.classList.add('phantasm-view-details');
      if (rules) rules.classList.add('phantasm-rules-action');
      register.classList.add('phantasm-register-now');
      card.dataset.phantasmActionsReady = 'true';
    });
  }

  function handleRoutes(event) {
    const el = event.target?.closest?.('a,button,[role="button"]');
    const route = el?.dataset?.phantasmRoute;
    if (!route) return;
    event.preventDefault();
    event.stopPropagation();
    window.location.assign(route);
  }

  function start() {
    document.addEventListener('click', handleRoutes, true);
    const root = document.getElementById('root');
    if (!root) return;

    const refresh = () => {
      repairHomepageLinks(root);
      repairEventCards(root);
    };
    refresh();

    const observer = new MutationObserver(() => {
      window.clearTimeout(window.__phantasmInteractionRepairTimer);
      window.__phantasmInteractionRepairTimer = window.setTimeout(refresh, 20);
    });
    observer.observe(root, { childList: true, subtree: true });
    window.setTimeout(refresh, 100);
    window.setTimeout(refresh, 500);
    window.setTimeout(refresh, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
