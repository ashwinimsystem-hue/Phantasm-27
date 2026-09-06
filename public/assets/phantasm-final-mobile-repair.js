/* PHANTASM'27 — final mobile layout repair
   The compiled homepage renders the countdown heading separately from the
   countdown box. On mobile, move that real heading into the rebuilt hero shell
   so the date, heading, and timer become one compact flow.
   Also labels the Mehendi competition tile with its girls-only eligibility and
   prevents male registrants from selecting it.
*/
(function () {
  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const isMobile = () => window.matchMedia?.('(max-width: 768px)').matches;
  const isHome = () => {
    const currentPath = window.location.pathname.replace(/\/$/, '');
    return currentPath === '' || currentPath === '/index.html';
  };

  const mehendiPattern = /mehendi|mehandi|mehndi|henna/i;
  const eventTileSelector = '.event-card, [class*="event-card" i], [class*="event-tile" i], [class*="event-item" i]';
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
    // Element text is concatenated WITHOUT separators (React emits no whitespace
    // text nodes between siblings), so "Mehendi" + "Tap to select" becomes
    // "MehendiTap to select" and a \b-anchored pattern can never match. Join the
    // pieces with a space before testing.
    const parts = [];
    tile.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, li, [class*="title" i]').forEach((el) => parts.push(el.textContent || ''));
    parts.push(tile.textContent || '');
    return normalize(parts.join(' '));
  }

  function isMehendiTile(tile) {
    return mehendiPattern.test(tileSearchText(tile));
  }

  function rememberAttribute(element, attribute, marker) {
    if (element.dataset[marker]) return;
    const current = element.getAttribute(attribute);
    element.dataset[marker] = current == null ? '__ABSENT__' : current;
  }

  function restoreAttribute(element, attribute, marker) {
    const original = element.dataset[marker];
    if (!original) return;
    if (original === '__ABSENT__') {
      if (element.hasAttribute(attribute)) element.removeAttribute(attribute);
    } else if (element.getAttribute(attribute) !== original) {
      element.setAttribute(attribute, original);
    }
    delete element.dataset[marker];
  }

  function setAttributeIfChanged(element, attribute, value) {
    if (element.getAttribute(attribute) !== value) element.setAttribute(attribute, value);
  }

  function tileIsSelected(tile) {
    return tile.getAttribute('aria-pressed') === 'true' || tile.classList.contains('selected');
  }

  function allowOneDeselect(tile) {
    tile.dataset.phantasmAllowMehendiDeselect = '1';
    tile.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    setTimeout(() => delete tile.dataset.phantasmAllowMehendiDeselect, 0);
  }

  function setFlag(tile, name, value) {
    if (tile.dataset[name] !== value) tile.dataset[name] = value;
  }

  function setMaleDisabled(tile) {
    rememberAttribute(tile, 'aria-disabled', 'phantasmOriginalAriaDisabled');
    rememberAttribute(tile, 'tabindex', 'phantasmOriginalTabindex');
    setFlag(tile, 'phantasmMehendiDisabled', '1');
    setAttributeIfChanged(tile, 'aria-disabled', 'true');
    setAttributeIfChanged(tile, 'tabindex', '-1');

    tile.querySelectorAll('button, input, select, textarea, a, [role="button"], [role="radio"]')
      .forEach((control) => {
        rememberAttribute(control, 'aria-disabled', 'phantasmOriginalAriaDisabled');
        rememberAttribute(control, 'tabindex', 'phantasmOriginalTabindex');
        if ('disabled' in control) {
          if (!control.dataset.phantasmOriginalDisabled) {
            control.dataset.phantasmOriginalDisabled = control.disabled ? '1' : '0';
          }
          if (!control.disabled) control.disabled = true;
        }
        setAttributeIfChanged(control, 'aria-disabled', 'true');
        setAttributeIfChanged(control, 'tabindex', '-1');
      });

    tile.querySelectorAll('input:checked').forEach((input) => {
      input.checked = false;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    if (tileIsSelected(tile) && tile.dataset.phantasmDeselectAttempted !== '1') {
      tile.dataset.phantasmDeselectAttempted = '1';
      allowOneDeselect(tile);
    }
  }

  function restoreTile(tile) {
    setFlag(tile, 'phantasmMehendiDisabled', '0');
    delete tile.dataset.phantasmDeselectAttempted;
    restoreAttribute(tile, 'aria-disabled', 'phantasmOriginalAriaDisabled');
    restoreAttribute(tile, 'tabindex', 'phantasmOriginalTabindex');

    tile.querySelectorAll('button, input, select, textarea, a, [role="button"], [role="radio"]')
      .forEach((control) => {
        if (control.dataset.phantasmOriginalDisabled) {
          if ('disabled' in control && control.disabled !== (control.dataset.phantasmOriginalDisabled === '1')) {
            control.disabled = control.dataset.phantasmOriginalDisabled === '1';
          }
          delete control.dataset.phantasmOriginalDisabled;
        }
        restoreAttribute(control, 'aria-disabled', 'phantasmOriginalAriaDisabled');
        restoreAttribute(control, 'tabindex', 'phantasmOriginalTabindex');
      });
  }

  function repairMehendiTile() {
    const root = document.getElementById('root');
    if (!root) return;

    const male = isMaleGender(getGender(root));

    getEventTiles(root).forEach((tile) => {
      if (!isMehendiTile(tile)) return;

      if (!tile.querySelector(':scope > .phantasm-mehendi-eligibility')) {
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
      }

      if (male) setMaleDisabled(tile);
      else restoreTile(tile);
    });
  }

  function repair() {
    repairCountdownLayout();
    repairMehendiTile();
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

    const guardInteraction = (event) => {
      const tile = event.target?.closest?.(eventTileSelector);
      if (!tile || !root.contains(tile) || !isMehendiTile(tile)) return;
      if (tile.dataset.phantasmMehendiDisabled !== '1' || tile.dataset.phantasmAllowMehendiDeselect === '1') return;

      if (event.type === 'keydown' || event.type === 'keyup') {
        if (event.key !== 'Enter' && event.key !== ' ') return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };

    ['pointerdown', 'click', 'keydown', 'keyup'].forEach((type) => root.addEventListener(type, guardInteraction, true));

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
