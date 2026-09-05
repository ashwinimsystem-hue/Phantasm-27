/**
 * PHANTASM'27 — Google Sheets sync test
 * Runs api/sheets.js against tools/mock-google-sheets.mjs (a local mock of
 * the Google OAuth + Sheets REST API, including real RS256 JWT
 * verification) and asserts the full lifecycle:
 *   · disabled cleanly when env vars are missing (child process)
 *   · first write creates the "Registrations" tab with the header row
 *   · append / upsert / delete keep rows in step with the database
 *   · syncAll is a correct, idempotent full upsert
 *   · a pre-existing tab with foreign headers is refused, never clobbered
 * Then renders /admin/panel in jsdom and verifies the "⟳ Sync Sheets"
 * button (success + failure paths).
 * Run: node tools/verify-sheets-sync.mjs
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
const check = (ok, label) => {
  console.log((ok ? '✓' : '✗ FAIL') + '  ' + label);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* --------------------------------------------------------------------
   Part 1 — module behaviour against the mock API
   -------------------------------------------------------------------- */

// Real RSA keypair: the mock verifies the JWT signature with the public key,
// so the whole service-account auth path is exercised for real.
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });

const PORT = 4620;

/* Import the mock AFTER setting the pubkey env so the JWT signature
   verification path is genuinely exercised (static imports hoist). */
process.env.MOCK_SHEETS_VERIFY_PUB = pubPem;
const { server, reset } = await import('./mock-google-sheets.mjs');
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${PORT}`;

process.env.GOOGLE_SHEETS_ID = 'TESTSHEET';
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'vaagai-sheets@test-project.iam.gserviceaccount.com';
process.env.GOOGLE_PRIVATE_KEY = privPem.replace(/\n/g, '\\n'); // literal \n like a pasted Vercel value
process.env.GOOGLE_OAUTH_URL = `${BASE}/token`;
process.env.GOOGLE_SHEETS_API_BASE = `${BASE}/v4/spreadsheets`;

const sheets = require(join(root, 'api/sheets.js'));

const reg = (id, over = {}) => ({
  id, teamName: '', team_id: '', name: 'Student ' + id, email: `${id.toLowerCase()}@test.local`,
  phone: '9876543210', college: 'GCE Bargur', dept: 'Mech', year: '3',
  event: 'Paper Presentation', amount: 200, utr: 'UTR-' + id,
  payment_status: 'PENDING_VERIFICATION', attendance_status: 'PENDING',
  verified_by: null, verified_at: null, created_at: '2026-09-01T10:00:00.000Z', ...over,
});
const stateOf = async () => (await fetch(`${BASE}/__state`).then((r) => r.json())).TESTSHEET;

// 1. feature off when env is missing
{
  const out = execFileSync(process.execPath, ['--input-type=commonjs', '-e', `
    const s = require(${JSON.stringify(join(root, 'api/sheets.js'))});
    console.log(JSON.stringify({ enabled: s.enabled }));
  `], { env: { ...process.env, GOOGLE_SHEETS_ID: '', GOOGLE_SERVICE_ACCOUNT_EMAIL: '', GOOGLE_PRIVATE_KEY: '' } }).toString();
  check(JSON.parse(out).enabled === false, 'sync disabled when GOOGLE_* env vars are absent');
}
check(sheets.enabled === true, 'sync enabled when env vars are set');

// 2. first append creates tab + header
await reset();
await sheets.appendRegistration(reg('REG-0001'));
{
  const [tab] = await stateOf();
  check(tab.title === 'Registrations', 'first write auto-creates the "Registrations" tab');
  check(tab.rows.length === 2, 'header + one data row');
  check(tab.rows[0][0] === 'Team Name' && tab.rows[0][2] === 'Registration ID', 'header row written');
  check(tab.rows[1][2] === 'REG-0001' && tab.rows[1][4] === 'REG-0001@test.local'.toLowerCase(), 'data row content (ID, email)');
  check(tab.rows[1][10] === 200, 'amount stored as a number');
}

// 3. second append; upsert updates in place
await sheets.appendRegistration(reg('REG-0002'));
await sheets.upsertRegistration(reg('REG-0001', { payment_status: 'VERIFIED', verified_by: 'admin@test.local', verified_at: '2026-09-02T09:00:00.000Z' }));
{
  const tab = (await stateOf())[0];
  check(tab.rows.length === 3, 'append + upsert keep one row per registration');
  check(tab.rows[1][12] === 'VERIFIED' && tab.rows[1][14] === 'admin@test.local', 'verify updates Payment Status + Verified By in place');
  check(tab.rows[2][2] === 'REG-0002' && tab.rows[2][12] === 'PENDING_VERIFICATION', 'second registration untouched');
}

// 4. upsert of an unknown ID appends (self-heal)
await sheets.upsertRegistration(reg('REG-0009'));
check((await stateOf())[0].rows.length === 4, 'upsert of an unsynced registration appends a row');

// 5. delete removes the exact row
await sheets.deleteRegistration('REG-0002');
{
  const rows = (await stateOf())[0].rows;
  check(rows.length === 3 && !rows.some((r) => r[2] === 'REG-0002'), 'delete removes the registration row');
}

// 6. syncAll — full upsert: appends missing, refreshes changed
{
  const result = await sheets.syncAll([
    reg('REG-0001', { payment_status: 'VERIFIED', verified_by: 'admin@test.local', verified_at: '2026-09-02T09:00:00.000Z' }), // unchanged
    reg('REG-0003', { amount: 400, event: 'Paper Presentation, Robo Race' }), // new
    reg('REG-0009', { utr: 'UTR-CHANGED' }), // changed
  ]);
  check(result.total === 3 && result.appended === 1 && result.updated === 1, `syncAll counts (appended ${result.appended}, updated ${result.updated})`);
  const rows = (await stateOf())[0].rows;
  check(rows.length === 4, 'syncAll leaves one row per registration');
  const r9 = rows.find((r) => r[2] === 'REG-0009');
  check(r9[11] === 'UTR-CHANGED', 'syncAll refreshed the changed row');
}

// 7. syncAll is idempotent
{
  const result = await sheets.syncAll([
    reg('REG-0001', { payment_status: 'VERIFIED', verified_by: 'admin@test.local', verified_at: '2026-09-02T09:00:00.000Z' }),
    reg('REG-0003', { amount: 400, event: 'Paper Presentation, Robo Race' }),
    reg('REG-0009', { utr: 'UTR-CHANGED' }),
  ]);
  check(result.appended === 0 && result.updated === 0, 'syncAll is idempotent (0 changes on re-run)');
}

// 8. refuses to touch a tab with foreign headers (fresh module: no cached tab state)
await reset();
{
  await fetch(`${BASE}/__seed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid: 'TESTSHEET', tab: 'Registrations', rows: [['Timestamp', 'Form answer 1'], ['x', 'y']] }) }).then((r) => r.json());
  delete require.cache[require.resolve(join(root, 'api/sheets.js'))];
  const freshSheets = require(join(root, 'api/sheets.js'));
  let threw = null;
  try { await freshSheets.syncAll([reg('REG-0001')]); } catch (e) { threw = e; }
  check(threw && /different headers/.test(threw.message), 'refuses a tab with foreign headers: ' + (threw?.message || 'no error'));
  const rows = (await stateOf())[0].rows;
  check(rows.length === 2 && rows[0][0] === 'Timestamp', 'foreign tab left untouched');
}

