/* PHANTASM'27 — final mobile layout repair
   The compiled homepage renders the countdown heading separately from the
   countdown box. On mobile, move that real heading into the rebuilt hero shell
   so the date, heading, and timer become one compact flow.
   Also labels the Mehendi competition tile with its girls-only eligibility.
*/
(function () {
  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const isMobile = () => window.matchMedia?.('(max-width: 768px)').matches;
  const isHome = () => {
    const path = window.location.pathname.replace(/\/$/, '');
    return path === '' || path === '/index.html';
  };

  function cleanupEmptyAncestors(node, stopAt) {
    let current = node;
    for (let i = 0; i < 5 && current && current !== stopAt; i += 1) {
      const parent = current.parentElement;
      if (current.children.length === 0 && !normalize(current.textContent)) {
        current.remove();
        current = parent;
        continue;
      }
      break;
    }
  }

  function repairCountdownLayout() {
    if (!isMobile() || !isHome()) return;
    const root = document.getElementById('root');
    const shell = root?.querySelector('.phantasm-mobile-hero-shell');
    const hero = root?.querySelector('.hero');
    const countdown = shell?.querySelector('.phantasm-mobile-hero-countdown, .countdown');
    if (!root || !shell || !hero || !countdown) return;

    const heading = Array.from(hero.querySelectorAll('h2, h3, p')).find(
      (el) => normalize(el.textContent) === 'event starts in',
    );

    if (heading && !shell.contains(heading)) {
      const oldParent = heading.parentElement;
      heading.classList.add('phantasm-mobile-hero-countdown-heading');
      shell.insertBefore(heading, countdown);
      cleanupEmptyAncestors(oldParent, shell);
    }

    countdown.classList.add('phantasm-mobile-hero-countdown');
  }

  function repairMehendiTile() {
    const root = document.getElementById('root');
    if (!root) return;

    const candidates = root.querySelectorAll('.event-card, [class*="event-card" i], [class*="event-tile" i], [class*="event-item" i]');
    candidates.forEach((tile) => {
      if (!/\bmehendi\b|\bmehend[iy]\b|\bmehandi\b|\bmehndi\b|\bhenna\b/i.test(normalize(tile.textContent))) return;
      if (tile.querySelector(':scope > .phantasm-mehendi-eligibility')) return;

      const label = document.createElement('span');
      label.className = 'phantasm-mehendi-eligibility';
      label.textContent = 'Only for girls';

      const actionRow = tile.querySelector(':scope > .phantasm-event-action-row, :scope > .event-actions, :scope > .actions, :scope > .btn-grp');
      if (actionRow) actionRow.before(label);
      else {
        const action = tile.querySelector('a, button');
        if (action) {
          const container = action.closest('.phantasm-event-action-row, .event-actions, .actions, .btn-grp');
          if (container && container.parentElement === tile) container.before(label);
          else tile.appendChild(label);
        } else {
          tile.appendChild(label);
        }
      }
    });
  }

  function repair() {
    repairCountdownLayout();
    repairMehendiTile();
  }

  function start() {
    repair();
    const root = document.getElementById('root');
    if (!root || root.dataset.phantasmFinalMobileRepair === '1') return;
    root.dataset.phantasmFinalMobileRepair = '1';

    let timer = null;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(repair, 80);
    });
    observer.observe(root, { childList: true, subtree: true });

    [150, 500, 1000, 1800].forEach((delay) => setTimeout(repair, delay));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
