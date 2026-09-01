// PHANTASM'27 · Vaagai 2k26 — site interactions

document.addEventListener('DOMContentLoaded', () => {

  // Mobile nav toggle
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks  = document.querySelector('.nav-links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
    // Close on any nav link click
    navLinks.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        navLinks.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Generic tab groups (works for both Events and Schedule)
  document.querySelectorAll('[data-tabs]').forEach(group => {
    const buttons  = group.querySelectorAll('[data-tab-target]');
    const panelWrap = document.querySelector(group.dataset.tabs);
    if (!panelWrap) return;
    const panels = panelWrap.querySelectorAll('[data-panel]');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const target = panelWrap.querySelector(`[data-panel="${btn.dataset.tabTarget}"]`);
        if (target) target.classList.add('active');
      });
    });
  });

  // Footer year
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

});
