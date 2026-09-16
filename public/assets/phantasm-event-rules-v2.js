/* PHANTASM'27 — event rules & judging refresh, Sep 2026 poster set (v2)
 *
 * The organisers published updated rulebooks (repo root VAAGAI26_*.pdf,
 * 2 pages each: cover poster + rules/judging/prizes/coordinators). Those PDFs
 * are what participants receive by email after verification. This patch makes
 * the on-site rules modals show the SAME updated wording.
 *
 * Why in the DOM: the site is served from a prebuilt React bundle that this
 * repo holds no source for, so the bundle cannot be rebuilt and its
 * hash-named file must not be edited in place. Same pattern as the other
 * phantasm-*-v1.js runtime patches.
 *
 * Coverage (transcribed verbatim from the Sep 2026 PDFs):
 *   · Paper Presentation, CAD Modeling, ANSYS Simulation Challenge,
 *     Technical Quiz, Water Rocketry, Glider Competition, Line Follower —
 *     rules + judging criteria replaced, in BOTH surfaces where the bundle
 *     renders them: the "Rules & Judging" modal AND the inline "View Details"
 *     judging list on the event card (patching only the modal would leave the
 *     card and the modal contradicting each other).
 *   · IPL Auction — the bundle shows TREASURE HUNT rules/judging here
 *     (copy-paste error) and the new poster set contains no IPL rules text,
 *     so the modal lists AND the inline judging block are REMOVED rather than
 *     showing wrong information, and the card's "Rules & Judging" button is
 *     hidden until real IPL rules arrive (everything else on the card —
 *     prizes, date, fee, team size — is kept).
 *     (Re-add real IPL rules here the moment the organisers supply them.)
 *   · Carrom / Chess / Free Fire / Treasure Hunt — untouched: the bundle
 *     shows no rules for the first three (nothing wrong to fix) and the new
 *     posters contain no replacement rules text for any non-technical event.
 *
 * React-safety: rule strings are static props that never change, so React
 * never re-writes these <li> nodes after first render. We additionally update
 * existing <li> nodes IN PLACE (textContent only) and only append/remove nodes
 * when the new list is longer/shorter — so React's own nodes are preserved
 * wherever possible and our edits survive until a full remount (route change),
 * which the observer below re-covers. Only modals whose heading matches a
 * known event title are touched; prizes, dates, fees and coordinators are
 * never modified here.
 */
