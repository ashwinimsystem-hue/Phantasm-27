'use strict';
const multer = require('multer');
const store = require('./store');
const { calculateCanonicalAmount } = require('./pricing');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

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

async function getMailer() {
  const user = String(process.env.EMAIL_USER || '').trim();
  const pass = String(process.env.EMAIL_PASS || '').trim();
  if (!user || !pass) return null;
  const nodemailer = require('nodemailer');
  const port = Number(process.env.EMAIL_PORT || 465);
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return { transporter, user };
}

async function sendMail(to, subject, text, html) {
  if (!to) return false;
  try {
    const mailer = await getMailer();
    if (!mailer) return false;
    await mailer.transporter.sendMail({ from: `Vaagai'26 <${mailer.user}>`, to, subject, text, html });
    return true;
  } catch (error) {
    console.error('[register/mail]', error);
    return false;
  }
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

      if (addedEvents.length && newTotalAmount > oldAmount) {
        existing.amount = newTotalAmount;
        existing.utr = String(data.utr || '').trim();
        existing.payment_status = 'PENDING_VERIFICATION';
        existing.verified_at = null;
        existing.verified_by = null;
        existing.confirmation_mail_sent = false;
      } else if (canonicalMergedAmount !== oldAmount) {
        existing.amount = newTotalAmount;
        existing.utr = String(data.utr || existing.utr || '').trim();
      }

      let screenshotStored = Boolean(existing.screenshot_stored);
      if (req.file) {
        try {
          const b64 = req.file.buffer.toString('base64');
          if (b64.length <= 750000) {
            await store.putShot(existing.id, req.file.mimetype, b64);
            screenshotStored = true;
            existing.has_screenshot = true;
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
      if (addedEvents.length) {
        const adminEmail = String(process.env.ADMIN_EMAIL || process.env.EMAIL_USER || '').trim().toLowerCase();
        adminNotified = await sendMail(
          adminEmail,
          `Additional Events Added — ${existing.id}`,
          `Registration ${existing.id}\nName: ${existing.name}\nEmail: ${existing.email}\nAdded Events: ${addedEvents.join(', ')}\nAll Events: ${existing.event}\nAmount: ₹${existing.amount}\nStatus: ${existing.payment_status}`,
          `<h2>Additional Events Added</h2><p><b>Registration ID:</b> ${existing.id}</p><p><b>Name:</b> ${existing.name}</p><p><b>Email:</b> ${existing.email}</p><p><b>Added Events:</b> ${addedEvents.join(', ')}</p><p><b>All Events:</b> ${existing.event}</p><p><b>Amount:</b> ₹${existing.amount}</p><p><b>Status:</b> ${existing.payment_status}</p>`,
        );
        pendingMailSent = await sendMail(
          existing.email,
          `Additional Events Added — ${existing.id}`,
          `Hi ${existing.name},\n\nYour additional event selection has been received.\nAdded events: ${addedEvents.join(', ')}\nYour current events: ${existing.event}\n\n${existing.payment_status === 'PENDING_VERIFICATION' ? 'Your updated payment is pending admin verification.' : 'Your registration remains active.'}`,
          `<h3>Hi ${existing.name},</h3><p>Your additional event selection has been received.</p><p><b>Added events:</b> ${addedEvents.join(', ')}</p><p><b>Your current events:</b> ${existing.event}</p><p>${existing.payment_status === 'PENDING_VERIFICATION' ? 'Your updated payment is pending admin verification.' : 'Your registration remains active.'}</p>`,
        );
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
      utr: String(data.utr || '').trim(),
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

    let adminNotified = false;
    let pendingMailSent = false;
    const adminEmail = String(process.env.ADMIN_EMAIL || process.env.EMAIL_USER || '').trim().toLowerCase();
    adminNotified = await sendMail(
      adminEmail,
      `New Registration — ${id}`,
      `Registration ${id}\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nCollege: ${college}\nDepartment: ${dept}\nEvents: ${event}\nAmount: ₹${registration.amount}\nUTR: ${registration.utr || 'Not provided'}\nStatus: PENDING_VERIFICATION`,
      `<h2>New Event Registration</h2><p><b>Registration ID:</b> ${id}</p><p><b>Name:</b> ${name}</p><p><b>Email:</b> ${email}</p><p><b>Phone:</b> ${phone}</p><p><b>College:</b> ${college}</p><p><b>Department:</b> ${dept}</p><p><b>Events:</b> ${event}</p><p><b>Amount:</b> ₹${registration.amount}</p><p><b>UTR:</b> ${registration.utr || 'Not provided'}</p><p><b>Status:</b> PENDING VERIFICATION</p>`,
    );

    pendingMailSent = await sendMail(
      email,
      `Vaagai'26 Registration Received — ${id}`,
      `Hi ${name},\n\nYour registration ${id} has been received successfully and is pending admin verification. You will receive the official confirmation email after your payment is verified.`,
      `<h3>Hi ${name},</h3><p>Your registration <b>${id}</b> has been received successfully and is <b>pending admin verification</b>.</p><p>You will receive the official confirmation email after your payment is verified.</p>`,
    );

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
