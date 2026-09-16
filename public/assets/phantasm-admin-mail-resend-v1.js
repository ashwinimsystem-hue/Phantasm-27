/* PHANTASM'27 — admin "Resend mail" button + awaiting-payment label (v1)
 *
 * Two admin-panel helpers, applied in the DOM (the panel is rendered by the
 * prebuilt bundle, so buttons can only be added at runtime):
 *
 *   1. RESEND — every registration row gets a small "Resend mail" button that
 *      calls PUT /api/admin/confirmation/resend/:id. Verified registrations
 *      get the confirmation mail (with event guides) again; anything else gets
 *      the pending acknowledgment instead. This is the operational fix for
 *      "verification mail is not received": one click retries delivery, and a
 *      failed retry reports the real server error in the button tooltip.
 *
 *   2. AWAITING-PAYMENT label — rows created by the new pre-register step
 *      (details saved before the payment page) show "Awaiting payment"
 *      instead of the generic "Pending", so admins can tell "paid, needs
 *      verification" apart from "details received, no payment yet".
 *
 * How rows are matched to records: the grid does not render registration ids,
 * so this script fetches /api/admin/registrations with the same admin token
 * the panel uses and matches each row by its visible cells
 * (name|college|team|event|amount|utr). Rows that cannot be matched EXACTLY
 * are left completely untouched — a missing button is always preferred over a
 * button wired to the wrong registration.
 */
