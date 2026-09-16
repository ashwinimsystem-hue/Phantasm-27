/* PHANTASM'27 — venue + paper-presentation rule cleanup (v1)
 *
 * Two content fixes applied in the DOM, because the site is served from a
 * prebuilt React bundle (public/assets/index-BVThDX27.js) that this repo holds
 * no source for and whose hash-named file must not be edited in place:
 *
 *   1. PAPER PRESENTATION — remove the rule
 *      "IEEE format recommended; original work only (plagiarism =
 *      disqualification)." from the rules modal.
 *
 *   2. VENUE — remove the event venue everywhere it is shown:
 *        · event cards        ("📍 <venue> • 📅 <date>"  ->  "📅 <date>")
 *        · rules modal header ("📍 <venue> • 📅 <date> • fee…" -> "📅 <date> • fee…")
 *        · About page box     ("Venue & Date" heading -> "Event Date",
 *                              the "📍 MECHANICAL DEPARTMENT, GCEB" line removed)
 *      Dates, fees, prizes and everything else are untouched. The footer
 *      contact address ("📍 Government College of Engineering" + street lines)
 *      is deliberately KEPT — it is contact info, not an event venue.
 *
 * React-safety: the venue/date/fee strings are static props that never change,
 * so React never re-writes these nodes after first render; our edits persist
 * until a full remount (route change), which the observer below re-covers.
 * Only text nodes / elements matching the exact patterns are touched.
 */
(function () {
  'use strict';

  var IEEE_NEEDLE = 'IEEE format recommended';
  /* Lower-cased venue names shipped in the bundle (matched case-insensitively
     so a future rebuild with different capitalisation still cleans up). */
  var KNOWN_VENUES = [
    '3rd year classroom',
    'cad lab',
    'smart class',
    'ground',
    'indoor stadium',
    '3rd year classroom',
    'seminar hall',
    'drawing hall',
    'mech dept',
    'campus wide'
  ];
  var CLEAN_ATTR = 'data-phantasm-venue-cleaned';

  function norm(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /* ── 1. IEEE rule line ─────────────────────────────────────────── */
  function removeIEEEClause(root) {
    if (!root || !root.querySelectorAll) return 0;
    var removed = 0;
    var items = root.querySelectorAll('li');
    for (var i = 0; i < items.length; i += 1) {
      var li = items[i];
      var text = String(li.textContent || '');
      /* Narrow: the exact rule sentence, and short enough that we can only
         ever match the single rule <li>, never a list container. */
      if (text.indexOf(IEEE_NEEDLE) !== -1 && text.length < 400) {
        li.remove();
        removed += 1;
      }
    }
    return removed;
  }

  /* ── 2a. event cards + rules modal ("📍 venue • 📅 date …") ─────── */
  function cleanVenueParagraph(p) {
    if (!p || p.getAttribute(CLEAN_ATTR) === '1') return false;
    var text = String(p.textContent || '');
    if (text.indexOf('📍') === -1 || text.indexOf('📅') === -1) return false;

    var kids = Array.prototype.slice.call(p.childNodes);
    for (var i = 0; i < kids.length; i += 1) {
      var k = kids[i];
      if (!k || k.nodeType !== 3) continue; /* text nodes only */
      var v = String(k.nodeValue || '');
      if (v.indexOf('📍') !== -1 && v.indexOf('📅') === -1) {
        /* Pure pin/separator node ("📍 ") -> drop it; mixed node -> strip pin. */
        if (v.replace(/📍\s*/g, '').trim() === '') k.remove();
        else k.nodeValue = v.replace(/📍\s*/g, '');
      } else if (KNOWN_VENUES.indexOf(norm(v)) !== -1) {
        k.remove(); /* the venue's own text node */
      } else if (v.indexOf('📅') !== -1) {
        k.nodeValue = v.replace(/^\s*•\s*/, ''); /* " • 📅 " -> "📅 " */
      }
    }

    /* Fallback: if the bundle ever renders the whole line in ONE text node,
       strip the venue chunk at the text level instead. */
    if (String(p.textContent || '').indexOf('📍') !== -1) {
      Array.prototype.slice.call(p.childNodes).forEach(function (node) {
        if (node && node.nodeType === 3 && String(node.nodeValue || '').indexOf('📍') !== -1) {
          node.nodeValue = String(node.nodeValue).replace(/📍[^📅•]*?•\s*/g, '');
        }
      });
    }

    p.setAttribute(CLEAN_ATTR, '1');
    return true;
  }

  function cleanVenueParagraphs(root) {
    if (!root || !root.querySelectorAll) return 0;
    var changed = 0;
    var paras = root.querySelectorAll('p');
    for (var i = 0; i < paras.length; i += 1) {
      if (cleanVenueParagraph(paras[i])) changed += 1;
    }
    return changed;
  }

  /* ── 2b. About page "Venue & Date" box ──────────────────────────── */
  function cleanAboutVenueBox() {
    var changed = 0;
    var heads = document.querySelectorAll('h3');
    for (var i = 0; i < heads.length; i += 1) {
      var h = heads[i];
      if (norm(h.textContent) !== 'venue & date') continue;
      h.textContent = 'Event Date';
      changed += 1;
      /* The venue line is a sibling <p> starting with 📍 inside the same box. */
      var box = h.parentElement;
      if (!box) continue;
      var paras = box.querySelectorAll('p');
      for (var j = 0; j < paras.length; j += 1) {
        var t = String(paras[j].textContent || '').trim();
        /* NOTE: indexOf, not charAt(0) — 📍 is a surrogate pair (length 2). */
        if (t.indexOf('📍') === 0 && t.indexOf('📅') === -1) {
          paras[j].remove();
          changed += 1;
        }
      }
    }
    return changed;
  }

  function pass() {
    var n = 0;
    n += removeIEEEClause(document);
    n += cleanVenueParagraphs(document);
    n += cleanAboutVenueBox();
    return n;
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(function () {
      pending = false;
      try { pass(); } catch (e) { /* never break the page */ }
    }, 40);
  }

  function start() {
    try { pass(); } catch (e) { /* never break the page */ }
    var root = document.body || document.documentElement;
    if (!window.MutationObserver || !root) return;
    if (root.getAttribute('data-phantasm-venue-cleanup-watch') === '1') return;
    root.setAttribute('data-phantasm-venue-cleanup-watch', '1');
    try {
      new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
    } catch (e) { /* first pass already applied */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
  [150, 500, 1500].forEach(function (delay) { setTimeout(start, delay); });
})();
