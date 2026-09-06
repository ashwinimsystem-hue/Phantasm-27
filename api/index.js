'use strict';
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const store = require('./store');
const app = express();

const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || process.env.EMAIL_USER || 'vaagai2k26@gmail.com').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ChangeMe-Vaagai-26';
const SECRET = process.env.ADMIN_SECRET || 'change-this-secret';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4.3 * 1024 * 1024 },
  fileFilter: (_r, f, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(f.mimetype)),
});

const emailOk = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safe = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((e) => {
  console.error('[api]', req.method, req.originalUrl, e);
  if (!res.headersSent) res.status(500).json({ success: false, message: 'Internal server error.' });
});

const EVENT_GUIDES = [
  { names: ['water rocketry', 'water rocket', 'water rocketory'], file: 'VAAGAI26_WATER_ROCKETRY.pdf' },
  { names: ['paper presentation', 'paper presentations'], file: 'VAAGAI26_PAPER_PRESENTATION.pdf' },
  { names: ['line follower', 'line follower robot'], file: 'VAAGAI26_LINE_FOLLOWER.pdf' },
  { names: ['technical quiz'], file: 'VAAGAI26_TECHNICAL_QUIZ.pdf' },
  { names: ['glider competition'], file: 'VAAGAI26_GLIDER_COMPETITION.pdf' },
  { names: ['ansys simulation challenge', 'ansys simulation'], file: 'VAAGAI26_ANSYS_SIMULATION.pdf' },
  { names: ['cad modelling', 'cad modeling'], file: 'VAAGAI26_CAD_MODELLING.pdf' },
  {
    names: ['free fire', 'freefire', 'carrom', 'chess', 'ipl auction', 'college ipl auction', 'treasure hunt', 'treasure-hunt', 'mehendi', 'mehandi', 'mehndi'],
    file: 'VAAGAI26_NON_TECHNICAL.pdf',
  },
];

const normalizeEventText = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function eventNameMatches(eventText, alias) {
  const text = normalizeEventText(eventText);
  const target = normalizeEventText(alias);
  if (!text || !target) return false;
  return text === target || text.includes(` ${target} `) || text.startsWith(`${target} `) || text.endsWith(` ${target}`);
}

function getEventGuideAttachments(events) {
  const eventText = Array.isArray(events)
    ? events.map((event) => typeof event === 'string' ? event : event?.title || event?.eventName || event?.eventId || '').join(', ')
    : String(events || '');
  const seen = new Set();

  return EVENT_GUIDES
    .filter((guide) => guide.names.some((name) => eventNameMatches(eventText, name)))
    .filter((guide) => {
      if (seen.has(guide.file)) return false;
      seen.add(guide.file);
      return true;
    })
    .map((guide) => ({ guide, file: resolveGuideFile(guide.file) }))
    .filter((entry) => Boolean(entry.file))
    .reduce((acc, entry) => {
      // keep the total message under the 25 MB Gmail ceiling (base64 costs ~4/3)
      const bytes = safeSize(entry.file);
      if (totalBytes(acc) + bytes > MAX_GUIDE_BYTES) {
        console.warn('[guides] skipped (size cap)', entry.guide.file, bytes);
        return acc;
      }
      acc.push({ filename: entry.guide.file, path: entry.file, contentType: 'application/pdf' });
      return acc;
    }, []);
}

const MAX_GUIDE_BYTES = 14 * 1024 * 1024;

function safeSize(file) { try { return fs.statSync(file).size; } catch { return 0; } }
function totalBytes(list) { return list.reduce((n, a) => n + safeSize(a.path), 0); }

/* PDFs live at the project root; on Vercel they are copied into the function
   bundle by vercel.json -> functions.includeFiles. cwd is not guaranteed to be
   the project root (it is locally only when you start from there), so probe. */
function resolveGuideFile(file) {
  for (const dir of [process.cwd(), path.join(__dirname, '..'), __dirname]) {
    const candidate = path.join(dir, file);
    try { if (fs.statSync(candidate).size > 0) return candidate; } catch {}
  }
  console.warn('[guides] not found in bundle:', file);
  return null;
}

