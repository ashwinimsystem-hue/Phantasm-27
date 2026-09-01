/* PHANTASM'27 — STANDARD FEE DISPLAY v4
   Display-only safety layer. Gender is never read or used for pricing.
   Any legacy FREE/zero fee shown for a known event is replaced with that
   event's published standard fee.
*/
(function () {
  const isRegisterPage = () => /\/register\/?$/i.test(window.location.pathname);
  const normalize = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  let scheduled = false;

  const FEES = [
    ['advanced cnc machining and precision manufacturing', 200],
    ['advanced cnc machining', 200],
    ['precision manufacturing', 200],
    ['bachelor samayal', 100],
    ['paper presentation', 200],
    ['ansys simulation challenge', 200],
    ['ansys simulation', 200],
    ['cad modeling', 200],
    ['cad modelling', 200],
    ['glider competition', 200],
    ['glider', 200],
    ['line follower', 300],
    ['line follower robot', 300],
    ['technical quiz', 100],
    ['water rocketry', 200],
    ['water rocket', 200],
    ['free fire', 100],
    ['freefire', 100],
    ['carrom', 100],
    ['ipl auction', 100],
    ['college ipl auction', 100],
    ['chess', 50],
  ];

  function feeForTitle(title) {
    const n = normalize(title);
    const match = FEES.find(([name]) => n === name || n.includes(name) || name.includes(n));
    return match ? match[1] : null;
  }

  function cardTitle(card) {
    const headings = card.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,b');
    for (const node of headings) {
      const title = String(node.textContent || '').trim();
      if (feeForTitle(title) != null) return title;
    }
    return '';
  }

  function cleanCard(card) {
    const title = cardTitle(card);
    const fee = feeForTitle(title);
    if (fee == null) return;

    for (const node of card.querySelectorAll('*')) {
      if (node.children.length !== 0) continue;
      const text = String(node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;

      if (/^free$/i.test(text) || /^₹0(?:\.00)?$/i.test(text) || /^rs\.?\s*0(?:\.00)?$/i.test(text)) {
        node.textContent = `₹${fee}`;
        continue;
      }

      if (/^fee\s*:/i.test(text) && /\bfree\b/i.test(text)) {
        const amount = text.match(/(?:₹|rs\.?\s*)(\d[\d,]*(?:\.\d+)?)/i);
        if (amount) node.textContent = text.replace(/\bfree\b/ig, `₹${amount[1]}`);
        else node.textContent = `Fee: ₹${fee}`;
      }
    }
  }

  function fix(root) {
    if (!root || !isRegisterPage()) return;
    const candidates = root.querySelectorAll('article, li, section, [class*="event-card"], [class*="eventCard"], [class*="workshop"], [class*="event"]');
    for (const card of candidates) cleanCard(card);
  }

  function schedule(root) {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      fix(root);
    });
  }

  function start() {
    if (!isRegisterPage()) return;
    const root = document.getElementById('root');
    if (!root) return;
    fix(root);
    [400, 1000, 2000].forEach((delay) => setTimeout(() => fix(root), delay));
    const observer = new MutationObserver(() => schedule(root));
    observer.observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
