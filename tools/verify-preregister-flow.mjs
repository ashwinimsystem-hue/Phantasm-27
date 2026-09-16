/**
 * PHANTASM'27 — pre-register + payment-completion + resend verification.
 *
 * Spins up api/index.js on a throwaway port (file-backed store, no mail
 * credentials) and asserts the new flow end to end:
 *
 *   1. legacy full submit via POST /api/register still works (201);
 *   2. admin verify works and reports mail failure explicitly (no creds here);
 *   3. POST /api/pre-register snapshots details as AWAITING_PAYMENT (no mail);
 *   4. admin list shows the pre-registered row BEFORE any payment;
 *   5. POST /api/register with the same email completes the payment
 *      (AWAITING_PAYMENT -> PENDING_VERIFICATION, UTR stored);
 *   6. UTR corrections are accepted without resetting anything;
 *   7. pre-register on a VERIFIED record merges events but NEVER touches
 *      payment/verification state (previously registered participants safe);
 *   8. PUT /api/admin/confirmation/resend/:id responds with explicit mail
 *      status; unknown ids 404;
 *   9. validation + canonical pricing errors still 400.
 *
 * Run: node tools/verify-preregister-flow.mjs
 * The script backs up data/db.json (if any) and restores it afterwards.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB = join(root, 'data', 'db.json');
const PORT = 3457;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = { email: 'verify-admin@local.test', password: 'Verify-Local-9x!' };

const backup = existsSync(DB) ? readFileSync(DB) : null;
if (existsSync(DB)) unlinkSync(DB); // start from a clean slate

const server = spawn('node', ['api/index.js'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(PORT),
    ADMIN_EMAIL: ADMIN.email,
    ADMIN_PASSWORD: ADMIN.password,
    ADMIN_SECRET: 'verify-local-secret-please-ignore',
    EMAIL_USER: '',
    EMAIL_PASS: '',
    UPSTASH_REDIS_REST_URL: '',
    UPSTASH_REDIS_REST_TOKEN: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', () => {}); // mailmisconfig warnings are expected

let failures = 0;
const check = (name, pass, extra = '') => {
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${extra ? `  -> ${extra}` : ''}`);
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForHealth() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await wait(150);
  }
  return false;
}
const postJSON = (path, body, headers = {}) => fetch(`${BASE}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
const putJSON = (path, headers = {}) => fetch(`${BASE}${path}`, { method: 'PUT', headers })
  .then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));

try {
  check('server boots', await waitForHealth());

  // 1. legacy-style full submit (payment page posts everything at once)
  const legacy = await postJSON('/api/register', {
    name: 'Legacy User', email: 'legacy@local.test', phone: '9876543210',
    college: 'GCE Bargur', dept: 'Mechanical', year: '3', gender: 'Male',
    event: 'Paper Presentation', selectedEvents: ['Paper Presentation'],
    eventsDetail: [{ title: 'Paper Presentation', mode: 'SOLO' }],
    utr: 'LEGACYUTR0001',
  });
  check('legacy full submit -> 201 PENDING', legacy.status === 201 && legacy.json?.paymentStatus === 'PENDING_VERIFICATION', JSON.stringify({ status: legacy.status, amount: legacy.json?.amount }));
  check('legacy canonical amount 200', legacy.json?.amount === 200, String(legacy.json?.amount));

  // 2. admin login + verify (mail must fail LOUDLY, not silently)
  const login = await postJSON('/api/admin/login', ADMIN);
  const token = login.json?.token || '';
  check('admin login', login.status === 200 && !!token);
  const auth = { Authorization: `Bearer ${token}` };
  const verified = await putJSON(`/api/admin/payment/verify/${legacy.json.registrationId}`, auth);
  check('verify -> VERIFIED', verified.json?.verified === true && verified.json?.mailSent === false, JSON.stringify(verified.json));
  check('verify reports mailError', typeof verified.json?.mailError === 'string' && verified.json.mailError.length > 5, verified.json?.mailError);

  // 3. pre-register a brand-new participant (form -> payment step snapshot)
  const pre = await postJSON('/api/pre-register', {
    name: 'Pre Reg', email: 'prereg@local.test', phone: '9123456780',
    college: 'GCE Bargur', dept: 'Mechanical', year: '2', gender: 'Female',
    event: 'Technical Quiz', selectedEvents: ['Technical Quiz'],
    eventsDetail: [{ title: 'Technical Quiz', mode: 'SOLO' }],
  });
  check('pre-register -> 201 AWAITING_PAYMENT', pre.status === 201 && pre.json?.paymentStatus === 'AWAITING_PAYMENT', JSON.stringify(pre.json));
  check('pre-register canonical amount 100', pre.json?.amount === 100, String(pre.json?.amount));
  const preId = pre.json?.registrationId;

  // 4. admin sees the details BEFORE any payment
  const list1 = await fetch(`${BASE}/api/admin/registrations`, { headers: auth }).then((r) => r.json());
  const rowA = (list1.registrations || []).find((r) => r.email === 'prereg@local.test');
  check('admin list shows pre-reg row', !!rowA && rowA.payment_status === 'AWAITING_PAYMENT' && rowA.utr === '' && rowA.name === 'Pre Reg', JSON.stringify(rowA && { id: rowA.id, payment_status: rowA.payment_status, utr: rowA.utr }));
  const legacyRow = (list1.registrations || []).find((r) => r.email === 'legacy@local.test');
  check('legacy VERIFIED row untouched', !!legacyRow && legacyRow.payment_status === 'VERIFIED' && !!legacyRow.verified_at && legacyRow.amount === 200, JSON.stringify(legacyRow && { payment_status: legacyRow.payment_status, verified_at: legacyRow.verified_at }));

  // 5. payment completion for the pre-registered email
  const complete = await postJSON('/api/register', {
    name: 'Pre Reg', email: 'prereg@local.test', phone: '9123456780',
    college: 'GCE Bargur', dept: 'Mechanical', year: '2', gender: 'Female',
    event: 'Technical Quiz', selectedEvents: ['Technical Quiz'],
    eventsDetail: [{ title: 'Technical Quiz', mode: 'SOLO' }],
    utr: 'COMPLETEUTR99',
  });
  check('payment completion keeps same id', complete.json?.registrationId === preId && complete.json?.existingRegistration === true, JSON.stringify({ id: complete.json?.registrationId, expected: preId }));
  check('payment completion -> PENDING_VERIFICATION', complete.json?.paymentStatus === 'PENDING_VERIFICATION' && (complete.json?.addedEvents || []).length === 0, JSON.stringify(complete.json));

  // 6. UTR correction without any other change
  const fix = await postJSON('/api/register', {
    name: 'Pre Reg', email: 'prereg@local.test', phone: '9123456780',
    college: 'GCE Bargur', dept: 'Mechanical',
    event: 'Technical Quiz', selectedEvents: ['Technical Quiz'],
    eventsDetail: [{ title: 'Technical Quiz', mode: 'SOLO' }],
    utr: 'CORRECTEDUTR77',
  });
  const list2 = await fetch(`${BASE}/api/admin/registrations`, { headers: auth }).then((r) => r.json());
  const rowA2 = (list2.registrations || []).find((r) => r.email === 'prereg@local.test');
  check('UTR correction stored, still PENDING', rowA2?.utr === 'CORRECTEDUTR77' && rowA2?.payment_status === 'PENDING_VERIFICATION', JSON.stringify({ utr: rowA2?.utr, status: rowA2?.payment_status, msg: fix.json?.message }));

  // 7a. pre-register with a TEAM event prices the team slab + mints a team id
  const team = await postJSON('/api/pre-register', {
    name: 'Team Lead', email: 'team@local.test', phone: '9000000001',
    college: 'GCE Bargur', dept: 'Mechanical', teamName: 'GearHeads',
    event: 'Paper Presentation', selectedEvents: ['Paper Presentation'],
    eventsDetail: [{ title: 'Paper Presentation', mode: 'TEAM' }],
  });
  check('team pre-register amount 400 + team id', team.json?.amount === 400 && /^VAA-/.test(team.json?.teamId || ''), JSON.stringify({ amount: team.json?.amount, teamId: team.json?.teamId }));

  // 7b. pre-register on a VERIFIED record: merge only, payment state frozen
  const merge = await postJSON('/api/pre-register', {
    name: 'Legacy User', email: 'legacy@local.test', phone: '9876543210',
    college: 'GCE Bargur', dept: 'Mechanical',
    event: 'Chess', selectedEvents: ['Chess'],
    eventsDetail: [{ title: 'Chess', mode: 'SOLO' }],
  });
  const list3 = await fetch(`${BASE}/api/admin/registrations`, { headers: auth }).then((r) => r.json());
  const legacyRow2 = (list3.registrations || []).find((r) => r.email === 'legacy@local.test');
  check('merge keeps VERIFIED + history', legacyRow2?.payment_status === 'VERIFIED' && legacyRow2?.verified_at === legacyRow.verified_at && legacyRow2?.utr === 'LEGACYUTR0001', JSON.stringify({ status: legacyRow2?.payment_status, utr: legacyRow2?.utr }));
  check('merge adds event + reprices (200+50)', merge.json?.existingRegistration === true && legacyRow2?.amount === 250 && String(legacyRow2?.event).includes('Chess'), JSON.stringify({ amount: legacyRow2?.amount, event: legacyRow2?.event }));

  // 7c. multipart payment submit with a real screenshot file
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData();
  form.append('data', JSON.stringify({
    name: 'Shot User', email: 'shot@local.test', phone: '9000000002',
    college: 'GCE Bargur', dept: 'Mechanical',
    event: 'Carrom', selectedEvents: ['Carrom'], eventsDetail: [{ title: 'Carrom', mode: 'SOLO' }],
    utr: 'SHOTUTR00001',
  }));
  form.append('screenshot', new Blob([png], { type: 'image/png' }), 'shot.png');
  const shotRes = await fetch(`${BASE}/api/register`, { method: 'POST', body: form });
  const shotJson = await shotRes.json().catch(() => null);
  const shotView = await fetch(`${BASE}/api/admin/screenshot/${shotJson?.registrationId}`, { headers: auth });
  check('multipart screenshot stored + viewable', shotRes.status === 201 && shotView.status === 200 && (shotView.headers.get('content-type') || '').includes('image/png'), `register=${shotRes.status} view=${shotView.status}`);

  // 8. resend endpoint: explicit mail status, 404 on unknown id
  const resend = await putJSON(`/api/admin/payment/verify/${preId}`, auth); // verify A first so resend sends "confirmation"
  const resendMail = await putJSON(`/api/admin/confirmation/resend/${legacy.json.registrationId}`, auth);
  check('resend verified -> explicit mail status', resendMail.json?.mailSent === false && typeof resendMail.json?.mailError === 'string', JSON.stringify(resendMail.json));
  const resend404 = await putJSON('/api/admin/confirmation/resend/REG-9999', auth);
  check('resend unknown id -> 404', resend404.status === 404, String(resend404.status));

  // 9. validation + pricing guards
  const badEmail = await postJSON('/api/pre-register', {
    name: 'X', email: 'not-an-email', phone: '9000000003', college: 'C', dept: 'D',
    event: 'Chess', selectedEvents: ['Chess'], eventsDetail: [{ title: 'Chess' }],
  });
  check('pre-register bad email -> 400', badEmail.status === 400, String(badEmail.status));
  const unknownEvent = await postJSON('/api/pre-register', {
    name: 'X', email: 'unk@local.test', phone: '9000000003', college: 'C', dept: 'D',
    event: 'Underwater Basket Weaving', selectedEvents: ['Underwater Basket Weaving'],
    eventsDetail: [{ title: 'Underwater Basket Weaving' }],
  });
  check('pre-register unknown event -> 400 pricing', unknownEvent.status === 400 && /Pricing is not configured/.test(unknownEvent.json?.message || ''), unknownEvent.json?.message);
  const checkEmail = await postJSON('/api/check-email', { email: 'prereg@local.test' });
  check('check-email parity (prod shape)', checkEmail.json?.registered === true && checkEmail.json?.registrationId === preId, JSON.stringify(checkEmail.json));
  void resend;
} finally {
  server.kill('SIGTERM');
  await wait(400);
  try {
    if (backup) writeFileSync(DB, backup);
    else if (existsSync(DB)) unlinkSync(DB);
  } catch { /* best effort cleanup */ }
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