async function mail(to, subject, text, html, attachments = []) {
  const user = String(process.env.EMAIL_USER || '').trim();
  const pass = String(process.env.EMAIL_PASS || '').trim();
  if (!user || !pass || !to) return false;
  try {
    const nodemailer = require('nodemailer');
    const port = Number(process.env.EMAIL_PORT || 465);
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    try {
      await transporter.sendMail({ from: `Vaagai'26 <${user}>`, to, subject, text, html, attachments });
      return true;
    } catch (sendError) {
      // An unreadable/oversized attachment must never cost the participant their
      // confirmation — retry once without attachments.
      if (!attachments || !attachments.length) throw sendError;
      console.error('[mail] with attachments failed, retrying without:', sendError.message);
      await transporter.sendMail({ from: `Vaagai'26 <${user}>`, to, subject, text, html });
      return true;
    }
  } catch (e) {
    console.error('[mail]', e.message);
    return false;
  }
}

function makeToken(payload) {
  const data = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 8 * 3600000 })).toString('base64url');
  return `${data}.${crypto.createHmac('sha256', SECRET).update(data).digest('base64url')}`;
}
function checkToken(token) {
  try {
    const [data, signature] = String(token || '').split('.');
    if (!data || !signature) return null;
    const expected = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
    const a = Buffer.from(signature), b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    return payload.exp > Date.now() ? payload : null;
  } catch { return null; }
}

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  next();
});
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));
app.use('/api', (req, res, next) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  store.hit(`rl:${ip}`, 900).then((n) => n > 100
    ? res.status(429).json({ success: false, message: 'Too many requests. Please try again later.' })
    : next()).catch(next);
});
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', safe(async (_req, res) => res.json({
  success: true,
  status: 'ok',
  api: 'online',
  storage: store.backend || 'unknown',
  redisConfigured: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
  emailConfigured: Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS),
})));

app.post('/api/check-email', safe(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!emailOk(email)) return res.status(400).json({ success: false, message: 'Invalid email address.' });
  const rows = await store.listRegs();
  if (rows.some((r) => String(r.email || '').trim().toLowerCase() === email)) return res.status(409).json({ success: false, message: 'This email is already registered.' });
  res.json({ success: true });
}));

app.post('/api/contact', safe(async (req, res) => {
  const { name, email, message } = req.body || {};
  const cleanName = String(name || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanMessage = String(message || '').trim();
  if (!cleanName || !emailOk(cleanEmail) || !cleanMessage) return res.status(400).json({ success: false, message: 'Invalid contact data.' });
  await store.pushMessage({ name: cleanName, email: cleanEmail, message: cleanMessage, created_at: new Date().toISOString() });
  const sent = await mail(process.env.CONTACT_TO || 'vaagai2k26@gmail.com', `Vaagai'26 Contact — ${cleanName}`, cleanMessage, `<p><b>From:</b> ${esc(cleanName)} &lt;${esc(cleanEmail)}&gt;</p><p>${esc(cleanMessage)}</p>`);
  res.status(sent ? 200 : 503).json({ success: sent, message: sent ? 'Message sent.' : 'Message saved, but email delivery is unavailable.' });
}));

app.post('/api/join-team', safe(async (req, res) => {
  const { teamId, teamName, name } = req.body || {};
  const t = await store.getTeam(String(teamId || '').trim());
  if (!t) return res.status(404).json({ success: false, message: "Team ID doesn't exist." });
  if (String(t.team_name).toLowerCase() !== String(teamName || '').trim().toLowerCase()) return res.status(400).json({ success: false, message: 'Team name does not match this Team ID.' });
  const memberName = String(name || '').trim();
  if (!memberName) return res.status(400).json({ success: false, message: 'Member name is required.' });
  t.members = Array.isArray(t.members) ? t.members : [];
  if (t.members.some((m) => String(m.name || '').trim().toLowerCase() === memberName.toLowerCase())) return res.status(409).json({ success: false, message: 'This member has already joined the team.' });
  t.members.push({ name: memberName, joined_at: new Date().toISOString() });
  await store.saveTeam(t);
  res.json({ success: true, teamId: t.team_id, members: t.members.length });
}));

// Admin authentication
app.post('/api/admin/login', safe(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
  res.json({ success: true, token: makeToken({ role: 'admin', email: ADMIN_EMAIL }), admin: { email: ADMIN_EMAIL } });
}));

