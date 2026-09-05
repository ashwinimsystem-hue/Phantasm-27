/* PHANTASM'27 — ADMIN SCREENSHOT VIEWER v1
   ============================================================
   Makes the payment screenshots that participants upload with
   their registration VISIBLE in /admin/panel.

   The backend already stores every screenshot (Upstash key
   `reg:shot:<id>` in production, data/db.json → shots locally)
   and already serves it to logged-in admins at
   GET /api/admin/screenshot/:id — but the shipped panel UI never
   calls that endpoint, so admins could never find the images.

   This patch adds the missing viewer:
     • a "🧾 Screenshot" button on every registrations row
       (button itself is injected by a one-line edit in the bundle),
     • a lightbox that fetches the image with the admin Bearer
       token (sessionStorage.vaagai_admin_token) and shows it with
       the registration's ID / name / amount / UTR / status,
     • "Verify Payment" / "Undo Verification" actions that reuse
       the panel's OWN row buttons (dispatching a click on them) so
       the panel's React state stays the single source of truth,
     • clear messaging for 401 (session expired) and 404 (no
       screenshot stored — e.g. upload exceeded the ~750 KB
       storage cap at submit time).

   Loaded with `defer` after the bundle; defines
   window.__VaagaiShotViewer.open(reg, rowElement). No build step,
   no API, auth or data changes. Styling lives in
   phantasm-admin-screenshot-viewer-v1.css.
   ============================================================ */
