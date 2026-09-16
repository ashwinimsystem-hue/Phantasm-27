/**
 * Regression checks for the payment-upload/mail recovery hardening.
 * Run: node tools/verify-payment-hardening.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const db = join(root, 'data', 'db.json');
const backup = existsSync(db) ? readFileSync(db) : null;
if (existsSync(db)) unlinkSync(db);
const port = 3458;
const base = `http://127.0.0.1:${port}`;
const admin = { email: 'hardening-admin@local.test', password: 'Hardening-Local-9x!' };
const server = spawn('node', ['api/index.js'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    ADMIN_EMAIL: admin.email,
    ADMIN_PASSWORD: admin.password,
    ADMIN_SECRET: 'hardening-local-secret',
    EMAIL_USER: '',
    EMAIL_PASS: '',
    UPSTASH_REDIS_REST_URL: '',
    UPSTASH_REDIS_REST_TOKEN: '',
  },
  stdio: ['ignore', 'ignore', 'ignore'],
});

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` -> ${detail}` : ''}`);
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function ready() {
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) return true; } catch { /* booting */ }
    await wait(100);
  }
  return false;
}
async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  return { status: response.status, json: await response.json().catch(() => null) };
}
async function json(method, path, body, headers = {}) {
  return request(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

try {
  check('server boots', await ready());
  const login = await json('POST', '/api/admin/login', admin);
  const auth = { Authorization: `Bearer ${login.json?.token || ''}` };
  check('admin token issued', login.status === 200 && !!login.json?.token);

  const pre = await json('POST', '/api/pre-register', {
    name: 'Recovery User', email: 'recovery@local.test', phone: '9000000011',
    college: 'GCE Bargur', dept: 'Mechanical', event: 'Chess',
    selectedEvents: ['Chess'], eventsDetail: [{ title: 'Chess', mode: 'SOLO' }],
  });
  const id = pre.json?.registrationId;
  check('creates awaiting-payment row', pre.status === 201 && pre.json?.paymentStatus === 'AWAITING_PAYMENT');

  const recovered = await json('PUT', `/api/admin/payment/mark-received/${id}`, undefined, auth);
  check('mark-received transitions to pending', recovered.status === 200 && recovered.json?.success === true && recovered.json?.paymentStatus === 'PENDING_VERIFICATION', JSON.stringify(recovered.json));
  check('mail failure remains explicit', recovered.json?.mailSent === false && typeof recovered.json?.mailError === 'string');

  const second = await json('PUT', `/api/admin/payment/mark-received/${id}`, undefined, auth);
  check('mark-received is one-way', second.status === 409 && second.json?.paymentStatus === 'PENDING_VERIFICATION');

  const rows = await request('/api/admin/registrations', { headers: auth });
  const row = (rows.json?.registrations || []).find((item) => item.id === id);
  check('operator audit fields saved', row?.payment_marked_received_by === admin.email && !!row?.payment_marked_received_at);

  const probes = [];
  for (let i = 0; i < 6; i += 1) probes.push(await request('/api/admin/mail/probe', { headers: auth }));
  check('mail probe sends only configured failure', probes.slice(0, 5).every((r) => r.status === 503 && r.json?.mailSent === false));
  check('mail probe capped at five per hour', probes[5].status === 429, String(probes[5].status));
} finally {
  server.kill('SIGTERM');
  await wait(250);
  try {
    if (backup) writeFileSync(db, backup);
    else if (existsSync(db)) unlinkSync(db);
  } catch { /* best effort cleanup */ }
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll hardening checks passed.');
process.exit(failures ? 1 : 0);