(function () {
  'use strict';

  function isAdminRoute() {
    try {
      return /^\/admin(\/|$)/.test(window.location.pathname);
    } catch (e) {
      return false;
    }
  }

  function apiBase() {
    try {
      return String(window.__VAAGAI_API_BASE_URL || '');
    } catch (e) {
      return '';
    }
  }

  function adminToken() {
    try {
      return String(window.sessionStorage.getItem('vaagai_admin_token') || '');
    } catch (e) {
      return '';
    }
  }

  function norm(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function normAmount(value) {
    return String(value == null ? '' : value).replace(/[₹,\s]/g, '').trim();
  }

  /* ── styles for the injected button ────────────────────────────── */
  function ensureStyles() {
    if (document.getElementById('phantasm-resend-style')) return;
    var style = document.createElement('style');
    style.id = 'phantasm-resend-style';
    style.textContent = [
      '.phantasm-resend-btn{',
      '  padding:.3rem .6rem;border-radius:6px;cursor:pointer;',
      '  border:1px solid rgba(217,164,65,.45);background:rgba(217,164,65,.08);',
      '  color:#f0cf8b;font-size:.75rem;line-height:1.2;white-space:nowrap;',
      '}',
      '.phantasm-resend-btn:hover:not(:disabled){background:rgba(217,164,65,.18);}',
      '.phantasm-resend-btn:disabled{opacity:.6;cursor:default;}',
      '.phantasm-resend-btn.phantasm-resend-ok{border-color:rgba(0,255,136,.5);color:#9fe6a0;}',
      '.phantasm-resend-btn.phantasm-resend-fail{border-color:rgba(255,77,77,.6);color:#ff9d9d;}'
    ].join('');
    document.head.appendChild(style);
  }

  /* ── record cache (our own copy of the registrations list) ─────── */
  var cache = [];
  var cacheAt = 0;
  var fetching = false;
  var CACHE_TTL_MS = 45000;

  function refreshCache(done) {
    var token = adminToken();
    if (!token || fetching) {
      if (typeof done === 'function') done();
      return;
    }
    fetching = true;
    fetch(apiBase() + '/api/admin/registrations', {
      headers: { Authorization: 'Bearer ' + token }
    }).then(function (res) {
      return res.json().catch(function () { return null; });
    }).then(function (data) {
      if (data && data.success && Array.isArray(data.registrations)) {
        cache = data.registrations;
        cacheAt = Date.now();
      }
    }).catch(function () { /* panel's own fetch shows errors; stay silent */ }
    ).then(function () {
      fetching = false;
      if (typeof done === 'function') done();
    });
  }

  function recordKey(r) {
    return [
      norm(r.name),
      norm(r.college),
      norm(r.team_id || ''),
      norm(r.event),
      normAmount(r.amount),
      norm(r.utr || '')
    ].join('|');
  }

  function rowKey(cells) {
    /* Grid column order: Name, College, Team ID, Event, Amount, UTR, … */
    var team = norm(cells[2]);
    if (team === '-') team = '';
    return [
      norm(cells[0]),
      norm(cells[1]),
      team,
      norm(cells[3]),
      normAmount(cells[4]),
      norm(cells[5])
    ].join('|');
  }

  function buildRecordQueues() {
    var map = {};
    for (var i = 0; i < cache.length; i += 1) {
      var key = recordKey(cache[i]);
      if (!map[key]) map[key] = [];
      map[key].push(cache[i]);
    }
    var cursor = {};
    return {
      take: function (key) {
        var queue = map[key];
        if (!queue || !queue.length) return null;
        var n = cursor[key] || 0;
        if (n >= queue.length) return null; /* more rows than records — stop */
        cursor[key] = n + 1;
        return queue[n];
      }
    };
  }

  /* ── resend action ─────────────────────────────────────────────── */
  function resend(id, btn) {
    var token = adminToken();
    if (!token) return;
    btn.disabled = true;
    btn.textContent = 'Sending…';
    btn.classList.remove('phantasm-resend-ok', 'phantasm-resend-fail');
    fetch(apiBase() + '/api/admin/confirmation/resend/' + encodeURIComponent(id), {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + token }
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        var ok = !!(data && (data.mailSent || data.success));
        btn.classList.add(ok ? 'phantasm-resend-ok' : 'phantasm-resend-fail');
        btn.textContent = ok ? 'Sent ✓' : 'Failed — retry';
        btn.title = data && data.message ? data.message + (data.mailError ? ' (' + data.mailError + ')' : '') : (ok ? 'Mail sent.' : 'Mail failed.');
      });
    }).catch(function (err) {
      btn.classList.add('phantasm-resend-fail');
      btn.textContent = 'Failed — retry';
      btn.title = 'Network error: ' + (err && err.message ? err.message : err);
    }).then(function () {
      setTimeout(function () {
        if (!document.contains(btn)) return;
        btn.disabled = false;
        btn.textContent = '✉️ Resend mail';
      }, 4000);
    });
  }

  function actionHost(row) {
    /* Preferred: the flex cell that already holds the screenshot button. */
    var shot = row.querySelector('.screenshot-btn');
    if (shot && shot.parentElement) return shot.parentElement;
    var kids = row.children;
    return kids && kids.length ? kids[kids.length - 1] : null;
  }

  function annotateRow(row, queues) {
    if (!row || row.classList.contains('header')) return;
    if (row.querySelector('.phantasm-resend-btn')) return; /* already done */
    var cells = [];
    for (var i = 0; i < row.children.length && i < 6; i += 1) {
      cells.push(row.children[i].textContent || '');
    }
    if (cells.length < 6) return;
    var rec = queues.take(rowKey(cells));
    if (!rec || !rec.id) return; /* no exact match — leave the row alone */
    row.setAttribute('data-phantasm-reg-id', String(rec.id));

    if (String(rec.payment_status || '') === 'AWAITING_PAYMENT') {
      var badge = row.querySelector('.status.paid');
      if (badge && norm(badge.textContent) === '⏳ pending') {
        badge.textContent = '⏳ Awaiting payment';
      }
    }

    var host = actionHost(row);
    if (!host) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'phantasm-resend-btn';
    btn.textContent = '✉️ Resend mail';
    btn.title = String(rec.payment_status || '') === 'VERIFIED'
      ? 'Re-send the confirmation mail with event guides to ' + (rec.email || 'the participant')
      : 'Re-send the acknowledgment mail to ' + (rec.email || 'the participant') + ' (registration is not verified yet)';
    (function (id, button) {
      button.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        resend(id, button);
      });
    })(String(rec.id), btn);
    host.appendChild(btn);
  }

  function annotate() {
    if (!isAdminRoute()) return;
    ensureStyles();
    var rows = document.querySelectorAll('.admin-row:not(.header)');
    if (!rows.length) return;
    var unmarked = 0;
    for (var i = 0; i < rows.length; i += 1) {
      if (!rows[i].querySelector('.phantasm-resend-btn')) unmarked += 1;
    }
    if (!unmarked) return;
    if (!cache.length || Date.now() - cacheAt > CACHE_TTL_MS) {
      refreshCache(function () { annotate(); });
      return;
    }
    var queues = buildRecordQueues();
    for (var j = 0; j < rows.length; j += 1) {
      try { annotateRow(rows[j], queues); } catch (e) { /* one bad row never blocks the rest */ }
    }
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(function () {
      pending = false;
      try { annotate(); } catch (e) { /* never break the panel */ }
    }, 150);
  }

  function start() {
    if (!isAdminRoute()) return;
    try { annotate(); } catch (e) { /* ignore */ }
    var root = document.body || document.documentElement;
    if (!window.MutationObserver || !root) return;
    if (root.getAttribute('data-phantasm-resend-watch') === '1') return;
    root.setAttribute('data-phantasm-resend-watch', '1');
    try {
      new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
    } catch (e) { /* first pass already applied */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
  [400, 1200, 2500].forEach(function (delay) { setTimeout(start, delay); });
})();
