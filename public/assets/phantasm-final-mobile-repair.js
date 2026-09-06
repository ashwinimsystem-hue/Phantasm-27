/* PHANTASM'27 — final mobile layout repair
   Moves the real countdown heading into the clean mobile shell and removes
   the empty legacy wrapper that was responsible for the large date→countdown gap.
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
        current.remove(); current = parent; continue;
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
  function start() {
    repairCountdownLayout();
    const root = document.getElementById('root');
    if (!root || root.dataset.phantasmFinalMobileRepair === '1') return;
    root.dataset.phantasmFinalMobileRepair = '1';
    let timer = null;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(repairCountdownLayout, 40);
    });
    observer.observe(root, { childList: true, subtree: true });
    [100, 300, 700, 1400].forEach((delay) => setTimeout(repairCountdownLayout, delay));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();