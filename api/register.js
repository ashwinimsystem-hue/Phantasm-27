'use strict';
const multer = require('multer');
const store = require('./store');
const { calculateCanonicalAmount } = require('./pricing');
const mailer = require('./mailer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

const AWAITING_PAYMENT = 'AWAITING_PAYMENT';

const fail = (res, code, message, extra = {}) => res.status(code).json({ success: false, message, ...extra });
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
const parseArray = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v !== 'string') return [];
  try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
};
const eventTitle = (e) => typeof e === 'string' ? e.trim() : String(e?.title || e?.eventName || e?.eventId || '').trim();
const uniqueEvents = (...groups) => [...new Set(groups.flatMap((group) => Array.isArray(group) ? group.map(eventTitle).filter(Boolean) : []))];

const adminEmail = () => String(process.env.ADMIN_EMAIL || process.env.EMAIL_USER || '').trim().toLowerCase();

async function sendAdminMail(kind, payload) {
  const to = adminEmail();
  if (!to) return false;
  if (kind === 'updated') {
    const built = mailer.adminUpdatedRegistrationMail(payload.reg, payload.addedEvents);
    return (await mailer.sendMail(to, { ...built, kind: 'admin-registration-updated' })).sent;
  }
  const built = mailer.adminNewRegistrationMail(payload);
  return (await mailer.sendMail(to, { ...built, kind: 'admin-registration-new' })).sent;
}

