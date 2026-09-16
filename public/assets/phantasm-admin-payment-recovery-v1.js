/* PHANTASM'27 — recover payment-page drop-offs (v1)
 *
 * Adds a guarded "Mark received" action only to an exact-match
 * AWAITING_PAYMENT row. It calls the admin-only recovery endpoint, which moves
 * that row to PENDING_VERIFICATION, records the operator, and sends the normal
 * acknowledgment mail. VERIFIED and already-pending rows are never touched.
 */
(function () {
  'use strict';

  function adminRoute() {
    try { return /^\/admin(\/|$)/.test(window.location.pathname); } catch (e) { return false; }
  }
  function apiBase() {
    try { return String(window.__VAAGAI_API_BASE_URL || ''); } catch (e) { return ''; }
  }
  function token() {
    try { return String(window.sessionStorage.getItem('vaagai_admin_token') || ''); } catch (e) { return ''; }
  }
  function norm(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().toLowerCase(); }
  function amount(value) { return String(value == null ? '' : value).replace(/[₹,\s]/g, '').trim(); }
  function recordKey(r) {
    return [norm(r.name), norm(r.college), norm(r.team_id || ''), norm(r.event), amount(r.amount), norm(r.utr || '')].join('|');
  }
  function rowKey(row) {
    var cells = [];
    for (var i = 0; i < row.children.length && i < 6; i += 1) cells.push(row.children[i].textContent || '');
    if (cells.length < 6) return '';
    var team = norm(cells[2]);
    if (team === '-') team = '';
    return [norm(cells[0]), norm(cells[1]), team, norm(cells[3]), amount(cells[4]), norm(cells[5])].join('|');
  }
  function actionHost(row) {
    var screenshot = row.querySelector('.screenshot-btn');
    if (screenshot && screenshot.parentElement) return screenshot.parentElement;
    return row.children && row.children.length ? row.children[row.children.length - 1] : null;
  }

  function styles() {
    if (document.getElementById('phantasm-recovery-style')) return;
    var style = document.createElement('style');
    style.id = 'phantasm-recovery-style';
    style.textContent = '.phantasm-mark-received-btn{padding:.3rem .6rem;border:1px solid rgba(0,255,136,.42);border-radius:6px;background:rgba(0,255,136,.07);color:#a9efb2;font-size:.75rem;line-height:1.2;cursor:pointer;white-space:nowrap}.phantasm-mark-received-btn:disabled{opacity:.65;cursor:default}.phantasm-mark-received-btn.phantasm-mark-fail{border-color:rgba(255,77,77,.6);color:#ff9d9d}';
    document.head.appendChild(style);
  }

  var records = [];
  var loading = false;
  var fetchedAt = 0;
  function refresh(done) {
    var adminToken = token();
    if (!adminToken || loading) { if (done) done(); return; }
    loading = true;
    fetch(apiBase() + '/api/admin/registrations', { headers: { Authorization: 'Bearer ' + adminToken } })
      .then(function (res) { return res.json().catch(function () { return null; }); })
      .then(function (data) {
        if (data && data.success && Array.isArray(data.registrations)) {
          records = data.registrations;
          fetchedAt = Date.now();
        }
      })
      .catch(function () { /* leave the panel's own error handling in charge */ })
      .then(function () { loading = false; if (done) done(); });
  }

  function mapRecords() {
    var map = {};
    records.forEach(function (r) {
      var key = recordKey(r);
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return map;
  }

  function markReceived(rec, button, row) {
    var adminToken = token();
    if (!adminToken || !rec || !rec.id) return;
    button.disabled = true;
    button.textContent = 'Saving…';
    button.classList.remove('phantasm-mark-fail');
    fetch(apiBase() + '/api/admin/payment/mark-received/' + encodeURIComponent(rec.id), {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + adminToken }
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (!data || !data.success) throw new Error((data && (data.message || data.mailError)) || 'The payment could not be marked received.');
        row.setAttribute('data-phantasm-payment-status', 'PENDING_VERIFICATION');
        var badge = row.querySelector('.status.paid');
        if (badge) badge.textContent = '⏳ Pending';
        button.textContent = data.mailSent === false ? 'Marked — mail failed' : 'Marked received ✓';
        button.title = data.mailSent === false ? (data.mailError || data.message || 'Mail failed; use Resend mail.') : (data.message || 'Payment marked received.');
        button.classList.toggle('phantasm-mark-fail', data.mailSent === false);
      });
    }).catch(function (error) {
      button.disabled = false;
      button.classList.add('phantasm-mark-fail');
      button.textContent = 'Retry mark received';
      button.title = error && error.message ? error.message : 'Payment could not be marked received.';
    });
  }

  function annotate() {
    if (!adminRoute()) return;
    var rows = document.querySelectorAll('.admin-row:not(.header)');
    if (!rows.length) return;
    if (!records.length || Date.now() - fetchedAt > 45000) { refresh(annotate); return; }
    var map = mapRecords();
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      if (row.querySelector('.phantasm-mark-received-btn') || row.getAttribute('data-phantasm-payment-status') === 'PENDING_VERIFICATION') continue;
      var queue = map[rowKey(row)] || [];
      var rec = queue.shift();
      if (!rec || rec.payment_status !== 'AWAITING_PAYMENT') continue;
      var host = actionHost(row);
      if (!host) continue;
      row.setAttribute('data-phantasm-reg-id', String(rec.id));
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'phantasm-mark-received-btn';
      button.textContent = '✓ Mark received';
      button.title = 'Move this awaiting-payment registration to pending verification and send the acknowledgment email.';
      (function (record, btn, target) {
        btn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          markReceived(record, btn, target);
        });
      })(rec, button, row);
      host.appendChild(button);
    }
  }

  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(function () { scheduled = false; try { annotate(); } catch (e) { /* safe patch */ } }, 150);
  }
  function start() {
    if (!adminRoute()) return;
    styles();
    try { annotate(); } catch (e) { /* safe patch */ }
    var root = document.body || document.documentElement;
    if (!window.MutationObserver || !root || root.getAttribute('data-phantasm-recovery-watch') === '1') return;
    root.setAttribute('data-phantasm-recovery-watch', '1');
    new window.MutationObserver(schedule).observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
  [400, 1200, 2500].forEach(function (delay) { window.setTimeout(start, delay); });
})();
