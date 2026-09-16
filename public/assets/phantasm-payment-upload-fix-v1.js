/* PHANTASM'27 — payment upload hardening (v1)
 *
 * The compiled payment screen sends the selected File directly to
 * /api/register. Vercel rejects a large multipart request before Express can
 * return JSON, which used to become a generic "Server error" in the bundle.
 * This narrow runtime patch:
 *   - compresses oversized screenshots in the browser to about 500 KB;
 *   - normalises Vercel/proxy HTML 413/502/503/504 pages to friendly JSON;
 *   - turns a network failure into the same in-page error instead of an
 *     uncaught browser exception;
 *   - leaves every other fetch and every small file unchanged.
 *
 * It is intentionally defensive: canvas, File, Response, and FormData can be
 * unavailable in older browsers or test DOMs. In that case the native request
 * continues and the server-side response normaliser still applies.
 */
(function () {
  'use strict';

  var MAX_UPLOAD_BYTES = 500 * 1024;
  var HARD_REQUEST_BYTES = 4 * 1024 * 1024;
  var PATCH_FLAG = '__phantasmPaymentUploadFixV1';
  var LABEL_FLAG = 'data-phantasm-payment-upload-label';

  function isRegisterUrl(input) {
    try {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      return /\/api\/register(?:[/?#]|$)/i.test(String(url));
    } catch (e) {
      return false;
    }
  }

  function isFormData(value) {
    try {
      return !!value && typeof window.FormData !== 'undefined' && value instanceof window.FormData;
    } catch (e) {
      return false;
    }
  }

  function makeFile(blob, original) {
    try {
      if (typeof window.File === 'function') {
        return new window.File([blob], String(original.name || 'payment-screenshot.jpg'), {
          type: blob.type || 'image/jpeg',
          lastModified: Date.now()
        });
      }
    } catch (e) { /* Blob with a filename is a safe fallback below. */ }
    return blob;
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url;
      var image;
      try {
        if (!window.URL || !window.URL.createObjectURL || typeof window.Image !== 'function') {
          reject(new Error('Image decoder unavailable'));
          return;
        }
        url = window.URL.createObjectURL(file);
        image = new window.Image();
        image.onload = function () {
          try { window.URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
          resolve(image);
        };
        image.onerror = function () {
          try { window.URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
          reject(new Error('Image could not be decoded'));
        };
        image.src = url;
      } catch (e) {
        if (url) try { window.URL.revokeObjectURL(url); } catch (ignored) { /* ignore */ }
        reject(e);
      }
    });
  }

  function canvasBlob(canvas, quality) {
    return new Promise(function (resolve, reject) {
      try {
        if (!canvas || typeof canvas.toBlob !== 'function') {
          reject(new Error('Canvas encoder unavailable'));
          return;
        }
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('Canvas returned no image'));
        }, 'image/jpeg', quality);
      } catch (e) {
        reject(e);
      }
    });
  }

  async function compressImage(file) {
    if (!file || Number(file.size || 0) <= MAX_UPLOAD_BYTES) return file;
    if (typeof window.document === 'undefined' || !window.document.createElement) return file;

    var image;
    try {
      image = await loadImage(file);
    } catch (e) {
      return file;
    }
    var sourceWidth = Number(image.naturalWidth || image.width || 0);
    var sourceHeight = Number(image.naturalHeight || image.height || 0);
    if (!sourceWidth || !sourceHeight) return file;

    var scale = Math.min(1, Math.sqrt(MAX_UPLOAD_BYTES / Number(file.size || MAX_UPLOAD_BYTES)) * 1.45);
    scale = Math.max(0.25, scale);
    var best = file;
    for (var attempt = 0; attempt < 8; attempt += 1) {
      try {
        var canvas = window.document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(sourceWidth * scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * scale));
        var context = canvas.getContext('2d');
        if (!context) return best;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        var quality = Math.max(0.52, 0.86 - (attempt * 0.045));
        var blob = await canvasBlob(canvas, quality);
        var candidate = makeFile(blob, file);
        if (Number(candidate.size || blob.size || 0) < Number(best.size || Infinity)) best = candidate;
        if (Number(blob.size || 0) <= MAX_UPLOAD_BYTES) return candidate;
        scale = Math.max(0.25, scale * 0.8);
      } catch (e) {
        return best;
      }
    }
    return best;
  }

  async function compressedBody(body) {
    if (!isFormData(body) || typeof body.entries !== 'function') return body;
    var rows = [];
    var changed = false;
    try {
      for (var pair of body.entries()) {
        var key = pair[0];
        var value = pair[1];
        if (key === 'screenshot' && value && typeof value.size === 'number' && value.size > MAX_UPLOAD_BYTES) {
          var compressed = await compressImage(value);
          if (compressed !== value) changed = true;
          rows.push([key, compressed]);
        } else {
          rows.push([key, value]);
        }
      }
    } catch (e) {
      return body;
    }
    if (!changed || typeof window.FormData !== 'function') return body;
    var next = new window.FormData();
    rows.forEach(function (row) {
      try {
        if (row[0] === 'screenshot' && row[1] && row[1].name) next.append(row[0], row[1], row[1].name);
        else next.append(row[0], row[1]);
      } catch (e) { /* keep the original request if a browser rejects a value */ }
    });
    return next;
  }

  function jsonResponse(message, status) {
    var payload = JSON.stringify({ success: false, message: message });
    try {
      return new window.Response(payload, {
        status: status,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) {
      // The compiled bundle only needs these two Response methods.
      return {
        ok: false,
        status: status,
        json: function () { return Promise.resolve({ success: false, message: message }); }
      };
    }
  }

  function friendlyStatus(response) {
    var status = Number(response && response.status || 0);
    if (status === 413) return 'The payment screenshot is too large for the server. Please choose a smaller image and try again.';
    if (status === 502 || status === 503 || status === 504) return 'The registration server is temporarily busy. Your payment was not submitted; please wait a moment and try again.';
    return '';
  }

  function patchFetch() {
    try {
      if (!window.fetch || window.fetch[PATCH_FLAG]) return;
      var nativeFetch = window.fetch.bind(window);
      var wrapped = async function (input, init) {
        if (!isRegisterUrl(input)) return nativeFetch(input, init);
        var options = init ? Object.assign({}, init) : {};
        try {
          if (options.body && isFormData(options.body)) {
            var body = await compressedBody(options.body);
            // A File that could not be decoded is still allowed to go through;
            // reject only an obviously impossible Vercel request locally.
            var shot = body && typeof body.get === 'function' ? body.get('screenshot') : null;
            if (shot && Number(shot.size || 0) > HARD_REQUEST_BYTES) {
              return jsonResponse('This screenshot is still too large after compression. Please use a smaller image or crop it, then try again.', 413);
            }
            options.body = body;
          }
          var response = await nativeFetch(input, options);
          var message = friendlyStatus(response);
          return message ? jsonResponse(message, response.status) : response;
        } catch (e) {
          return jsonResponse('Could not reach the registration server. Check your connection and try again; your payment was not submitted.', 503);
        }
      };
      wrapped[PATCH_FLAG] = true;
      window.fetch = wrapped;
    } catch (e) { /* never break the payment page */ }
  }

  function updateLabel() {
    try {
      var labels = document.querySelectorAll('.payment-page label');
      for (var i = 0; i < labels.length; i += 1) {
        if (labels[i].getAttribute(LABEL_FLAG) === '1') continue;
        if (/payment screenshot/i.test(labels[i].textContent || '')) {
          labels[i].setAttribute(LABEL_FLAG, '1');
          var nodes = labels[i].childNodes;
          for (var n = 0; n < nodes.length; n += 1) {
            if (nodes[n].nodeType === 3 && /max 5 mb/i.test(nodes[n].nodeValue || '')) {
              nodes[n].nodeValue = 'Payment screenshot (JPG, PNG, or WEBP; compressed securely before upload)';
            }
          }
        }
      }
    } catch (e) { /* ignore DOM differences */ }
  }

  function start() {
    patchFetch();
    updateLabel();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  try {
    var root = document.body || document.documentElement;
    if (window.MutationObserver && root && root.getAttribute('data-phantasm-payment-watch') !== '1') {
      root.setAttribute('data-phantasm-payment-watch', '1');
      var scheduled = false;
      new window.MutationObserver(function () {
        if (scheduled) return;
        scheduled = true;
        window.setTimeout(function () { scheduled = false; start(); }, 100);
      }).observe(root, { childList: true, subtree: true });
    }
  } catch (e) { /* patch remains active for the current mount */ }
})();
