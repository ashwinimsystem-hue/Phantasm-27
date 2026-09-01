/* PHANTASM'27 — RETURNING PARTICIPANT FLOW v2
   Existing email is a continuation path, not a dead end. The API currently
   returns 409 for an already-registered email, so both 200 and 409 are handled. */
(function () {
  const normalize = (v) => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const isRegister = () => /\/register\/?$/i.test(window.location.pathname);
  let lastEmail = '';
  let timer;

  function findInput(root) { return root.querySelector('input[type="email"],input[name*="email" i],input[placeholder*="email" i]'); }
  function findForm(input) { return input?.closest('form,.Formcontainer,[class*="form"]') || input?.parentElement?.parentElement; }

  function panel(form, returning, data) {
    if (!form) return;
    let el = form.querySelector('.phantasm-returning-participant');
    if (!returning) { el?.remove(); return; }
    if (!el) {
      el = document.createElement('section');
      el.className = 'phantasm-returning-participant';
      el.setAttribute('aria-live', 'polite');
      const input = findInput(form);
      const host = input?.closest('.form-group,.field,.input-group') || input?.parentElement;
      (host?.parentElement || form).insertBefore(el, host?.nextSibling || null);
    }
    el.innerHTML = `<h3 class="prp-title">Welcome back</h3><p class="prp-meta">${data?.name ? `${data.name} · ` : ''}Existing registration found</p><p class="prp-note">Continue below to add or review events. Your existing registration is kept; fees are calculated only from the selected events and never from gender.</p>`;
  }

  async function check(input) {
    const email = String(input.value || '').trim().toLowerCase();
    if (!email || email === lastEmail || !email.includes('@')) return;
    lastEmail = email;
    try {
      const response = await fetch('/api/check-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
      const data = await response.json().catch(() => ({}));
      panel(findForm(input), response.status === 409 || Boolean(data.registered), data);
    } catch (e) { console.warn('[participant-email-flow]',e); }
  }

  function bind(root) {
    if (!isRegister()) return;
    const input = findInput(root);
    if (!input || input.dataset.phantasmReturningBound === 'true') return;
    input.dataset.phantasmReturningBound = 'true';
    const run = () => { clearTimeout(timer); timer = setTimeout(() => check(input), 350); };
    ['input','blur','change'].forEach((event) => input.addEventListener(event, run));
  }

  function start() {
    const r = document.getElementById('root');
    if (!r || !isRegister()) return;
    bind(r);
    new MutationObserver(() => bind(r)).observe(r,{childList:true,subtree:true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();