(function () {
  'use strict';

  /* Bundle modal headings look like "<Title> – Rules" (en dash). Keys below
     must match the bundle titles exactly; the lookup also tolerates the
     Modelling/Modeling spelling difference. */
  var NEW_RULES = {
    'Paper Presentation': {
      rules: [
        'Topics must be related to engineering, technology, or innovation',
        'Max of 4 participants per team',
        'Max slides up to 12 (excluding topic and thank you slides)',
        'Presentation time: 10 minutes for presentation + 5 minutes for Q&A',
        'Papers must be submitted by the specified deadline'
      ],
      judging: [
        'Originality, technical depth, and relevance',
        'Clarity, visuals, and delivery',
        'Q&A performance'
      ]
    },
    'CAD Modeling': {
      rules: [
        'Individual participation only',
        'Total event duration is 1 hour 30 minutes (90 minutes)',
        'Participants must model the given component/design within the allotted time',
        'CATIA and SOLIDWORKS are the permitted software',
        'To use any other software, inform the event coordinators prior to the event',
        'Electronic gadgets are strictly prohibited',
        'Any malpractice or unfair assistance leads to disqualification',
        'If not completed in time, the design at the end of the time limit is taken for evaluation'
      ],
      judging: [
        'Mass properties: accuracy of computed volume, mass, and CG vs. the reference component',
        'Dimensional accuracy: how closely modelled dimensions match the given drawing',
        'Model geometry: correctness of overall shape and form as per the design',
        'Feature accuracy: proper use of features (extrudes, fillets, patterns, etc.)',
        'Model completion: percentage of the model finished within the given time'
      ]
    },
    'ANSYS Simulation Challenge': {
      rules: [
        'Individual participation only',
        'ANSYS Workbench / Fluent will be provided at the venue',
        'Problem statement given on the spot — pre-prepared files are not allowed',
        'Must be completed and submitted within the given time',
        'Participants must work independently — no unauthorized assistance'
      ],
      judging: [
        'Simulation setup: geometry, material properties, mesh, boundary conditions',
        'Technical accuracy and result interpretation',
        'Problem-solving approach and time management'
      ]
    },
    'Technical Quiz': {
      rules: [
        'Each question will be displayed and moved to next with specified time limit',
        'Questions cover general mechanical engineering topics, technical trivia, and current trends',
        'Participants are prohibited from utilizing any electronic gadgets',
        'Scoring is based on correct answers'
      ],
      judging: [
        'Accuracy: number of correct answers',
        'Speed: quickness in responding within time limits',
        'Consistency: performance across all rounds'
      ]
    },
    'Water Rocketry': {
      rules: [
        'Team size: up to 2 members',
        'Only water allowed as fuel — no additives or propellants',
        'Rocket capacity: ≤ 1 litre',
        'Rockets must be fully student-built; pre-made ones are prohibited',
        'Teams may bring their own launcher (Inspected) or use the one provided'
      ],
      judging: [
        'Design: structural quality, creativity, stability',
        'Distance: maximum horizontal distance achieved',
        'Accuracy: closeness to designated target'
      ]
    },
    'Glider Competition': {
      rules: [
        'Eligibility: open to all engineering students',
        'Team composition: each team may have up to 2 members',
        'Glider requirement: prefabricated gliders only — on-spot fabrication is not allowed',
        'Specifications (mandatory): wingspan max 600mm, length max 450mm, weight max 200g',
        'Allowed materials: any wood, foam board/depron, cardboard, thermocol. Any other material needs event coordinator approval'
      ],
      judging: [
        'Range performance: maximum valid horizontal distance wins. Only stable, controlled flights are counted — stall, dive, loop or crash = disqualified',
        'Design evaluation: stability, aerodynamic efficiency, structural strength, proper CG placement, and safety',
        'Optimization & presentation: efficient material use, lightweight design, structural optimization, and clear technical explanation'
      ]
    },
    'Line Follower': {
      rules: [
        'Team size: 2–3 members; inter-department/inter-college allowed',
        'Robot must fit within 20×20×20 cm and weigh ≤ 2 kg',
        'Onboard power only (12–15V); strictly autonomous — no remote/Bluetooth/Wi-Fi control',
        'Track: black line on white background with curves, zig-zags, and 90° turns',
        'Max 2 minutes calibration time; up to 3 restarts allowed (stopwatch keeps running)',
        'Touching the robot during a run adds a +5 second penalty',
        'Ready-made kits (e.g., Lego Mindstorms) are prohibited — must be built from basic components',
        'Causing damage to the arena leads to disqualification'
      ],
      judging: [
        'Completion time: fastest run wins',
        'Accuracy: staying on track with minimal deviation',
        'Penalties: restarts and touch penalties factored into final time'
      ]
    },
    /* No authoritative IPL rules in the poster set — strip the wrong ones. */
    'IPL Auction': { strip: true }
  };

  var DONE_ATTR = 'data-phantasm-rules-v2';

  function normTitle(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .replace(/modelling/g, 'modeling');
  }

  var LOOKUP = {};
  Object.keys(NEW_RULES).forEach(function (title) {
    LOOKUP[normTitle(title)] = NEW_RULES[title];
  });

  function directChildren(el, tag) {
    var out = [];
    if (!el || !el.children) return out;
    for (var i = 0; i < el.children.length; i += 1) {
      if (el.children[i].tagName === tag) out.push(el.children[i]);
    }
    return out;
  }

  function setListItems(ul, items) {
    if (!ul) return false;
    var changed = false;
    var lis = ul.querySelectorAll(':scope > li');
    for (var i = 0; i < items.length; i += 1) {
      if (i < lis.length) {
        if (lis[i].textContent !== items[i]) {
          lis[i].textContent = items[i];
          changed = true;
        }
      } else {
        var li = document.createElement('li');
        li.textContent = items[i];
        ul.appendChild(li);
        changed = true;
      }
    }
    for (var j = lis.length - 1; j >= items.length; j -= 1) {
      lis[j].remove();
      changed = true;
    }
    return changed;
  }

  function judgingList(content) {
    var heads = content.querySelectorAll('h4');
    for (var i = 0; i < heads.length; i += 1) {
      if (String(heads[i].textContent || '').trim().toLowerCase() === 'judging criteria') {
        var box = heads[i].parentElement;
        if (box) return { box: box, ul: box.querySelector('ul') };
      }
    }
    return null;
  }

  /* Event-card title for any node inside the card: the card body holds exactly
     one <h3> (the event title), so climb a few levels until one is found. */
  function cardTitleFor(el) {
    var node = el ? el.parentElement : null;
    for (var i = 0; i < 4 && node && node !== document.body; i += 1) {
      var h3 = node.querySelector ? node.querySelector('h3') : null;
      if (h3) return String(h3.textContent || '');
      node = node.parentElement;
    }
    return '';
  }

  /* Inline "View Details" block on the event card: Duration / Team size /
     Prizes plus a Judging Criteria list fed from the same stale bundle data.
     Same replacement as the modal, or removal for IPL Auction. */
  function patchDetails(details) {
    if (!details || details.getAttribute(DONE_ATTR) === '1') return false;
    var entry = LOOKUP[normTitle(cardTitleFor(details))];
    if (!entry) return false;
    var box = null;
    var kids = details.children;
    for (var i = 0; i < kids.length; i += 1) {
      if (kids[i].tagName !== 'DIV') continue;
      var p = kids[i].querySelector('p');
      if (p && String(p.textContent || '').trim().toLowerCase() === 'judging criteria:') {
        box = kids[i];
        break;
      }
    }
    if (!box) {
      details.setAttribute(DONE_ATTR, '1');
      return false;
    }
    if (entry.strip) {
      box.remove();
      details.setAttribute(DONE_ATTR, '1');
      return true;
    }
    var ul = box.querySelector('ul');
    var changed = setListItems(ul, entry.judging);
    details.setAttribute(DONE_ATTR, '1');
    return changed;
  }

  /* IPL Auction's modal no longer contains any rules (stripped until real IPL
     rules arrive), so its "Rules & Judging" button would open a rules-less
     dialog — hide the button on IPL cards only. Static bundle markup, so
     React never re-adds it; remounts are re-covered by the observer. */
  function hideIplRulesButtons() {
    var changed = 0;
    var btns = document.querySelectorAll('button');
    for (var i = 0; i < btns.length; i += 1) {
      if (String(btns[i].textContent || '').trim() !== 'Rules & Judging') continue;
      if (normTitle(cardTitleFor(btns[i])) !== 'ipl auction') continue;
      btns[i].remove();
      changed += 1;
    }
    return changed;
  }

  function patchModal(h2) {
    if (!h2 || h2.getAttribute(DONE_ATTR) === '1') return false;
    var heading = String(h2.textContent || '');
    if (heading.indexOf('– Rules') === -1) return false;
    var title = heading.split('– Rules')[0].replace(/\s+/g, ' ').trim();
    var entry = LOOKUP[normTitle(title)];
    if (!entry) return false;

    /* h2 lives in .rules-header; the lists live in the sibling .rules-content. */
    var header = h2.parentElement;
    var modal = header ? header.parentElement : null;
    var content = modal ? modal.querySelector('.rules-content') : null;
    if (!content) return false;

    if (entry.strip) {
      var removed = false;
      var firstUl = directChildren(content, 'UL')[0];
      if (firstUl) { firstUl.remove(); removed = true; }
      var judged = judgingList(content);
      if (judged && judged.box) { judged.box.remove(); removed = true; }
      h2.setAttribute(DONE_ATTR, '1');
      return removed;
    }

    var rulesUl = directChildren(content, 'UL')[0];
    setListItems(rulesUl, entry.rules);
    var judge = judgingList(content);
    if (judge) setListItems(judge.ul, entry.judging);
    h2.setAttribute(DONE_ATTR, '1');
    return true;
  }

  function pass() {
    var changed = 0;
    var heads = document.querySelectorAll('h2');
    for (var i = 0; i < heads.length; i += 1) {
      try {
        if (patchModal(heads[i])) changed += 1;
      } catch (e) { /* one bad modal never blocks the rest */ }
    }
    var details = document.querySelectorAll('.event-details');
    for (var j = 0; j < details.length; j += 1) {
      try {
        if (patchDetails(details[j])) changed += 1;
      } catch (e) { /* one bad card never blocks the rest */ }
    }
    try {
      changed += hideIplRulesButtons();
    } catch (e) { /* never break the page */ }
    return changed;
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(function () {
      pending = false;
      try { pass(); } catch (e) { /* never break the page */ }
    }, 60);
  }

  function start() {
    try { pass(); } catch (e) { /* never break the page */ }
    var root = document.body || document.documentElement;
    if (!window.MutationObserver || !root) return;
    if (root.getAttribute('data-phantasm-rules-v2-watch') === '1') return;
    root.setAttribute('data-phantasm-rules-v2-watch', '1');
    try {
      new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
    } catch (e) { /* first pass already applied */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
  [200, 700, 1800].forEach(function (delay) { setTimeout(start, delay); });
})();