(function () {
  'use strict';

  var currentReg = null;
  var currentRow = null;
  var loadSeq = 0;
  var el = {};

  var apiBase = function () { return String(window.__VAAGAI_API_BASE_URL || '').replace(/\/$/, ''); };
  var adminToken = function () { return String(sessionStorage.getItem('vaagai_admin_token') || ''); };

  function ensureModal() {
    if (document.getElementById('pss-backdrop')) return;
    var backdrop = document.createElement('div');
    backdrop.id = 'pss-backdrop';
    backdrop.setAttribute('role', 'presentation');
    backdrop.innerHTML =
      '<div class="pss-modal" role="dialog" aria-modal="true" aria-label="Payment screenshot">' +
      '  <div class="pss-head">' +
      '    <div class="pss-title">🧾 Payment Screenshot</div>' +
      '    <button type="button" class="pss-close" aria-label="Close">×</button>' +
      '  </div>' +
      '  <div class="pss-meta"></div>' +
      '  <div class="pss-body"></div>' +
      '  <div class="pss-foot"></div>' +
      '</div>';
    document.body.appendChild(backdrop);
    el = {
      backdrop: backdrop,
      modal: backdrop.querySelector('.pss-modal'),
      meta: backdrop.querySelector('.pss-meta'),
      body: backdrop.querySelector('.pss-body'),
      foot: backdrop.querySelector('.pss-foot'),
    };
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
    backdrop.querySelector('.pss-close').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && backdrop.classList.contains('open')) close();
    });
  }

  function close() {
    var backdrop = document.getElementById('pss-backdrop');
    if (!backdrop) return;
    backdrop.classList.remove('open');
    loadSeq++; // cancel any in-flight render
    var img = el.body && el.body.querySelector('img.pss-img');
    if (img && img.dataset.objectUrl) { try { URL.revokeObjectURL(img.dataset.objectUrl); } catch (_) {} }
  }

  function chip(text, cls) {
    return '<span class="pss-chip ' + cls + '">' + text + '</span>';
  }

  function statusChip(status) {
    if (status === 'VERIFIED') return chip('✅ Payment verified', 'ok');
    if (status === 'PENDING_VERIFICATION') return chip('⏳ Pending verification', 'warn');
    return chip(String(status || 'Unknown'), 'warn');
  }

  function renderMeta(reg) {
    var utr = String(reg.utr || '').trim();
    el.meta.innerHTML =
      '<div class="pss-meta-grid">' +
      '  <div><span class="pss-k">Registration</span><span class="pss-v">' + esc(reg.id) + '</span></div>' +
      '  <div><span class="pss-k">Name</span><span class="pss-v">' + esc(reg.name) + '</span></div>' +
      '  <div><span class="pss-k">Amount</span><span class="pss-v">₹' + esc(reg.amount) + '</span></div>' +
      '  <div><span class="pss-k">UTR / Ref. No.</span><span class="pss-v">' + (utr ? esc(utr) : '<em>not provided</em>') + '</span></div>' +
      '</div>' +
      '<div class="pss-chips">' + statusChip(reg.payment_status) + '</div>';
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function rowButton(selector) {
    if (!currentRow || !currentRow.isConnected) return null;
    return currentRow.querySelector(selector);
  }

  function renderActions(reg) {
    var html = '';
    if (reg.payment_status === 'PENDING_VERIFICATION') {
      html += '<button type="button" class="pss-act pss-verify" data-pss-act="verify">✅ Verify Payment</button>';
    }
    if (reg.payment_status === 'VERIFIED' && rowButton('.undo-btn')) {
      html += '<button type="button" class="pss-act pss-undo" data-pss-act="undo">↩ Undo Verification</button>';
    }
    html += '<button type="button" class="pss-act pss-neutral" data-pss-act="download">⬇ Download</button>';
    html += '<button type="button" class="pss-act pss-neutral" data-pss-act="close">Close</button>';
    el.foot.innerHTML = html;

    var verifyBtn = el.foot.querySelector('[data-pss-act="verify"]');
    if (verifyBtn) verifyBtn.addEventListener('click', function () { verifyViaPanel('verify'); });
    var undoBtn = el.foot.querySelector('[data-pss-act="undo"]');
    if (undoBtn) undoBtn.addEventListener('click', function () { verifyViaPanel('undo'); });
    var dlBtn = el.foot.querySelector('[data-pss-act="download"]');
    if (dlBtn) dlBtn.addEventListener('click', downloadImage);
    el.foot.querySelector('[data-pss-act="close"]').addEventListener('click', close);
  }

  /* Preferred path: the panel's own buttons already update React state +
     call the API, so we simply click them. Keeps one source of truth. */
  function verifyViaPanel(kind) {
    var selector = kind === 'verify' ? '.payverify-btn' : '.undo-btn';
    var target = rowButton(selector);
    if (target) {
      target.click();
      currentReg.payment_status = kind === 'verify' ? 'VERIFIED' : 'PENDING_VERIFICATION';
      renderMeta(currentReg);
      renderActions(currentReg);
      flash(kind === 'verify'
        ? 'Handed to the panel — payment marked verified.'
        : 'Handed to the panel — verification undone.');
      return;
    }
    /* Fallback (row re-rendered and button is gone): call the API ourselves. */
    directApi(kind);
  }

  function directApi(kind) {
    var url = apiBase() + '/api/admin/payment/' + (kind === 'verify' ? 'verify/' : 'undo/') + encodeURIComponent(currentReg.id);
    fetch(url, { method: 'PUT', headers: { Authorization: 'Bearer ' + adminToken() } })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.j.message || 'Request failed.');
        currentReg.payment_status = kind === 'verify' ? 'VERIFIED' : 'PENDING_VERIFICATION';
        renderMeta(currentReg);
        renderActions(currentReg);
        flash(res.j.message || (kind === 'verify' ? 'Payment verified.' : 'Verification undone.'));
      })
      .catch(function (e) { flash('⚠ ' + (e && e.message ? e.message : 'Request failed.')); });
  }

  function flash(message) {
    var note = el.foot.querySelector('.pss-note');
    if (!note) {
      note = document.createElement('div');
      note.className = 'pss-note';
      el.foot.appendChild(note);
    }
    note.textContent = message;
  }

  function extFromMime(mime) {
    if (mime === 'image/png') return 'png';
    if (mime === 'image/webp') return 'webp';
    return 'jpg';
  }

  var lastObjectUrl = null;
  function downloadImage() {
    var img = el.body.querySelector('img.pss-img');
    if (!img || !img.dataset.objectUrl) return;
    var a = document.createElement('a');
    a.href = img.dataset.objectUrl;
    a.download = 'payment-screenshot-' + (currentReg && currentReg.id ? currentReg.id : 'registration') + '.' + (img.dataset.ext || 'jpg');
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function bodyMessage(html, cls) {
    el.body.innerHTML = '<div class="pss-msg ' + (cls || '') + '">' + html + '</div>';
  }

  function notStoredMessage(reg) {
    var uploadedButTooBig = reg.has_screenshot === true && reg.screenshot_stored === false;
    if (uploadedButTooBig) {
      return 'The participant <b>did upload</b> a screenshot, but it exceeded the ~750&nbsp;KB storage limit at submit time, so only the metadata was kept.' +
        '<br><br>Ask them to re-send it (registering again with a smaller image stores it), or request the UTR <b>' +
        (String(reg.utr || '').trim() ? esc(reg.utr) : 'reference number') + '</b> and match it against your payment app history.';
    }
    return 'No screenshot is stored for this registration on the server.' +
      '<br><br>If the participant says they uploaded one, it was most likely too large to be stored (limit ≈ 750&nbsp;KB). ' +
      'Ask them to re-upload a smaller image, or verify via the UTR in your UPI/bank app history.';
  }

  function open(reg, row) {
    if (!reg || !reg.id) return;
    currentReg = reg;
    currentRow = row || null;
    ensureModal();
    renderMeta(reg);
    el.body.innerHTML = '<div class="pss-loading">Loading screenshot…</div>';
    el.foot.innerHTML = '<button type="button" class="pss-act pss-neutral" data-pss-act="close">Close</button>';
    el.foot.querySelector('[data-pss-act="close"]').addEventListener('click', close);
    el.backdrop.classList.add('open');
    var closeBtn = el.backdrop.querySelector('.pss-close');
    if (closeBtn) closeBtn.focus();

    var seq = ++loadSeq;
    var url = apiBase() + '/api/admin/screenshot/' + encodeURIComponent(reg.id);
    fetch(url, { headers: { Authorization: 'Bearer ' + adminToken() } })
      .then(function (r) {
        if (seq !== loadSeq) return null; // closed / superseded
        if (r.status === 404) return { notFound: true };
        if (r.status === 401) return { unauthorized: true };
        if (!r.ok) return { failed: true, status: r.status };
        return r.blob().then(function (blob) { return { blob: blob, mime: blob.type || r.headers.get('Content-Type') || 'image/jpeg' }; });
      })
      .then(function (result) {
        if (!result || seq !== loadSeq) return;
        if (result.notFound) return bodyMessage(notStoredMessage(reg), 'warn');
        if (result.unauthorized) return bodyMessage('Your admin session has expired. <br>Please go back to <b>/admin</b> and log in again, then reopen the screenshot.', 'warn');
        if (result.failed) return bodyMessage('Could not load the screenshot (server error ' + result.status + '). Please try again.', 'warn');

        if (lastObjectUrl) { try { URL.revokeObjectURL(lastObjectUrl); } catch (_) {} }
        lastObjectUrl = URL.createObjectURL(result.blob);
        el.body.innerHTML = '<img class="pss-img" alt="Payment screenshot for ' + esc(reg.id) + '">';
        var img = el.body.querySelector('img.pss-img');
        img.src = lastObjectUrl;
        img.dataset.objectUrl = lastObjectUrl;
        img.dataset.ext = extFromMime(result.mime);
        renderActions(reg); // full actions once the image is visible
      })
      .catch(function () {
        if (seq !== loadSeq) return;
        bodyMessage('Could not reach the server to load the screenshot. Check your connection and try again.', 'warn');
      });
  }

  window.__VaagaiShotViewer = { open: open, close: close };
})();
