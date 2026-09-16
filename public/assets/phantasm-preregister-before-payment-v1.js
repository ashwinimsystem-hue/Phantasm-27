/* PHANTASM'27 — save participant details BEFORE the payment page (v1)
 *
 * Requirement: the admin panel must show a participant's details as soon as
 * they finish the registration form — not only after they submit the payment
 * screenshot + UTR.
 *
 * How it works: the bundle stores the completed form in sessionStorage under
 * "vaagai_form_draft" and then routes to /payment, which is the ONLY submit
 * the server used to see. This patch wraps sessionStorage.setItem so that the
 * moment the draft is saved, the same details are also POSTed (JSON, no
 * screenshot) to POST /api/pre-register. The server creates/updates the
 * registration with payment_status AWAITING_PAYMENT — visible in the admin
 * panel immediately. When the payment IS submitted, POST /api/register finds
 * that record by email and completes it (UTR + screenshot + pending mail).
 *
 * Failure modes are all safe:
 *   · pre-register fails / offline  -> payment-page submit still creates the
 *     full record exactly as before (the server matches by email, no dupes);
 *   · unknown future event ids      -> skipped, the rest still posts;
 *   · double navigation / back btn  -> server merges by email (idempotent);
 *   · anything throws here          -> swallowed; the wrapped setItem always
 *     behaves exactly like the native one.
 *
 * No mail is sent by pre-register — the acknowledgment mail still goes out
 * exactly once, at payment submit. No existing record is ever deleted or
 * reset by this flow.
 */