/* --------------------------------------------------------------------
   Part 2 — "⟳ Sync Sheets" button in /admin/panel (jsdom)
   -------------------------------------------------------------------- */
reset();
{
  const html = readFileSync(join(root, 'public/index.html'), 'utf8');
  const bundleSrc = (html.match(/<script[^>]*src="(\/assets\/index-[^"]+\.js)"/) || [])[1];
  const bundle = readFileSync(join(root, 'public', bundleSrc), 'utf8');

  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push('jsdomError: ' + (e.detail?.message || e.message)));
  vc.on('error', (m) => errors.push('console.error: ' + String(m).slice(0, 160)));

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
  window.sessionStorage.setItem('vaagai_admin_token', 'test-admin-token');

  const alerts = [];
  window.alert = (m) => alerts.push(String(m));
  let syncResponse = { success: true, appended: 2, updated: 1, total: 3, message: 'Google Sheets updated — 2 added, 1 refreshed, 3 total rows.' };
  const calls = [];
  window.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET' });
    const json = (body) => ({ ok: true, status: 200, headers: new window.Headers({ 'Content-Type': 'application/json' }), json: async () => body, text: async () => JSON.stringify(body) });
    if (String(url).includes('/api/admin/sheets/sync')) return json(syncResponse);
    if (String(url).includes('/api/admin/registrations')) return json({ success: true, registrations: [], totalRegistrations: 0 });
    return json({ success: true });
  };

  const tag = document.createElement('script');
  tag.textContent = bundle;
  document.body.appendChild(tag);
  await sleep(600);

  const syncBtn = [...document.querySelectorAll('.admin-wrapper button')].find((b) => /Sync Sheets/.test(b.textContent));
  check(!!syncBtn, '"⟳ Sync Sheets" button rendered next to Export Excel');
  syncBtn?.click();
  await sleep(120);
  check(calls.some((c) => c.method === 'POST' && c.url.includes('/api/admin/sheets/sync')), 'button POSTs /api/admin/sheets/sync');
  check(alerts.some((a) => /2 added, 1 refreshed/.test(a)), 'success alert shows the sync counts');

  syncResponse = { success: false, message: 'Google Sheets API: quota exceeded.' };
  const syncBtn2 = [...document.querySelectorAll('.admin-wrapper button')].find((b) => /Sync Sheets/.test(b.textContent));
  syncBtn2?.click();
  await sleep(120);
  check(alerts.some((a) => /Sheets sync failed: Google Sheets API: quota exceeded/.test(a)), 'failure alert surfaces the API error');

  const fatal = errors.filter((n) => !/Could not load|Not implemented|not implemented/i.test(n));
  check(fatal.length === 0, 'no runtime errors' + (fatal.length ? ' — ' + fatal.join(' | ') : ''));
}

server.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
