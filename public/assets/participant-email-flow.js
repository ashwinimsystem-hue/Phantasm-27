/* PHANTASM'27 — RETURNING PARTICIPANT EMAIL FLOW
   Existing email is treated as a returning participant, not an error.
   Shows current events and lets the participant continue with additional events.
*/
(function () {
  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const isRegisterPage = () => /\/register\/?$/i.test(window.location.pathname);
  let lastEmail = '';
  let timer = null;

  const style = document.createElement('style');
  style.textContent = `
    .phantasm-returning-participant {
      width: min(100%, 720px);
      margin: 10px auto 18px;
      padding: 14px 16px;
      border: 1px solid rgba(217,164,65,.28);
      border-radius: 12px;
      background: linear-gradient(145deg, rgba(124,31,31,.10), rgba(20,13,9,.72));
      color: #f3e6c8;
      font-family: 'Source Sans 3', Arial, sans-serif;
      box-sizing: border-box;
    }
    .phantasm-returning-participant .prp-title {
      margin: 0 0 6px;
      color: #f0cf8b;
      font-family: 'EB Garamond', Georgia, serif;
      font-size: 1.15rem;
      font-weight: 700;
    }
    .phantasm-returning-participant .prp-meta {
      margin: 0 0 10px;
      font-size: .82rem;
      color: #cdbf9e;
    }
    .phantasm-returning-participant .prp-events {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .phantasm-returning-participant .prp-events li {
      padding: 6px 9px;
      border-radius: 999px;
      border: 1px solid rgba(217,164,65,.25);
      background: rgba(217,164,65,.06);
      color: #f3e6c8;
      font-size: .76rem;
      line-height: 1.2;
    }
    .phantasm-returning-participant .prp-note {
      margin: 10px 0 0;
      color: #cdbf9e;
      font-size: .78rem;
    }
    @media (max-width: 520px) {
      .phantasm-returning-participant { padding: 12px; }
      .phantasm-returning-participant .prp-events { display: grid; grid-template-columns: 1fr; }
    }
  `;
  document.head.appendChild(style);

  function findEmailInput(root) {
    return root.querySelector('input[type="email"], input[name*="email" i], input[placeholder*="email" i]');
  }

  function findForm(input) {
    return input?.closest('form, .Formcontainer, [class*="form"]') || input?.parentElement?.parentElement || null;
  }

  function hideDuplicateWarnings(form) {
    if (!form) return;
    Array.from(form.querySelectorAll('*')).forEach((el) => {
      const text = normalize(el.textContent);
      if (text === 'this email is already registered.' || text === 'email is already registered.' || text.includes('this email is already registered')) {
        el.style.display = 'none';
      }
    });
  }

  function renderPanel(form, data) {
    if (!form) return;
    let panel = form.querySelector('.phantasm-returning-participant');
    if (!data?.registered) {
      panel?.remove();
      return;
    }
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'phantasm-returning-participant';
      panel.setAttribute('aria-live', 'polite');
      const input = findEmailInput(form);
      const host = input?.closest('.form-group, .field, .input-group') || input?.parentElement;
      (host?.parentElement || form).insertBefore(panel, host?.nextSibling || null);
    }
    panel.innerHTML = '';

    const title = document.createElement('h3');
    title.className = 'prp-title';
    title.textContent = 'Welcome back';

    const meta = document.createElement('p');
    meta.className = 'prp-meta';
    meta.textContent = data.registrationId
      ? `${data.name ? `${data.name} · ` : ''}Registration ${data.registrationId}`
      : 'Your previous registration was found';

    const list = document.createElement('ul');
    list.className = 'prp-events';
    (Array.isArray(data.events) ? data.events : []).forEach((event) => {
      const li = document.createElement('li');
      li.textContent = event;
      list.appendChild(li);
    });

    const note = document.createElement('p');
    note.className = 'prp-note';
    note.textContent = 'You can select additional events below. Your existing registration will be kept and only new events will be added.';

    panel.append(title, meta, list, note);
    hideDuplicateWarnings(form);
  }

  async function checkEmail(input) {
    const email = String(input.value || '').trim().toLowerCase();
    if (!email || email === lastEmail) return;
    lastEmail = email;
    if (!email.includes('@')) return;
    try {
      const response = await fetch('/api/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      renderPanel(findForm(input), data);
    } catch (error) {
      console.error('[participant-email-flow]', error);
    }
  }

  function bind(root) {
    if (!isRegisterPage()) return;
    const input = findEmailInput(root);
    if (!input || input.dataset.phantasmReturningParticipantBound === 'true') return;
    input.dataset.phantasmReturningParticipantBound = 'true';

    const run = () => {
      clearTimeout(timer);
      timer = setTimeout(() => checkEmail(input), 450);
    };
    input.addEventListener('input', run);
    input.addEventListener('blur', run);
    input.addEventListener('change', run);
  }

  function start() {
    const root = document.getElementById('root');
    if (!root || !isRegisterPage()) return;
    bind(root);
    const observer = new MutationObserver(() => bind(root));
    observer.observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
