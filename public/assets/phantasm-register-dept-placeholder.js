/* PHANTASM'27 - registration: Department placeholder wording
   Replaces "Mechanical Engineering" with "Enter your department" in the
   Department input on /register.

   Why this is done in the DOM: the site is served from a prebuilt React bundle
   (public/assets/index-BVThDX27.js) and this repo holds no source for it, so the
   bundle cannot be rebuilt and its hash-named file must not be edited in place
   (Vercel caches hash-named assets as immutable, so returning visitors would keep
   the old copy). Only the attribute is written; the field itself is untouched -
   it still has name="dept", still required, still posts the same value.

   React will not fight this rewrite: its placeholder prop never changes, so a
  re-render never re-writes the attribute. The observer exists purely for a fresh
  mount (returning to /register) and to stay correct if the bundle is ever rebuilt
  with the same string.

   Deliberately narrow: an input is only rewritten while its placeholder is
   exactly the old wording, so nothing else - not the admin forms, not the other
   registration hints, not a value the student typed - can be affected.
   Colour is handled by phantasm-register-dept-placeholder.css.
*/
(function () {
  var FROM = 'Mechanical Engineering';
  var TO = 'Enter your department';
  var ATTR = 'data-phantasm-dept-hint';
  var WATCHED = 'data-phantasm-dept-hint-watch';
  var busy = false;

  function patch() {
    var changed = 0;
    var inputs;
    if (!document.querySelectorAll) return changed;
    inputs = document.querySelectorAll('input[name="dept"]');
    if (!inputs || !inputs.length) return changed;
    for (var i = 0; i < inputs.length; i += 1) {
      var el = inputs[i];
      var now = el.getAttribute('placeholder');
      if (now === TO) continue;
      if (now !== FROM) continue;
      el.setAttribute('placeholder', TO);
      el.setAttribute(ATTR, '1');
      changed += 1;
    }
    return changed;
  }

  /* One coalesced pass per animation frame-ish window; the busy flag keeps our own
     write from re-triggering the observer. */
  function schedule() {
    if (busy) return;
    if (schedule.pending) return;
    schedule.pending = true;
    setTimeout(function () {
      schedule.pending = false;
      if (busy) return;
      busy = true;
      var n = patch();
      busy = false;
      if (n && window.console && console.info) {
        console.info('[phantasm-dept-hint] Department placeholder -> "' + TO + '" (' + n + ' field)');
      }
    }, 30);
  }

  function start() {
    busy = true;
    var n = patch();
    busy = false;
    if (n && window.console && console.info) {
      console.info('[phantasm-dept-hint] Department placeholder -> "' + TO + '" (' + n + ' field)');
    }

    var root = document.body || document.documentElement;
    if (!window.MutationObserver || !root) return;
    if (root.getAttribute(WATCHED) === '1') return;
    root.setAttribute(WATCHED, '1');
    try {
      /* childList only: catches React mounting a new form without ever being
         re-triggered by our own attribute write. */
      new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
    } catch (e) {
      /* Nothing to do: the first pass above already fixed the form on screen. */
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  /* SPA routes mount later than first paint; a few cheap retries cover the first
     navigation to /register without a router to hook into. */
  [120, 400, 1200].forEach(function (delay) {
    setTimeout(start, delay);
  });
})();