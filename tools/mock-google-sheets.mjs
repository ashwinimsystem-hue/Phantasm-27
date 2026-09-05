/**
 * PHANTASM'27 — mock Google OAuth2 + Sheets API server (testing only)
 *
 * Implements just enough of the two Google endpoints used by
 * api/sheets.js to run the sync flow end-to-end without real
 * credentials:
 *
 *   POST /token                              → JWT-bearer exchange
 *   GET  /v4/spreadsheets/:id                → spreadsheet metadata
 *   POST /v4/spreadsheets/:id:batchUpdate    → addSheet / deleteDimension
 *   GET  /v4/spreadsheets/:id/values/:range  → values.get
 *   PUT  /v4/spreadsheets/:id/values/:range  → values.update
 *   POST /v4/spreadsheets/:id/values/:range:append
 *   POST /v4/spreadsheets/:id/values:batchUpdate
 *
 * Test helpers:
 *   GET  /__state  → JSON snapshot of every tab + rows
 *   POST /__seed   → {sid, tab, rows} pre-create a tab (e.g. bad header)
 *   POST /__reset  → clear everything
 *
 * If MOCK_SHEETS_VERIFY_PUB (a public PEM) is set, /token verifies the
 * service-account JWT signature against it — exercising the real
 * crypto path in api/sheets.js. Issued bearer tokens are enforced on
 * all /v4/* routes.
 *
 * Run standalone:  MOCK_SHEETS_PORT=4600 node tools/mock-google-sheets.mjs
 */
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.MOCK_SHEETS_PORT || 4600);
const VERIFY_PUB = (process.env.MOCK_SHEETS_VERIFY_PUB || '').replace(/\\n/g, '\n');

const tokens = new Set();
let db = new Map(); // sid → { nextSheetId, tabs: Map<title, {sheetId, rows: any[][]}> }

const reset = () => { db = new Map(); tokens.clear(); };
const getBook = (sid) => {
  if (!db.has(sid)) db.set(sid, { nextSheetId: 100, tabs: new Map() });
  return db.get(sid);
};

const colIndex = (letters) => [...letters].reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
function parseRange(range) {
  const m = String(range).match(/^'?([^'!]+)'?!(?:([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?)?$/);
  if (!m) throw new Error('bad range: ' + range);
  const c1 = m[2] ? colIndex(m[2]) : 0;
  const c2 = m[4] ? colIndex(m[4]) : c1;
  const r1 = m[3] ? Number(m[3]) : 1;
  const r2 = m[5] ? Number(m[5]) : Infinity;
  return { tab: m[1], c1, c2, r1, r2 };
}

function applyGridWrite(tab, values, c1, r1) {
  for (let i = 0; i < values.length; i++) {
    const rowIdx = r1 - 1 + i;
    while (tab.rows.length <= rowIdx) tab.rows.push([]);
    const src = values[i] || [];
    for (let c = 0; c < src.length; c++) {
      const col = c1 + c;
      while (tab.rows[rowIdx].length <= col) tab.rows[rowIdx].push('');
      tab.rows[rowIdx][col] = src[c];
    }
  }
}

function readRange(tab, spec) {
  const out = [];
  const height = Math.min(tab.rows.length, spec.r2 === Infinity ? tab.rows.length : spec.r2);
  const width = spec.c2 - spec.c1 + 1;
  for (let r = spec.r1; r <= height; r++) {
    const row = tab.rows[r - 1] || [];
    const slice = [];
    for (let c = spec.c1; c <= spec.c2; c++) slice.push(row[c] !== undefined ? row[c] : '');
    out.push(slice);
  }
  return { range: String(spec.tab), majorDimension: 'ROWS', values: out };
}