app.use('/api/admin', (req, res, next) => {
  if (req.path === '/login') return next();
  const header = req.headers.authorization || '';
  const payload = checkToken(header.startsWith('Bearer ') ? header.slice(7) : '');
  if (!payload || payload.role !== 'admin') return res.status(401).json({ success: false, message: 'Admin login required.' });
  req.admin = payload;
  next();
});

app.get('/api/admin/registrations', safe(async (req, res) => {
  let rows = await store.listRegs();
  const q = String(req.query.search || '').trim().toLowerCase();
  if (q) rows = rows.filter((r) => [r.id, r.name, r.email, r.phone, r.college, r.dept, r.event, r.utr].some((v) => String(v || '').toLowerCase().includes(q)));
  if (req.query.teamId) rows = rows.filter((r) => String(r.team_id || '').toLowerCase() === String(req.query.teamId).trim().toLowerCase());
  if (req.query.event) rows = rows.filter((r) => String(r.event || '').toLowerCase().includes(String(req.query.event).toLowerCase()));
  if (req.query.college) rows = rows.filter((r) => String(r.college || '').toLowerCase().includes(String(req.query.college).toLowerCase()));
  if (req.query.utr) rows = rows.filter((r) => String(r.utr || '').toLowerCase().includes(String(req.query.utr).toLowerCase()));
  rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  res.json({ success: true, registrations: rows, totalRegistrations: rows.length });
}));

app.get('/api/admin/event-count', safe(async (_req, res) => {
  const rows = await store.listRegs();
  const counts = {};
  for (const r of rows) for (const e of String(r.event || '').split(',').map((x) => x.trim()).filter(Boolean)) counts[e] = (counts[e] || 0) + 1;
  res.json({ success: true, eventCounts: counts });
}));

app.get('/api/admin/phone-numbers', safe(async (_req, res) => {
  const rows = await store.listRegs();
  res.json({ success: true, participants: rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone, college: r.college, event: r.event })) });
}));

app.get('/api/admin/teams', safe(async (req, res) => {
  let teams = await store.listTeams();
  const q = String(req.query.search || '').trim().toLowerCase();
  if (q) teams = teams.filter((t) => [t.team_id, t.team_name, t.leader].some((v) => String(v || '').toLowerCase().includes(q)) || (t.members || []).some((m) => String(m.name || '').toLowerCase().includes(q)));
  if (req.query.event) teams = teams.filter((t) => String(t.event || '').toLowerCase().includes(String(req.query.event).toLowerCase()));
  res.json({ success: true, teams });
}));

app.get('/api/admin/screenshot/:id', safe(async (req, res) => {
  const shot = await store.getShot(req.params.id);
  if (!shot) return res.status(404).json({ success: false, message: 'No screenshot stored for this registration.' });
  res.set('Content-Type', shot.mime);
  res.send(Buffer.from(shot.b64, 'base64'));
}));

