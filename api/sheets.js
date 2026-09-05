'use strict';

/* PHANTASM'27 — Google Sheets sync (service account, zero npm deps)
   ==================================================================
   Keeps a Google Sheet mirror of every registration so the admin
   never needs to export the Excel file again.

     · new registration            → a row is appended automatically
     · payment verify / undo       → the row's Payment Status updates
     · attendance verify / undo    → the row's Attendance updates
     · + Add Event / re-register   → events + amount update in place
     · registration deleted        → the row is removed
     · POST /api/admin/sheets/sync → one-click full upsert from the
                                     admin panel ("⟳ Sync Sheets"),
                                     including registrations that were
                                     created before this was enabled

   Setup (one time, see README "Google Sheets sync"):
     1. Create a Google Cloud service account with the Sheets API
        enabled and download its JSON key.
     2. Share the spreadsheet with the service-account e-mail as Editor.
     3. Set env vars: GOOGLE_SHEETS_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL,
        GOOGLE_PRIVATE_KEY.  Optional: GOOGLE_SHEETS_TAB (default
        "Registrations" — created automatically; the rest of the
        spreadsheet is never touched).

   Writes only when the env vars are present — the site runs exactly
   as before when they are missing.  GOOGLE_OAUTH_URL and
   GOOGLE_SHEETS_API_BASE exist so tests can point the module at a
   mock server; production defaults are the real Google endpoints.
   ================================================================== */

const crypto = require('crypto');

const SHEETS_ID = String(process.env.GOOGLE_SHEETS_ID || '').trim();
const SA_EMAIL = String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
const RAW_KEY = String(process.env.GOOGLE_PRIVATE_KEY || '').trim()
  .replace(/^"|"$/g, '')
  .replace(/\\n/g, '\n');
const TAB = (String(process.env.GOOGLE_SHEETS_TAB || '').trim() || 'Registrations');
const OAUTH_URL = String(process.env.GOOGLE_OAUTH_URL || '').trim() || 'https://oauth2.googleapis.com/token';
const API_BASE = (String(process.env.GOOGLE_SHEETS_API_BASE || '').trim() || 'https://sheets.googleapis.com/v4/spreadsheets').replace(/\/$/, '');

const enabled = Boolean(SHEETS_ID && SA_EMAIL && RAW_KEY && RAW_KEY.includes('PRIVATE KEY'));

const TIMEOUT_MS = 12000;

/* Column layout (A:Q). "Team Name" first matches the Excel export. */
const HEADERS = [
  'Team Name', 'Team ID', 'Registration ID', 'Name', 'Email', 'Phone',
  'College', 'Department', 'Year', 'Events', 'Amount (INR)', 'UTR / Reference',
  'Payment Status', 'Attendance', 'Verified By', 'Verified At', 'Registered At',
];

function rowFor(r) {
  return [
    String(r.teamName || r.team_name || '').trim(),
    String(r.team_id || '').trim(),
    String(r.id || ''),
    String(r.name || ''),
    String(r.email || ''),
    String(r.phone || ''),
    String(r.college || ''),
    String(r.dept || ''),
    String(r.year || ''),
    String(r.event || ''),
    Number(r.amount) || 0,
    String(r.utr || ''),
    String(r.payment_status || ''),
    String(r.attendance_status || ''),
    String(r.verified_by || ''),
    String(r.verified_at || ''),
    String(r.created_at || ''),
  ];
}

const norm = (v) => (v == null ? '' : String(v).trim());
const q = (title) => `'${String(title).replace(/'/g, "''")}'`;
const rangeUrl = (range) => `${API_BASE}/${encodeURIComponent(SHEETS_ID)}/values/${encodeURIComponent(range)}`;

/* ---------------------------------------------------------------- auth */
let cachedToken = null; // { token, exp: epoch-ms }

function privateKey() {
  if (!RAW_KEY.includes('PRIVATE KEY')) throw new Error('GOOGLE_PRIVATE_KEY does not look like a PEM private key.');
  return RAW_KEY;
}

async function accessToken() {
  if (cachedToken && cachedToken.exp > Date.now() + 60000) return cachedToken.token;
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url') +
    '.' +
    Buffer.from(JSON.stringify({
      iss: SA_EMAIL,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: OAUTH_URL,
      exp: now + 3600,
      iat: now,
    })).toString('base64url');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const assertion = `${unsigned}.${signer.sign(privateKey()).toString('base64url')}`;

  const res = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(`Google auth failed (${res.status}): ${json.error_description || json.error || 'no token'}`);
  }
  cachedToken = { token: json.access_token, exp: Date.now() + (Number(json.expires_in) || 3600) * 1000 };
  return cachedToken.token;
}