function verifyJwt(assertion) {
  if (!VERIFY_PUB) return true; // no pubkey configured → accept
  try {
    const [h, p, sig] = String(assertion || '').split('.');
    if (!h || !p || !sig) return false;
    const data = `${h}.${p}`;
    const ok = crypto.verify('RSA-SHA256', Buffer.from(data), VERIFY_PUB, Buffer.from(sig, 'base64url'));
    if (!ok) return false;
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    return Number(claims.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  let body = '';
  req.on('data', (c) => { body += c; });
  await new Promise((r) => req.on('end', r));
  let json = {};
  try { json = body ? JSON.parse(body) : {}; } catch { json = {}; }

  try {
    /* ---- OAuth token ---- */
    if (url.pathname === '/token') {
      const params = new URLSearchParams(body);
      if (params.get('grant_type') !== 'urn:ietf:params:oauth:grant-type:jwt-bearer') return send(400, { error: 'unsupported_grant_type' });
      if (!verifyJwt(params.get('assertion'))) return send(401, { error: 'invalid_grant', error_description: 'Invalid JWT signature.' });
      const token = 'mock-token-' + crypto.randomBytes(8).toString('hex');
      tokens.add(token);
      return send(200, { access_token: token, expires_in: 3600, token_type: 'Bearer' });
    }

    /* ---- test helpers ---- */
    if (url.pathname === '/__state') {
      const out = {};
      for (const [sid, book] of db) out[sid] = [...book.tabs.entries()].map(([title, t]) => ({ title, sheetId: t.sheetId, rows: t.rows }));
      return send(200, out);
    }
    if (url.pathname === '/__seed') {
      const book = getBook(json.sid);
      const tab = { sheetId: book.nextSheetId++, rows: (json.rows || []).map((r) => [...r]) };
      book.tabs.set(json.tab, tab);
      return send(200, { ok: true });
    }
    if (url.pathname === '/__reset') { reset(); return send(200, { ok: true }); }

    /* ---- Sheets API ---- */
    if (url.pathname.startsWith('/v4/')) {
      const auth = String(req.headers.authorization || '');
      const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!tokens.has(bearer)) return send(401, { error: { code: 401, message: 'Request had invalid authentication credentials.' } });

      const m = url.pathname.match(/^\/v4\/spreadsheets\/([^/:]+)((?::|\/).*)?$/);
      if (!m) return send(404, { error: { message: 'not found' } });
      const sid = decodeURIComponent(m[1]);
      const rest = m[2] || '';
      const book = getBook(sid);

      if (rest === '' ) {
        return send(200, { spreadsheetId: sid, sheets: [...book.tabs.entries()].map(([title, t]) => ({ properties: { sheetId: t.sheetId, title } })) });
      }

      if (rest === ':batchUpdate') {
        const replies = [];
        for (const request of json.requests || []) {
          if (request.addSheet) {
            const title = request.addSheet.properties.title;
            if (book.tabs.has(title)) return send(400, { error: { code: 400, message: `A sheet with the name "${title}" already exists. Please enter another name.` } });
            const tab = { sheetId: request.addSheet.properties.sheetId ?? book.nextSheetId++, rows: [] };
            book.tabs.set(title, tab);
            replies.push({ addSheet: { properties: { sheetId: tab.sheetId, title } } });
          } else if (request.deleteDimension) {
            const { sheetId, startIndex, endIndex } = request.deleteDimension.range;
            const tab = [...book.tabs.values()].find((t) => t.sheetId === sheetId);
            if (!tab) return send(400, { error: { message: 'no sheet with id ' + sheetId } });
            tab.rows.splice(startIndex, endIndex - startIndex);
            replies.push({});
          }
        }
        return send(200, { replies });
      }

      const vm = rest.match(/^\/values(?::batchUpdate|\/(.*?)(?::append)?)$/);
      if (!vm) return send(404, { error: { message: 'unknown path ' + rest } });

      if (rest === '/values:batchUpdate') {
        let touched = 0;
        for (const item of json.data || []) {
          const spec = parseRange(item.range);
          const tab = book.tabs.get(spec.tab);
          if (!tab) return send(400, { error: { message: `Unable to parse range: ${item.range}` } });
          applyGridWrite(tab, item.values || [], spec.c1, spec.r1);
          touched += (item.values || []).length;
        }
        return send(200, { valueInputOption: json.valueInputOption, totalUpdatedRows: touched });
      }

      const spec = parseRange(decodeURIComponent(vm[1] || ''));
      if (rest.includes(':append')) {
        const tab = book.tabs.get(spec.tab);
        if (!tab) return send(400, { error: { message: `Unable to parse range: (${spec.tab})` } });
        const rows = (json.values || []).map((r) => [...r]);
        tab.rows.push(...rows);
        return send(200, { updates: { updatedRows: rows.length, updatedCells: rows.reduce((a, r) => a + r.length, 0) } });
      }

      if (req.method === 'GET') {
        const tab = book.tabs.get(spec.tab);
        if (!tab) return send(400, { error: { code: 400, message: `Unable to parse range: ${spec.tab}` } });
        return send(200, readRange(tab, spec));
      }
      if (req.method === 'PUT') {
        const tab = book.tabs.get(spec.tab);
        if (!tab) return send(400, { error: { message: `Unable to parse range: ${spec.tab}` } });
        applyGridWrite(tab, json.values || [], spec.c1, spec.r1);
        return send(200, { updatedRows: (json.values || []).length });
      }
      return send(405, { error: { message: 'method not allowed' } });
    }

    return send(404, { error: { message: 'not found' } });
  } catch (e) {
    return send(500, { error: { message: e.message } });
  }
});

if (process.env.MOCK_SHEETS_STANDALONE) {
  server.listen(PORT, '127.0.0.1', () => console.log(`mock-google-sheets on http://127.0.0.1:${PORT}`));
}

export { server, reset };