app.put('/api/admin/payment/verify/:id', safe(async (req, res) => {
  const r = await store.getReg(req.params.id);
  if (!r) return res.status(404).json({ success: false, message: 'Registration not found.' });
  if (r.payment_status === 'VERIFIED') return res.json({ success: true, verified: true, mailSent: Boolean(r.confirmation_mail_sent), message: 'Payment already verified.' });
  r.payment_status = 'VERIFIED';
  r.verified_at = new Date().toISOString();
  r.verified_by = req.admin.email;
  await store.saveReg(r);
  const attachments = getEventGuideAttachments(r.event);
  const guideNoteText = attachments.length
    ? `\n\nEvent guide(s) for your registered events are attached to this email:${attachments.map((a) => ` ${a.filename}`).join(',')}`
    : '';
  const guideNoteHtml = attachments.length
    ? `<p>The event guide(s) for your registered events are attached to this email:<br>${attachments.map((a) => esc(a.filename)).join('<br>')}</p>`
    : '';
  const sent = await mail(r.email, `Vaagai'26 Registration Confirmed — ${r.id}`, `Hi ${r.name},\n\nYour registration ${r.id} has been verified and approved.\nEvents: ${r.event}\nAmount: ₹${r.amount}${r.team_id ? `\nTeam ID: ${r.team_id}` : ''}${guideNoteText}`, `<h2>Registration Confirmed ✓</h2><p>Hi ${esc(r.name)},</p><p>Your registration <b>${esc(r.id)}</b> has been <b>verified and approved</b>.</p><p><b>Events:</b> ${esc(r.event)}</p><p><b>Amount:</b> ₹${r.amount}</p>${r.team_id ? `<p><b>Team ID:</b> ${esc(r.team_id)}</p>` : ''}${guideNoteHtml}`, attachments);
  r.confirmation_mail_sent = sent;
  r.confirmation_mail_sent_at = sent ? new Date().toISOString() : null;
  await store.saveReg(r);
  res.json({ success: true, verified: true, mailSent: sent, message: sent ? 'Payment verified and confirmation email sent.' : 'Payment verified; confirmation email could not be sent.' });
}));

app.put('/api/admin/payment/undo/:id', safe(async (req, res) => {
  const r = await store.getReg(req.params.id);
  if (!r) return res.status(404).json({ success: false, message: 'Registration not found.' });
  r.payment_status = 'PENDING_VERIFICATION';
  r.verified_at = null;
  r.verified_by = null;
  r.confirmation_mail_sent = false;
  await store.saveReg(r);
  res.json({ success: true, message: 'Payment verification undone.' });
}));

app.put('/api/admin/attendance/verify/:id', safe(async (req, res) => {
  const r = await store.getReg(req.params.id);
  if (!r) return res.status(404).json({ success: false, message: 'Registration not found.' });
  r.attendance_status = 'VERIFIED';
  await store.saveReg(r);
  res.json({ success: true, message: 'Attendance verified.' });
}));

app.put('/api/admin/attendance/undo/:id', safe(async (req, res) => {
  const r = await store.getReg(req.params.id);
  if (!r) return res.status(404).json({ success: false, message: 'Registration not found.' });
  r.attendance_status = 'PENDING';
  await store.saveReg(r);
  res.json({ success: true, message: 'Attendance undone.' });
}));

app.put('/api/admin/add-event/:id', safe(async (req, res) => {
  const r = await store.getReg(req.params.id);
  if (!r) return res.status(404).json({ success: false, message: 'Registration not found.' });
  const ids = req.body?.eventIds;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ success: false, message: 'Select at least one event to add.' });
  const titles = ids.map((e) => String(e?.title || '').trim()).filter(Boolean);
  if (!titles.length) return res.status(400).json({ success: false, message: 'Selected events are invalid.' });
  const current = String(r.event || '').split(',').map((x) => x.trim()).filter(Boolean);
  for (const title of titles) if (!current.includes(title)) current.push(title);
  r.event = current.join(', ');
  await store.saveReg(r);
  res.json({ success: true, message: 'Events added successfully.', event: r.event });
}));

app.delete('/api/admin/registration/:id', safe(async (req, res) => {
  const ok = await store.delReg(req.params.id);
  if (!ok) return res.status(404).json({ success: false, message: 'Registration not found.' });
  res.json({ success: true, message: 'Registration deleted.' });
}));

app.delete('/api/admin/team/:id', safe(async (req, res) => {
  const ok = await store.delTeam(req.params.id);
  if (!ok) return res.status(404).json({ success: false, message: 'Team not found.' });
  res.json({ success: true, message: 'Team deleted.' });
}));

app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'API endpoint not found.' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.use((err, req, res, next) => {
  console.error('[api error]', err);
  if (res.headersSent) return next(err);
  if (err.name === 'MulterError') return res.status(400).json({ success: false, message: err.code === 'LIMIT_FILE_SIZE' ? 'Payment screenshot is too large.' : 'Invalid payment screenshot.' });
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

if (!process.env.VERCEL) app.listen(process.env.PORT || 3000, () => console.log('API running'));
module.exports = app;
