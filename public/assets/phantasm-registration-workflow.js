/* PHANTASM'27 — REGISTER WORKFLOW REBUILD
   Progressive enhancement for the existing registration app.
   Gender is never used for pricing. This layer only improves presentation,
   step guidance, fee visibility, validation, and returning-participant UX. */
(function () {
  const REGISTER = /\/register\/?$/i;
  const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const money = (v) => {
    const n = Number(String(v).replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? `₹${n.toLocaleString('en-IN')}` : String(v || '');
  };
  const root = () => document.getElementById('root');

  function isRegister() { return REGISTER.test(window.location.pathname); }
  function form() { return root()?.querySelector('.Formcontainer form, .registration-form, .register-form, form'); }

  function addHeader(f) {
    if (!f || f.querySelector('[data-phantasm-register-header]')) return;
    const box = document.createElement('section');
    box.dataset.phantasmRegisterHeader = 'true';
    box.className = 'phantasm-register-header';
    box.innerHTML = `
      <div class="pr-eyebrow">PHANTASM'27 · REGISTRATION</div>
      <h1>Secure your place</h1>
      <p>Choose your events, enter your details, review the fee, and submit your registration.</p>
      <div class="pr-steps" aria-label="Registration steps">
        <span class="pr-step is-active"><b>1</b> Details</span>
        <span class="pr-step"><b>2</b> Events</span>
        <span class="pr-step"><b>3</b> Review &amp; Pay</span>
      </div>`;
    f.prepend(box);
  }

  function addPolicy(f) {
    if (!f || f.querySelector('[data-phantasm-fee-policy]')) return;
    const note = document.createElement('div');
    note.dataset.phantasmFeePolicy = 'true';
    note.className = 'phantasm-fee-policy';
    note.innerHTML = '<strong>One fee for everyone</strong><span>Event fees are identical for every participant. Gender is collected only as participant information and never changes the amount.</span>';
    const first = f.querySelector('input, select, textarea');
    (first?.closest('.form-group,.field,.input-group') || first?.parentElement || f).before(note);
  }

  function cleanGenderPricing(f) {
    if (!f) return;
    f.querySelectorAll('[class*="gender-fee" i],[class*="gender-price" i],[class*="female-fee" i],[class*="male-fee" i],[data-gender-fee]').forEach((el) => el.remove());
    Array.from(f.querySelectorAll('*')).forEach((el) => {
      if (el.children.length) return;
      const t = norm(el.textContent);
      if (/^(male|female)\s*(fee|price)\s*:/i.test(t)) el.remove();
    });
  }

  function markRequired(f) {
    f.querySelectorAll('input,select,textarea').forEach((field) => {
      if (field.disabled || field.type === 'hidden') return;
      const group = field.closest('.form-group,.field,.input-group,div');
      const label = group?.querySelector('label');
      if (field.required || label?.textContent?.includes('*')) group?.classList.add('pr-required');
    });
  }

  function createSummary(f) {
    if (!f || f.querySelector('[data-phantasm-summary]')) return;
    const summary = document.createElement('aside');
    summary.dataset.phantasmSummary = 'true';
    summary.className = 'phantasm-register-summary';
    summary.setAttribute('aria-live', 'polite');
    summary.innerHTML = '<div class="prs-label">REGISTRATION SUMMARY</div><div class="prs-row"><span>Selected events</span><strong data-pr-count>0</strong></div><div class="prs-divider"></div><div class="prs-total"><span>Total fee</span><strong data-pr-total>—</strong></div><p data-pr-status>Select your events to see the current total.</p>';
    const submit = f.querySelector('button[type="submit"],input[type="submit"],.submit-btn,.register-btn');
    (submit?.closest('.form-group,.field,.actions') || submit?.parentElement || f).before(summary);
  }

  function refreshSummary(f) {
    const summary = f?.querySelector('[data-phantasm-summary]');
    if (!summary) return;
    const checked = Array.from(f.querySelectorAll('input[type="checkbox"]:checked'));
    const selects = Array.from(f.querySelectorAll('select')).filter((s) => /event/i.test(`${s.name} ${s.id} ${s.className}`));
    const selected = checked.filter((x) => /event/i.test(`${x.name} ${x.value} ${x.parentElement?.textContent || ''}`));
    const selectedValues = [...selected, ...selects.flatMap((s) => Array.from(s.selectedOptions).filter((o) => o.value && !/select|choose/i.test(o.textContent)))];
    const unique = [...new Set(selectedValues.map((x) => norm(x.value || x.textContent)).filter(Boolean))];
    const feeNodes = Array.from(f.querySelectorAll('[class*="fee" i],[class*="price" i],[class*="amount" i],[class*="total" i]')).filter((n) => n.children.length === 0);
    const amounts = feeNodes.map((n) => Number(String(n.textContent).replace(/[^0-9.]/g, ''))).filter((n) => Number.isFinite(n) && n > 0);
    const total = amounts.length ? Math.max(...amounts) : null;
    summary.querySelector('[data-pr-count]').textContent = String(unique.length);
    summary.querySelector('[data-pr-total]').textContent = total == null ? '—' : money(total);
    summary.querySelector('[data-pr-status]').textContent = unique.length ? 'Your fee is based on the selected events only — never on gender.' : 'Select your events to see the current total.';
  }

  function preventEmptySubmit(f) {
    if (!f || f.dataset.phantasmSubmitBound) return;
    f.dataset.phantasmSubmitBound = 'true';
    f.addEventListener('submit', (e) => {
      const eventFields = Array.from(f.querySelectorAll('input[type="checkbox"]')).filter((x) => /event/i.test(`${x.name} ${x.value} ${x.id}`));
      const selects = Array.from(f.querySelectorAll('select')).filter((x) => /event/i.test(`${x.name} ${x.id} ${x.className}`));
      const hasEvent = eventFields.some((x) => x.checked) || selects.some((x) => Array.from(x.selectedOptions).some((o) => o.value && !/select|choose/i.test(o.textContent)));
      if ((eventFields.length || selects.length) && !hasEvent) {
        e.preventDefault();
        const status = f.querySelector('[data-pr-status]');
        if (status) status.textContent = 'Please select at least one event before continuing.';
        (eventFields[0] || selects[0])?.focus();
      }
    });
  }

  function bindInputs(f) {
    if (!f || f.dataset.phantasmInputsBound) return;
    f.dataset.phantasmInputsBound = 'true';
    f.addEventListener('input', () => refreshSummary(f));
    f.addEventListener('change', () => refreshSummary(f));
    refreshSummary(f);
  }

  function enhance() {
    if (!isRegister()) return;
    const f = form();
    if (!f) return;
    f.classList.add('phantasm-register-rebuilt');
    addHeader(f);
    addPolicy(f);
    cleanGenderPricing(f);
    markRequired(f);
    createSummary(f);
    bindInputs(f);
    preventEmptySubmit(f);
    refreshSummary(f);
  }

  function start() {
    enhance();
    const r = root();
    if (!r || window.__phantasmRegisterRebuildObserver) return;
    window.__phantasmRegisterRebuildObserver = true;
    let timer;
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(enhance, 50);
    }).observe(r, { childList: true, subtree: true, characterData: true });
    [250, 800, 1600, 3000].forEach((d) => setTimeout(enhance, d));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
