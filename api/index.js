'use strict';
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const store = require('./store');
const { calculateCanonicalAmount } = require('./pricing');
const mailer = require('./mailer');
const preRegisterHandler = require('./pre-register');
const checkEmailHandler = require('./check-email');
const registerHandler = require('./register');
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
    names: ['free fire', 'freefire', 'carrom', 'chess', 'ipl auction', 'college ipl auction', 'treasure hunt', 'treasure-hunt', ],
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

/* All mail goes through the shared deliverability-focused transport
   (api/mailer.js). It retries once without attachments, so an unreadable or
   oversized PDF can never cost a participant their confirmation. */
async function mail(to, subject, text, html, attachments = [], kind = 'transactional') {
  const result = await mailer.sendMail(to, { subject, text, html, attachments, kind });
  return result;
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

/* Same handler Vercel serves at /api/check-email, so local `npm start` behaves
   exactly like production (returning-participant info instead of a bare 409). */
app.post('/api/check-email', safe(async (req, res) => checkEmailHandler(req, res)));

/* Participant details are snapshotted here BEFORE the payment page so the
   admin panel sees every interested participant (see api/pre-register.js). */
app.post('/api/pre-register', safe(async (req, res) => preRegisterHandler(req, res)));

/* Local-dev parity: on Vercel /api/register is rewritten to api/register.js,
   but `npm start` only runs this file — mount it here too. Harmless in
   production (the rewrite wins before this route is ever reached). */
app.post('/api/register', (req, res) => registerHandler(req, res));

app.post('/api/contact', safe(async (req, res) => {
  const { name, email, message } = req.body || {};
  const cleanName = String(name || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanMessage = String(message || '').trim();
  if (!cleanName || !emailOk(cleanEmail) || !cleanMessage) return res.status(400).json({ success: false, message: 'Invalid contact data.' });
  await store.pushMessage({ name: cleanName, email: cleanEmail, message: cleanMessage, created_at: new Date().toISOString() });
  const built = mailer.contactMail({ cleanName, cleanEmail, cleanMessage });
  const result = await mail(process.env.CONTACT_TO || 'vaagai2k26@gmail.com', built.subject, built.text, built.html, [], 'contact');
  res.status(result.sent ? 200 : 503).json({ success: result.sent, message: result.sent ? 'Message sent.' : 'Message saved, but email delivery is unavailable.' });
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

app.get('/api/admin/mail/probe', safe(async (req, res) => {
  // This endpoint deliberately sends only to the authenticated organiser and
  // is capped separately from the normal API limiter. It is for Gmail "Show
  // original" diagnosis, not for testing participant addresses.
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const key = `mail-probe:${req.admin.email}:${ip}`;
  const attempts = await store.hit(key, 3600);
  if (attempts > 5) {
    res.set('Retry-After', '3600');
    return res.status(429).json({ success: false, message: 'Mail probe limit reached. Try again later.' });
  }
  const recipient = ADMIN_EMAIL;
  const built = mailer.probeMail({ requestedBy: req.admin.email, recipient });
  const result = await mail(recipient, built.subject, built.text, built.html, [], 'admin-mail-probe');
  return res.status(result.sent ? 200 : 503).json({
    success: result.sent,
    mailSent: result.sent,
    recipient,
    attempt: attempts,
    ...(result.sent ? {} : { mailError: result.error || 'Mail probe could not be sent.' }),
    message: result.sent
      ? `Mail probe sent to ${recipient}. Open it and choose Show original.`
      : 'Mail probe could not be sent. Check the mail configuration.',
  });
}));

/* Recovery for a participant who reached the payment page but never
   completed the multipart submit. This is intentionally one-way: it may move
   AWAITING_PAYMENT to PENDING_VERIFICATION, but it never verifies a payment or
   changes an already-paid record. */
app.put('/api/admin/payment/mark-received/:id', safe(async (req, res) => {
  const r = await store.getReg(req.params.id);
  if (!r) return res.status(404).json({ success: false, message: 'Registration not found.' });
  if (r.payment_status !== 'AWAITING_PAYMENT') {
    return res.status(409).json({
      success: false,
      paymentStatus: r.payment_status,
      message: 'Only an awaiting-payment registration can be marked received.',
    });
  }

  const now = new Date().toISOString();
  const suppliedUtr = String(req.body?.utr || req.body?.transactionId || '').trim();
  if (suppliedUtr) r.utr = suppliedUtr;
  r.payment_status = 'PENDING_VERIFICATION';
  r.payment_received_at = now;
  r.payment_received_by = req.admin.email;
  // Keep explicit names for operators and for older exports that use the
  // "marked" terminology.
  r.payment_marked_received_at = now;
  r.payment_marked_received_by = req.admin.email;
  r.updated_at = now;
  await store.saveReg(r);

  const built = mailer.pendingMail(r);
  const result = await mail(r.email, built.subject, built.text, built.html, [], 'payment-marked-received');
  r.pending_mail_sent = result.sent;
  r.payment_received_mail_sent = result.sent;
  if (result.sent) {
    r.payment_received_mail_sent_at = new Date().toISOString();
    delete r.payment_received_mail_error;
  } else {
    r.payment_received_mail_error = result.error || 'Acknowledgment email could not be sent.';
  }
  await store.saveReg(r);

  return res.status(200).json({
    success: true,
    registrationId: r.id,
    paymentStatus: r.payment_status,
    mailSent: result.sent,
    ...(result.sent ? {} : { mailError: result.error || 'Acknowledgment email could not be sent.' }),
    message: result.sent
      ? 'Payment marked received; registration is pending verification and acknowledgment email sent.'
      : 'Payment marked received; acknowledgment email could not be sent. Use Resend mail to retry.',
  });
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
  const built = mailer.confirmationMail(r, attachments.map((a) => a.filename));
  const result = await mail(r.email, built.subject, built.text, built.html, attachments, 'registration-confirmed');
  r.confirmation_mail_sent = result.sent;
  r.confirmation_mail_sent_at = result.sent ? new Date().toISOString() : null;
  if (!result.sent) r.confirmation_mail_error = result.error || 'Unknown mail error';
  else delete r.confirmation_mail_error;
  await store.saveReg(r);
  res.json({
    success: true,
    verified: true,
    mailSent: result.sent,
    ...(result.sent ? {} : { mailError: result.error || 'Confirmation email could not be sent.' }),
    message: result.sent ? 'Payment verified and confirmation email sent.' : 'Payment verified; confirmation email could not be sent. Use Resend mail to retry.',
  });
}));

/* Re-send the participant mail for one registration (admin panel "Resend mail"
   button calls this). Verified registrations get the confirmation mail with
   event guides; anything else gets the pending acknowledgment instead — the
   record itself is never modified apart from mail bookkeeping. */
app.put('/api/admin/confirmation/resend/:id', safe(async (req, res) => {
  const r = await store.getReg(req.params.id);
  if (!r) return res.status(404).json({ success: false, message: 'Registration not found.' });
  const verified = r.payment_status === 'VERIFIED';
  const attachments = verified ? getEventGuideAttachments(r.event) : [];
  const built = verified
    ? mailer.confirmationMail(r, attachments.map((a) => a.filename))
    : mailer.pendingMail(r);
  const result = await mail(
    r.email, built.subject, built.text, built.html, attachments,
    verified ? 'registration-confirmed' : 'registration-pending',
  );
  r.confirmation_mail_sent = verified ? result.sent : Boolean(r.confirmation_mail_sent);
  if (result.sent) {
    r.confirmation_mail_sent_at = new Date().toISOString();
    delete r.confirmation_mail_error;
    r.last_mail_resent_at = new Date().toISOString();
    r.last_mail_resent_by = req.admin.email;
  } else {
    r.confirmation_mail_error = result.error || 'Unknown mail error';
  }
  await store.saveReg(r);
  res.json({
    success: result.sent,
    mailSent: result.sent,
    ...(result.sent ? {} : { mailError: result.error || 'Email could not be sent.' }),
    message: result.sent
      ? (verified ? 'Confirmation email re-sent.' : 'Acknowledgment email re-sent (registration is not verified yet).')
      : 'Email could not be sent. Check the mail configuration, then retry.',
  });
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
  if (!calculateCanonicalAmount({ eventList: titles }).fullyKnown) {
    return res.status(400).json({ success: false, message: 'Selected events are invalid or disabled.' });
  }
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
