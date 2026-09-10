/* PHANTASM'27 — final mobile layout repair
   The compiled homepage renders the countdown heading separately from the
   countdown box. On mobile, move that real heading into the rebuilt hero shell
   so the date, heading, and timer become one compact flow.
*/

(function () {
  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const isMobile = () => window.matchMedia?.('(max-width: 768px)').matches;
  const isHome = () => {
    const currentPath = window.location.pathname.replace(/\/$/, '');
    return currentPath === '' || currentPath === '/index.html';
  };

  const eventTileSelector = '.event-card, [class*="event-card"] i, [class*="event-tile"] i, [class*="event-item"] i';
  const genderPattern = /\bgender\b/;
  const maleGenderPattern = /\bmale\b|\bman\b|\bboy\b/;

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

    if (!countdown.classList.contains('phantasm-mobile-hero-countdown')) {
      countdown.classList.add('phantasm-mobile-hero-countdown');
    }
  }

  function getGender(root) {
    const meta = (el) => [
      el.name,
      el.id,
      el.getAttribute('aria-label'),
      el.getAttribute('data-field'),
      el.getAttribute('data-name'),
      el.getAttribute('name'),
      el.closest('label')?.textContent,
      el.parentElement?.querySelector('label')?.textContent,
      el.closest('.reg-field')?.querySelector('.reg-field-label')?.textContent,
    ].map(normalize).join(' ');

    const genderSelect = Array.from(root.querySelectorAll('select')).find((el) => genderPattern.test(meta(el)));
    if (genderSelect) {
      return normalize([
        genderSelect.value,
        genderSelect.selectedOptions?.[0]?.textContent,
      ].filter(Boolean).join(' '));
    }

    const checkedGender = Array.from(root.querySelectorAll(
      'input[type="radio"]:checked, input[type="checkbox"]:checked, [role="radio"][aria-checked="true"]',
    )).find((el) => genderPattern.test(meta(el)));
    if (checkedGender) {
      return normalize([
        checkedGender.value,
        checkedGender.getAttribute('data-value'),
        checkedGender.getAttribute('aria-label'),
        checkedGender.closest('label')?.textContent,
        checkedGender.textContent,
      ].filter(Boolean).join(' '));
    }

    const genderControl = Array.from(root.querySelectorAll('input, [role="combobox"]')).find(
      (el) => genderPattern.test(meta(el)) && !/radio|checkbox/i.test(el.type || ''),
    );
    if (genderControl) {
      return normalize([
        genderControl.value,
        genderControl.getAttribute('data-value'),
        genderControl.getAttribute('aria-label'),
        genderControl.textContent,
      ].filter(Boolean).join(' '));
    }

    const genderField = Array.from(root.querySelectorAll('.reg-field')).find((field) =>
      genderPattern.test(normalize(field.querySelector('.reg-field-label')?.textContent || '')),
    );
    if (genderField) {
      const control = genderField.querySelector('select, input, [role="combobox"], [role="radio"][aria-checked="true"]');
      if (control) {
        return normalize([
          control.value,
          control.getAttribute('data-value'),
          control.getAttribute('aria-label'),
          control.textContent,
        ].filter(Boolean).join(' '));
      }
    }

    return '';
  }

  function isMaleGender(value) {
    const gender = normalize(value);
    return gender === 'm' || gender === 'male' || gender === 'man' || gender === 'boy' || maleGenderPattern.test(gender);
  }

  function getEventTiles(root) {
    return root.querySelectorAll(eventTileSelector);
  }

  function tileSearchText(tile) {
    const parts = [];
    tile.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, li, [class*="title"]').forEach((el) => parts.push(el.textContent || ''));
    parts.push(tile.textContent || '');
    return normalize(parts.join(' '));
  }

  function tileIsSelected(tile) {
    return tile.getAttribute('aria-pressed') === 'true' || tile.classList.contains('selected');
  }

  function setAttributeIfChanged(element, attribute, value) {
    if (element.getAttribute(attribute) !== value) element.setAttribute(attribute, value);
  }

  function setFlag(tile, name, value) {
    if (tile.dataset[name] !== value) tileDataset[name] = value;
  }

  function repair() {
    repairCountdownLayout();
  }

  function scheduleRepair(delay = 0) {
    clearTimeout(scheduleRepair.timer);
    scheduleRepair.timer = setTimeout(repair, delay);
  }

  function start() {
    repair();
    const root = document.getElementById('root');
    if (!root || root.dataset.phantasmFinalMobileRepair === '1') return;
    root.dataset.phantasmFinalMobileRepair = '1';

    root.addEventListener('change', () => scheduleRepair(0), true);

    const observer = new MutationObserver(() => scheduleRepair(60));
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['checked', 'selected', 'aria-checked', 'aria-pressed', 'aria-disabled', 'class', 'tabindex', 'value'],
    });

    scheduleRepair(40);
    [150, 500, 1000, 1800].forEach((delay) => setTimeout(repair, delay));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();