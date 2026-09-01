'use strict';
const store = require('./store');

const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
const eventTitles = (r) => {
  const fromEvent = String(r?.event || '').split(',').map((x) => x.trim()).filter(Boolean);
  const fromDetail = Array.isArray(r?.eventsDetail)
    ? r.eventsDetail.map((e) => typeof e === 'string' ? e.trim() : String(e?.title || e?.eventName || e?.eventId || '').trim()).filter(Boolean)
    : [];
  return [...new Set([...fromEvent, ...fromDetail])];
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, message: 'Method not allowed.' });
  }

  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!emailOk(email)) return res.status(400).json({ success: false, message: 'Invalid email address.' });

    const rows = await store.listRegs();
    const registration = rows.find((r) => String(r.email || '').trim().toLowerCase() === email);

    if (!registration) {
      return res.status(200).json({
        success: true,
        registered: false,
        events: [],
        message: 'Email is available for registration.',
      });
    }

    return res.status(200).json({
      success: true,
      registered: true,
      registrationId: registration.id,
      name: registration.name || '',
      events: eventTitles(registration),
      paymentStatus: registration.payment_status || 'PENDING_VERIFICATION',
      message: 'Existing registration found. You can add more events.',
    });
  } catch (error) {
    console.error('[check-email]', error);
    return res.status(500).json({ success: false, message: 'Unable to check this email right now.' });
  }
};
