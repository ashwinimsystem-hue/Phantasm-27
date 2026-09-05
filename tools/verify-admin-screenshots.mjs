/**
 * PHANTASM'27 — admin payment-screenshot viewer test (jsdom)
 * Mounts /admin/panel with a valid admin token and a mocked API, then asserts:
 *   · every registrations row renders the "🧾 Screenshot" button
 *   · clicking it opens the lightbox with the registration meta (ID / UTR / amount)
 *   · the image loads from GET /api/admin/screenshot/:id (Bearer-authed)
 *   · a row without a stored screenshot shows the clear "no screenshot" message
 *   · "Verify Payment" inside the lightbox drives the panel's OWN verify button
 *     (React state stays the source of truth) and the row flips to Verified
 *   · Escape closes the lightbox
 * Run: node tools/verify-admin-screenshots.mjs
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'public/index.html'), 'utf8');
const bundleSrc = (html.match(/<script[^>]*src="(\/assets\/index-[^"]+\.js)"/) || [])[1];
const viewerSrc = (html.match(/<script[^>]*src="(\/assets\/phantasm-admin-screenshot-viewer[^"]+\.js)"/) || [])[1];
if (!bundleSrc || !viewerSrc) {
  console.error('✗ index.html must reference both the app bundle and the screenshot-viewer script');
  process.exit(1);
}
const bundle = readFileSync(join(root, 'public', bundleSrc), 'utf8');
const viewer = readFileSync(join(root, 'public', viewerSrc), 'utf8');

const SHOT_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]); // PNG-ish
const REGS = [
  { id: 'REG-0001', name: 'Arjun Kumar', college: 'GCE Bargur', team_id: '', event: 'Paper Presentation', amount: 200, utr: 'UTR-TEST-1111', payment_status: 'PENDING_VERIFICATION', attendance_status: 'PENDING', has_screenshot: true, screenshot_stored: true, created_at: '2026-09-01T10:00:00Z' },
  { id: 'REG-0002', name: 'Priya S', college: 'GCE Bargur', team_id: '', event: 'Robo Race', amount: 150, utr: 'UTR-TEST-2222', payment_status: 'PENDING_VERIFICATION', attendance_status: 'PENDING', has_screenshot: true, screenshot_stored: false, created_at: '2026-09-01T09:00:00Z' },
];

const calls = [];
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + (e.detail?.message || e.message)));
vc.on('error', (m) => errors.push('console.error: ' + String(m).slice(0, 200)));

const dom = new JSDOM(`<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>`, {
  url: 'http://localhost/admin/panel', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
});
const { window } = dom;
const { document } = window;

window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
window.matchMedia = () => ({ matches: false, media: '', addEventListener() {}, removeEventListener() {} });
window.Element.prototype.scrollIntoView = () => {};
window.scrollTo = () => {};
window.URL.createObjectURL = () => 'blob:mock-object-url';
window.URL.revokeObjectURL = () => {};
window.alert = (m) => errors.push('alert(): ' + m);

window.sessionStorage.setItem('vaagai_admin_token', 'test-admin-token');

window.fetch = async (url, opts = {}) => {
  const u = String(url);
  calls.push({ url: u, method: opts.method || 'GET' });
  const json = (body) => ({ ok: true, status: 200, headers: new window.Headers({ 'Content-Type': 'application/json' }), json: async () => body, text: async () => JSON.stringify(body), blob: async () => new window.Blob([SHOT_BYTES], { type: 'image/png' }) });
  if (u.includes('/api/admin/registrations')) return json({ success: true, registrations: REGS, totalRegistrations: REGS.length });
  if (u.includes('/api/admin/event-count')) return json({ success: true, eventCounts: {} });
  if (u.includes('/api/admin/phone-numbers')) return json({ success: true, participants: [] });
  if (u.includes('/api/admin/teams')) return json({ success: true, teams: [] });
  if (u.includes('/api/admin/screenshot/REG-0001')) {
    if (!(opts.headers?.Authorization || '').includes('test-admin-token')) return { ok: false, status: 401, json: async () => ({ success: false, message: 'Admin login required.' }) };
    return json({});
  }
  if (u.includes('/api/admin/screenshot/REG-0002')) return { ok: false, status: 404, json: async () => ({ success: false, message: 'No screenshot stored for this registration.' }) };
  if (u.includes('/api/admin/payment/verify/') || u.includes('/api/admin/payment/undo/')) return json({ success: true, verified: true, mailSent: false, message: 'Payment verified and confirmation email sent.' });
  return json({});
};

const tag = document.createElement('script');
tag.textContent = bundle;
document.body.appendChild(tag);
const viewerTag = document.createElement('script');
viewerTag.textContent = viewer;
document.body.appendChild(viewerTag);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = () => document.getElementById('root').textContent.replace(/\s+/g, ' ');
let failures = 0;
const check = (ok, label) => {
  console.log((ok ? '✓' : '✗ FAIL') + '  ' + label);
  if (!ok) failures++;
};

await sleep(600);

const shotButtons = [...document.querySelectorAll('.admin-wrapper .shot-btn')];
check(shotButtons.length === REGS.length, `every registration row has a "🧾 Screenshot" button (${shotButtons.length}/${REGS.length})`);

// --- open the viewer for REG-0001 (screenshot stored) ---
shotButtons[0].click();
await sleep(120);
const backdrop = document.getElementById('pss-backdrop');
check(!!backdrop && backdrop.classList.contains('open'), 'lightbox opens');
check(/REG-0001/.test(backdrop?.textContent || '') && /UTR-TEST-1111/.test(backdrop?.textContent || ''), 'lightbox shows registration ID + UTR');
check(/₹200/.test(backdrop?.textContent || ''), 'lightbox shows the amount');
await sleep(250);
check(!!backdrop?.querySelector('img.pss-img'), 'screenshot image rendered from the API blob');
const imgCalls = calls.filter((c) => c.url.includes('/api/admin/screenshot/REG-0001'));
check(imgCalls.length === 1 && imgCalls[0].url.includes('/api/admin/'), 'image fetched via GET /api/admin/screenshot/REG-0001');

// --- Verify Payment inside the lightbox must drive the panel's own button ---
const panelVerify = document.querySelector('.admin-wrapper .admin-row .payverify-btn');
check(!!panelVerify, 'panel row exposes its own Verify Payment button while pending');
document.querySelector('#pss-backdrop [data-pss-act="verify"]').click();
await sleep(300);
check(calls.some((c) => c.method === 'PUT' && c.url.includes('/api/admin/payment/verify/REG-0001')), 'panel PUT /api/admin/payment/verify/REG-0001 fired');
const row1 = shotButtons[0].closest('.admin-row');
check(/Verified/.test(row1.textContent), 'row now shows Verified');
check(!row1.querySelector('.payverify-btn'), 'Verify Payment button removed from the verified row');
check(!!document.querySelector('.admin-wrapper .admin-row .payverify-btn'), 'still-pending rows keep their Verify Payment button');

// --- Escape closes ---
document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await sleep(80);
check(!document.getElementById('pss-backdrop')?.classList.contains('open'), 'Escape closes the lightbox');

// --- REG-0002: uploaded but not stored -> clear explanation, no crash ---
await sleep(100);
const buttons2 = [...document.querySelectorAll('.admin-wrapper .shot-btn')];
buttons2[1].click();
await sleep(250);
const msg = document.getElementById('pss-backdrop')?.querySelector('.pss-msg')?.textContent || '';
check(/did upload/i.test(msg) && /750/.test(msg), 'missing-screenshot case explains the storage cap instead of failing silently');

const fatal = errors.filter((n) => !/Could not load|Not implemented|not implemented/i.test(n));
check(fatal.length === 0, 'no runtime errors' + (fatal.length ? ' — ' + fatal.join(' | ') : ''));

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