/* ----------------------------------------------------------------- api */
async function api(path, init = {}, retry = true) {
  if (!enabled) throw new Error('Google Sheets sync is not configured. Set GOOGLE_SHEETS_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in Vercel, then redeploy.');
  const token = await accessToken();
  const res = await fetch(`${API_BASE}/${encodeURIComponent(SHEETS_ID)}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 401 && retry) { cachedToken = null; return api(path, init, false); }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = json.error?.message || `HTTP ${res.status}`;
    throw new Error(`Google Sheets API: ${detail}`);
  }
  return json;
}

const getMeta = () => api('?fields=sheets.properties');
const batchUpdate = (requests) => api(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests }) });
const getRange = (range) => api(`/values/${encodeURIComponent(range)}`).then((j) => j.values || []);
const writeRange = (range, values) => api(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ range, values, majorDimension: 'ROWS' }) });
const appendRows = (values) => api(`/values/${encodeURIComponent(`${q(TAB)}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'POST', body: JSON.stringify({ values, majorDimension: 'ROWS' }) });

let ready = null; // { sheetId } cached per warm instance

async function ensureReady() {
  if (ready) return ready;
  const sameTab = (s) => s.properties?.title === TAB;

  let sheet = (await getMeta()).sheets?.find(sameTab);
  if (!sheet) {
    try {
      await batchUpdate([{ addSheet: { properties: { title: TAB, gridProperties: { frozenRowCount: 1 } } } }]);
    } catch (e) {
      if (!/already exists|different location/i.test(e.message)) throw e;
    }
    sheet = (await getMeta()).sheets?.find(sameTab);
    if (!sheet) throw new Error(`Tab "${TAB}" could not be created in the spreadsheet.`);
  }

  const firstRow = (await getRange(`${q(TAB)}!A1:Z1`))[0] || [];
  if (!firstRow.length) {
    await writeRange(`${q(TAB)}!A1`, [HEADERS]);
  } else {
    const matches = HEADERS.every((h, i) => norm(firstRow[i]).toLowerCase() === h.toLowerCase());
    if (!matches) {
      throw new Error(`Tab "${TAB}" already exists with different headers. Rename it or set GOOGLE_SHEETS_TAB to a fresh tab name, then sync again.`);
    }
  }
  ready = { sheetId: sheet.properties.sheetId };
  return ready;
}

async function findRowById(id) {
  const rows = await getRange(`${q(TAB)}!C:C`); // column C = Registration ID
  const target = String(id).trim();
  for (let i = 0; i < rows.length; i++) {
    if (norm(rows[i]?.[0]) === target) return i + 1; // 1-based sheet row
  }
  return 0;
}

/* ------------------------------------------------------------- public */
module.exports = {
  enabled,
  spreadsheetId: SHEETS_ID,
  tab: TAB,
  HEADERS,

  /* Fire-and-forget helper for hooks: logs failures, never throws. */
  async tryRun(label, fn) {
    if (!enabled) return false;
    try { await fn(); return true; }
    catch (e) { console.error(`[sheets:${label}]`, e.message); return false; }
  },

  async appendRegistration(reg) {
    await ensureReady();
    await appendRows([rowFor(reg)]);
  },

  /* Insert or update the row for this registration (by Registration ID). */
  async upsertRegistration(reg) {
    await ensureReady();
    const rowNum = await findRowById(reg.id);
    if (!rowNum) return appendRows([rowFor(reg)]);
    return writeRange(`${q(TAB)}!A${rowNum}`, [rowFor(reg)]);
  },

  async deleteRegistration(id) {
    const { sheetId } = await ensureReady();
    const rowNum = await findRowById(id);
    if (!rowNum) return false;
    await batchUpdate([{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowNum - 1, endIndex: rowNum } } }]);
    return true;
  },

  /* Full upsert of every registration — appends missing rows, refreshes
     changed ones in one batch. Used by POST /api/admin/sheets/sync. */
  async syncAll(regs) {
    await ensureReady();
    const rows = await getRange(`${q(TAB)}!A:Q`);
    const rowById = new Map();
    rows.forEach((r, i) => {
      const v = norm(r[2]); // column C: Registration ID
      if (v) rowById.set(v, i + 1);
    });

    const appends = [];
    const updates = [];
    const seen = new Set();
    let updated = 0;
    for (const reg of regs || []) {
      const id = String(reg.id || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const expected = rowFor(reg);
      const rowNum = rowById.get(id) || 0;
      if (!rowNum) { appends.push(expected); continue; }
      const current = rows[rowNum - 1] || [];
      const changed = expected.some((v, c) => norm(current[c]) !== norm(v));
      if (changed) { updates.push({ range: `${q(TAB)}!A${rowNum}`, values: [expected] }); updated++; }
    }
    if (updates.length) {
      await api('/values:batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data: updates }) });
    }
    if (appends.length) await appendRows(appends);
    return { total: regs?.length || 0, appended: appends.length, updated };
  },
};