function ensureCanonicalPricing(result) {
  if (!result.fullyKnown || result.unknownEvents?.length) {
    const unknown = result.unknownEvents?.join(', ') || 'selected event';
    const error = new Error(`Pricing is not configured for: ${unknown}`);
    error.statusCode = 400;
    throw error;
  }
  if (!(Number(result.amount) > 0)) {
    const error = new Error('Registration fee must be greater than zero.');
    error.statusCode = 400;
    throw error;
  }
  return Number(result.amount);
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, 'Method not allowed.');
  }

  try {
    const body = req.body || {};
    let data = body;
    if (typeof body.data === 'string') {
      try { data = { ...body, ...JSON.parse(body.data) }; }
      catch { return fail(res, 400, 'Invalid registration data.'); }
    }

    const name = String(data.name || '').trim();
    const email = String(data.email || '').trim().toLowerCase();
    const phone = String(data.phone || '').replace(/\D/g, '');
    const college = String(data.college || '').trim();
    const dept = String(data.dept || data.department || '').trim();
    const selectedEvents = parseArray(data.selectedEvents);
    const eventsDetail = parseArray(data.eventsDetail);
    const incomingEventList = uniqueEvents(
      String(data.event || '').split(',').map((x) => x.trim()),
      selectedEvents,
      eventsDetail,
    );
    const event = incomingEventList.join(', ');

    if (!name || !emailOk(email) || phone.length !== 10 || !college || !dept || !event) {
      return fail(res, 400, 'Please complete all required registration fields.');
    }

    const incomingTeamName = String(data.teamName || '').trim();
    const incomingTeamId = String(data.team_id || data.teamId || '').trim();
    const incomingUtr = String(data.utr || '').trim();

    const existingRows = await store.listRegs();
    const existing = existingRows.find((r) => String(r.email || '').trim().toLowerCase() === email);

    if (existing) {
      const currentEvents = uniqueEvents(
        String(existing.event || '').split(',').map((x) => x.trim()),
        existing.eventsDetail,
      );
      const addedEvents = incomingEventList.filter((title) => !currentEvents.some((current) => current.toLowerCase() === title.toLowerCase()));
      const mergedEvents = uniqueEvents(currentEvents, incomingEventList);

      const mergedDetails = [
        ...(Array.isArray(existing.eventsDetail) ? existing.eventsDetail : []),
        ...eventsDetail,
      ];
      const mergedTeamName = incomingTeamName || String(existing.teamName || '').trim();
      const mergedTeamId = incomingTeamId || String(existing.team_id || '').trim();
      const canonicalMerged = calculateCanonicalAmount({
        eventList: mergedEvents,
        eventsDetail: mergedDetails,
        teamName: mergedTeamName,
        teamId: mergedTeamId,
        fallbackAmount: 0,
      });
      let canonicalMergedAmount;
      try {
        canonicalMergedAmount = ensureCanonicalPricing(canonicalMerged);
      } catch (pricingError) {
        return fail(res, pricingError.statusCode || 400, pricingError.message);
      }
      const canonicalAdded = calculateCanonicalAmount({
        eventList: addedEvents,
        eventsDetail,
        teamName: mergedTeamName,
        teamId: mergedTeamId,
        fallbackAmount: 0,
      });
      const canonicalAddedAmount = addedEvents.length ? (() => {
        try { return ensureCanonicalPricing(canonicalAdded); }
        catch (pricingError) { return null; }
      })() : 0;
      if (addedEvents.length && canonicalAddedAmount == null) {
        return fail(res, 400, 'One or more added events do not have a configured registration fee.');
      }

      const oldAmount = Number(existing.amount) || 0;
      const newTotalAmount = canonicalMergedAmount;
      const wasAwaitingPayment = existing.payment_status === AWAITING_PAYMENT;

      const detailMap = new Map();
      mergedDetails.forEach((item) => {
        const title = eventTitle(item);
        if (!title) return;
        const key = title.toLowerCase();
        if (!detailMap.has(key)) detailMap.set(key, item);
      });

      existing.name = name || existing.name;
      existing.phone = phone || existing.phone;
      existing.college = college || existing.college;
      existing.dept = dept || existing.dept;
      existing.gender = String(data.gender || existing.gender || '');
      existing.year = String(data.year || existing.year || '');
      existing.event = mergedEvents.join(', ');
      existing.eventsDetail = [...detailMap.values()];
      existing.teamName = mergedTeamName;
      existing.team_id = mergedTeamId;

      // Did this submission carry a payment for previously-unpaid events?
      let paymentJustCompleted = false;
      if (addedEvents.length && newTotalAmount > oldAmount) {
        existing.amount = newTotalAmount;
        existing.utr = incomingUtr;
        existing.payment_status = 'PENDING_VERIFICATION';
        existing.verified_at = null;
        existing.verified_by = null;
        existing.confirmation_mail_sent = false;
        paymentJustCompleted = true;
      } else if (wasAwaitingPayment && (incomingUtr || req.file)) {
        // Details were saved early via /api/pre-register; this submit is the
        // actual payment for them (same events, so nothing was "added").
        existing.amount = newTotalAmount;
        if (incomingUtr) existing.utr = incomingUtr;
        existing.payment_status = 'PENDING_VERIFICATION';
        existing.verified_at = null;
        existing.verified_by = null;
        existing.confirmation_mail_sent = false;
        paymentJustCompleted = true;
      } else if (canonicalMergedAmount !== oldAmount) {
        existing.amount = newTotalAmount;
        existing.utr = incomingUtr || existing.utr || '';
      } else if (incomingUtr && incomingUtr !== String(existing.utr || '') && existing.payment_status !== 'VERIFIED') {
        // Same events, same amount, but a corrected UTR — accept it silently.
        existing.utr = incomingUtr;
      }

      let screenshotStored = Boolean(existing.screenshot_stored);
      if (req.file) {
        existing.has_screenshot = true;
        try {
          const b64 = req.file.buffer.toString('base64');
          if (b64.length <= 750000) {
            await store.putShot(existing.id, req.file.mimetype, b64);
            screenshotStored = true;
            existing.screenshot_stored = true;
          }
        } catch (error) {
          console.error('[register/screenshot-existing]', error);
        }
      }

      existing.updated_at = new Date().toISOString();
      await store.saveReg(existing);

      let adminNotified = false;
      let pendingMailSent = false;
      if (paymentJustCompleted && !addedEvents.length) {
        // Save first, then notify both inboxes concurrently. A slow SMTP server
        // must never make the participant wait for the admin copy (or vice
        // versa), and both sends are individually timeout-bounded by mailer.
        const built = mailer.pendingMail(existing);
        const [adminResult, participantResult] = await Promise.all([
          sendAdminMail('new', existing),
          mailer.sendMail(existing.email, { ...built, kind: 'registration-pending' }),
        ]);
        adminNotified = adminResult;
        pendingMailSent = participantResult.sent;
      } else if (addedEvents.length) {
        const built = mailer.addedEventsMail(existing, addedEvents);
        const [adminResult, participantResult] = await Promise.all([
          sendAdminMail('updated', { reg: existing, addedEvents }),
          mailer.sendMail(existing.email, { ...built, kind: 'registration-updated' }),
        ]);
        adminNotified = adminResult;
        pendingMailSent = participantResult.sent;
      }

      return res.status(200).json({
        success: true,
        existingRegistration: true,
        registrationId: existing.id,
        teamId: existing.team_id || null,
        amount: existing.amount,
        paymentStatus: existing.payment_status,
        events: mergedEvents,
        addedEvents,
        adminNotified,
        pendingMailSent,
        screenshotStored,
        message: addedEvents.length
          ? 'Additional events added to your existing registration.'
          : paymentJustCompleted
            ? 'Payment submitted successfully and is pending admin verification.'
            : 'Your registration is already active. Select additional events to continue.',
      });
    }

    const id = `REG-${String(await store.counter('reg')).padStart(4, '0')}`;
    const teamName = incomingTeamName;
    let teamId = incomingTeamId;
    if (teamName && !teamId) {
      teamId = `VAA-${String(await store.counter('team')).padStart(3, '0')}`;
      await store.saveTeam({ team_id: teamId, team_name: teamName, leader: name, leader_email: email, members: [{ name, email }], event, created_at: new Date().toISOString() });
    }

    const canonicalPricing = calculateCanonicalAmount({
      eventList: incomingEventList,
      eventsDetail,
      teamName,
      teamId,
      fallbackAmount: 0,
    });
    let finalAmount;
    try {
      finalAmount = ensureCanonicalPricing(canonicalPricing);
    } catch (pricingError) {
      return fail(res, pricingError.statusCode || 400, pricingError.message);
    }

    let screenshotStored = false;
    if (req.file) {
      try {
        const b64 = req.file.buffer.toString('base64');
        if (b64.length <= 750000) {
          await store.putShot(id, req.file.mimetype, b64);
          screenshotStored = true;
        }
      } catch (error) {
        console.error('[register/screenshot]', error);
      }
    }

    const registration = {
      id,
      name,
      email,
      phone,
      college,
      dept,
      gender: String(data.gender || ''),
      year: String(data.year || ''),
      event,
      eventsDetail,
      teamName,
      team_id: teamId,
      amount: finalAmount,
      pricing_source: 'server-canonical-rules',
      pricing_unknown_events: [],
      utr: incomingUtr,
      payment_status: 'PENDING_VERIFICATION',
      attendance_status: 'PENDING',
      verified_at: null,
      verified_by: null,
      has_screenshot: Boolean(req.file),
      screenshot_stored: screenshotStored,
      confirmation_mail_sent: false,
      created_at: new Date().toISOString(),
    };

    await store.saveReg(registration);

    // The record is durable before either SMTP request starts. Send both
    // notifications concurrently so a slow/failed mailbox cannot prevent the
    // registration response; mailer enforces a 15 second cap per send.
    const pendingBuilt = mailer.pendingMail(registration);
    const [adminNotified, pendingResult] = await Promise.all([
      sendAdminMail('new', registration),
      mailer.sendMail(email, { ...pendingBuilt, kind: 'registration-pending' }),
    ]);
    const pendingMailSent = pendingResult.sent;

    registration.admin_notification_sent = adminNotified;
    registration.pending_mail_sent = pendingMailSent;
    await store.saveReg(registration);

    return res.status(201).json({
      success: true,
      registrationId: id,
      teamId: teamId || null,
      amount: registration.amount,
      paymentStatus: registration.payment_status,
      pricingSource: registration.pricing_source,
      pricingUnknownEvents: registration.pricing_unknown_events,
      adminNotified,
      pendingMailSent,
      message: 'Registration submitted successfully and is pending admin verification.',
    });
  } catch (error) {
    console.error('[register] server error:', error);
    return fail(res, error.statusCode || 500, error.statusCode ? error.message : 'Registration could not be completed. Please try again.');
  }
}

module.exports = (req, res) => upload.single('screenshot')(req, res, (error) => {
  if (error) {
    console.error('[register/upload]', error);
    return fail(res, 400, error.code === 'LIMIT_FILE_SIZE' ? 'Payment screenshot is too large (max 4 MB).' : 'Invalid payment screenshot. Use JPG, PNG or WEBP.');
  }
  return handler(req, res);
});