(function () {
  'use strict';

  var DRAFT_KEY = 'vaagai_form_draft';
  var ID_KEY = 'vaagai_prereg_id';
  var HASH_KEY = 'vaagai_prereg_hash';
  var NOTE_ID = 'phantasm-prereg-note';

  /* Bundle event id -> canonical title (must match the Fa catalog; unknown
     ids are skipped, never fatal). */
  var EVENT_TITLES = {
    'paper-presentation': 'Paper Presentation',
    'CAD Modeling': 'CAD Modeling',
    'ANSYS Simulation Challenge': 'ANSYS Simulation Challenge',
    'Technical Quiz': 'Technical Quiz',
    'Water Rocketry': 'Water Rocketry',
    'Glider Competition': 'Glider Competition',
    'Line Follower': 'Line Follower',
    'ipl-auction': 'IPL Auction',
    'carrom': 'Carrom',
    'chess': 'Chess',
    'free-fire': 'Free Fire',
    'treasure-hunt': 'Treasure Hunt'
  };

  function apiBase() {
    try {
      return String(window.__VAAGAI_API_BASE_URL || '');
    } catch (e) {
      return '';
    }
  }

  function hash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i += 1) {
      h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    }
    return String(h);
  }

  function buildPayload(draft) {
    if (!draft || typeof draft !== 'object') return null;
    var name = String(draft.name || '').trim();
    var email = String(draft.email || '').trim().toLowerCase();
    var phone = String(draft.phone || '').replace(/\D/g, '');
    var college = String(draft.college || '').trim();
    var dept = String(draft.dept || '').trim();
    var selected = Array.isArray(draft.selectedEvents) ? draft.selectedEvents : [];
    if (!name || !email || email.indexOf('@') === -1 || phone.length !== 10 || !college || !dept || !selected.length) {
      return null;
    }
    var titles = [];
    var details = [];
    for (var i = 0; i < selected.length; i += 1) {
      var entry = selected[i] || {};
      var title = EVENT_TITLES[String(entry.eventId || '')];
      if (!title) continue; /* unknown id — skip, don't fail */
      titles.push(title);
      details.push({ title: title, mode: String(entry.mode || '') });
    }
    if (!titles.length) return null;
    return {
      name: name,
      email: email,
      phone: phone,
      college: college,
      dept: dept,
      year: String(draft.year || ''),
      gender: String(draft.gender || ''),
      teamName: String(draft.teamName || ''),
      event: titles.join(', '),
      selectedEvents: titles,
      eventsDetail: details
    };
  }

  function postPreRegister(draft) {
    var payload;
    try {
      payload = buildPayload(draft);
    } catch (e) {
      return;
    }
    if (!payload) return;
    /* Don't hammer the server when the user goes back and re-continues with
       identical details — one post per distinct payload per session. */
    var h = hash(JSON.stringify(payload));
    try {
      if (window.sessionStorage.getItem(HASH_KEY) === h) return;
    } catch (e) { /* storage oddity — still try the post */ }
    try {
      window.sessionStorage.setItem(HASH_KEY, h);
    } catch (e) { /* ignore */ }

    fetch(apiBase() + '/api/pre-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (data && data.success && data.registrationId) {
          try { window.sessionStorage.setItem(ID_KEY, String(data.registrationId)); } catch (e) { /* ignore */ }
          showPaymentNote(String(data.registrationId));
        }
        if (window.console && console.info) {
          console.info('[phantasm-prereg] details saved before payment:', data && data.registrationId ? data.registrationId : (data && data.message) || res.status);
        }
      });
    }).catch(function (err) {
      /* Offline / server hiccup: the payment submit below still saves
         everything, so this is only logged, never surfaced. */
      try {
        window.sessionStorage.removeItem(HASH_KEY); /* allow a retry next time */
      } catch (e) { /* ignore */ }
      if (window.console && console.warn) {
        console.warn('[phantasm-prereg] pre-register failed (payment submit will still work):', err && err.message ? err.message : err);
      }
    });
  }

  /* Reassure the participant on /payment that the organisers already have
     their details — injected once, styling kept subtle and on-theme. */
  function showPaymentNote(regId) {
    try {
      if (!/\/payment\/?$/i.test(window.location.pathname)) return;
      if (document.getElementById(NOTE_ID)) return;
      var h1 = document.querySelector('.payment-page h1');
      if (!h1 || !h1.parentElement) return;
      var note = document.createElement('p');
      note.id = NOTE_ID;
      note.setAttribute('role', 'status');
      note.style.cssText = 'margin:.4rem auto 0;max-width:420px;text-align:center;font-size:.85rem;color:#9fe6a0;opacity:.95';
      note.textContent = 'Details saved with the organisers (Ref ' + regId + '). Complete the payment below to finish registration.';
      h1.parentElement.insertBefore(note, h1.nextSibling);
    } catch (e) { /* never break the page */ }
  }

  function maybeShowStoredNote() {
    try {
      var id = window.sessionStorage.getItem(ID_KEY);
      if (id) showPaymentNote(id);
    } catch (e) { /* ignore */ }
  }

  /* Wrap Storage.prototype.setItem — the draft write is our trigger.
     The prototype (not the sessionStorage instance) is wrapped on purpose:
     some DOM implementations back sessionStorage with a Proxy that silently
     ignores own-property assignment, while the prototype method always
     intercepts. The wrapper can never change setItem's behaviour: the native
     call always runs with the original receiver/arguments (native errors
     still propagate), and only the unique DRAFT_KEY triggers our POST. */
  function wrapSessionStorage() {
    try {
      var proto = window.Storage && window.Storage.prototype;
      if (!proto || proto.setItem.__phantasmPreregWrapped) return;
      var nativeSetItem = proto.setItem;
      var wrapped = function (key, value) {
        var result = nativeSetItem.apply(this, arguments);
        if (key === DRAFT_KEY) {
          try {
            postPreRegister(typeof value === 'string' ? JSON.parse(value) : value);
          } catch (e) { /* malformed draft — ignore */ }
        }
        return result;
      };
      wrapped.__phantasmPreregWrapped = true;
      proto.setItem = wrapped;
    } catch (e) { /* Storage unavailable — nothing to do */ }
  }

  function start() {
    wrapSessionStorage();
    maybeShowStoredNote();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  /* SPA navigation to /payment happens after our script ran — re-check so the
     "details saved" note appears even when the pre-register POST finished
     before the payment page mounted. */
  [300, 900, 2000].forEach(function (delay) { setTimeout(maybeShowStoredNote, delay); });
  try {
    var root = document.body || document.documentElement;
    if (window.MutationObserver && root && !root.getAttribute('data-phantasm-prereg-watch')) {
      root.setAttribute('data-phantasm-prereg-watch', '1');
      var pending = false;
      new MutationObserver(function () {
        if (pending) return;
        pending = true;
        setTimeout(function () { pending = false; wrapSessionStorage(); maybeShowStoredNote(); }, 120);
      }).observe(root, { childList: true, subtree: true });
    }
  } catch (e) { /* ignore */ }
})();
