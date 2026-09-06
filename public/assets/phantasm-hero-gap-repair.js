/* PHANTASM'27 - mobile hero gap repair. */
(function () {
  var marker = 'phantasmHeroFit';
  var properties = ['min-height', 'height', 'padding-top', 'padding-bottom'];
  var snapshots = typeof WeakMap === 'function' ? new WeakMap() : null;
  var mobileQuery = '(max-width: 768px)';

  function isMobile() {
    return window.matchMedia ? window.matchMedia(mobileQuery).matches : window.innerWidth <= 768;
  }

  function isHome() {
    var path = window.location.pathname.replace(/\/$/, '');
    return path === '' || path === '/' || path === '/index.html' || /\/index\.html$/.test(path);
  }

  function getHeroSection() {
    var home = document.querySelector('.home-page');
    var candidates = [];
    if (home) {
      candidates.push(home.querySelector(':scope > section.section:first-child'));
      candidates.push(home.querySelector(':scope > section:first-child'));
    }
    var hero = document.querySelector('.hero-section, .hero');
    if (hero) candidates.push(hero.closest('section'));
    for (var i = 0; i < candidates.length; i += 1) {
      if (candidates[i] && candidates[i].querySelector('.hero-section, .hero-institution, .hero')) return candidates[i];
    }
    return null;
  }

  function remember(section) {
    if (!snapshots || snapshots.has(section)) return;
    var original = {};
    properties.forEach(function (property) {
      original[property] = {
        value: section.style.getPropertyValue(property) || '',
        priority: section.style.getPropertyPriority(property) || ''
      };
    });
    snapshots.set(section, original);
  }

  function setImportant(element, property, value) {
    if (element.style.getPropertyValue(property) === value &&
        element.style.getPropertyPriority(property) === 'important') return false;
    element.style.setProperty(property, value, 'important');
    return true;
  }

  function unpinStyle(element, property, saved) {
    if (!saved) element.style.removeProperty(property);
    else if (saved.value) element.style.setProperty(property, saved.value, saved.priority);
    else element.style.removeProperty(property);
  }

  function restore(section) {
    var original = snapshots && snapshots.get(section);
    if (!original) return;
    properties.forEach(function (property) {
      unpinStyle(section, property, original[property]);
    });
  }

  function flowStrays(section) {
    Array.prototype.forEach.call(section.children, function (child) {
      if (child.classList.contains('hero-section') || child.querySelector('.hero-section, .hero-institution, .hero')) return;
      var style = window.getComputedStyle(child);
      if (style.position === 'absolute' || style.position === 'fixed' || style.display === 'none') return;
      if (child.textContent && child.textContent.trim()) return;
      var box = child.getBoundingClientRect();
      if (!box || box.height <= 12 || child.dataset.phantasmHeroStray === '1') return;
      child.dataset.phantasmHeroStray = '1';
      child.dataset.phantasmHeroStrayStyle = child.getAttribute('style') || '';
      setImportant(child, 'position', 'absolute');
      setImportant(child, 'inset', '0');
      setImportant(child, 'width', '100%');
      setImportant(child, 'height', '100%');
      setImportant(child, 'margin', '0');
      setImportant(child, 'pointer-events', 'none');
    });
  }

  function measureSurplus(section) {
    var box = section.getBoundingClientRect();
    var top = Infinity;
    var bottom = -Infinity;
    Array.prototype.forEach.call(section.children, function (child) {
      var style = window.getComputedStyle(child);
      if (style.display === 'none' || style.position === 'absolute' || style.position === 'fixed') return;
      var childBox = child.getBoundingClientRect();
      if (!childBox || !childBox.height) return;
      top = Math.min(top, childBox.top);
      bottom = Math.max(bottom, childBox.bottom);
    });
    if (!box || top === Infinity || bottom === -Infinity) return 0;
    return Math.max(0, Math.round(box.height - (bottom - top)));
  }

  function repair() {
    if (!isHome()) return;
    var section = getHeroSection();
    if (!section) return;
    if (!isMobile()) {
      if (section.dataset[marker] === '1') {
        restore(section);
        section.dataset[marker] = '0';
      }
      document.querySelectorAll('[data-phantasm-hero-stray]').forEach(function (element) {
        var original = element.dataset.phantasmHeroStrayStyle;
        if (original) element.setAttribute('style', original);
        else element.removeAttribute('style');
        delete element.dataset.phantasmHeroStray;
        delete element.dataset.phantasmHeroStrayStyle;
      });
      return;
    }
    remember(section);
    var before = measureSurplus(section);
    setImportant(section, 'min-height', '0px');
    setImportant(section, 'height', 'auto');
    flowStrays(section);
    section.dataset[marker] = '1';
    var after = measureSurplus(section);
    section.dataset.phantasmHeroGapLast = before + '/' + after;
    if (window.console && console.info && before !== after) {
      console.info('[phantasm-hero-gap] hero surplus ' + before + 'px -> ' + after + 'px');
    }
  }

  function start() {
    repair();
    var root = document.getElementById('root');
    if (!root || root.dataset.phantasmHeroFitObserver === '1') return;
    root.dataset.phantasmHeroFitObserver = '1';
    var timer;
    var schedule = function () {
      clearTimeout(timer);
      timer = setTimeout(repair, 50);
    };
    new MutationObserver(schedule).observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('orientationchange', schedule, { passive: true });
    [120, 400, 900, 1600].forEach(function (delay) { setTimeout(repair, delay); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}());