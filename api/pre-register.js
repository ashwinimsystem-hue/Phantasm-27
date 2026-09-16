'use strict';

/* POST /api/pre-register — save participant details BEFORE the payment page.
 *
 * Flow: the registration form now snapshots the participant's details to the
 * server the moment they continue to the payment step (see
 * public/assets/phantasm-preregister-before-payment-v1.js). The admin panel
 * therefore shows every interested participant even if they never finish the
 * UPI payment. When the payment IS submitted, POST /api/register finds this
 * record by email and completes it (UTR + screenshot + PENDING_VERIFICATION).
 *
 * Safety rules (existing data is never harmed):
 *   · matched strictly by email — one record per participant, repeats update;
 *   · payment/verification fields of existing records are NEVER touched here
 *     (no status change, no UTR change, no verified_at change);
 *   · new records are created with payment_status AWAITING_PAYMENT, which the
 *     admin grid already renders as "Pending" — old records keep working;
 *   · no mail is sent here (the acknowledgment mail still goes out exactly
 *     once, when the payment is submitted);
 *   · pricing uses the same server-canonical rules as /api/register.
 */

const store = require('./store');
const { calculateCanonicalAmount } = require('./pricing');

const AWAITING_PAYMENT = 'AWAITING_PAYMENT';

const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
const parseArray = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v !== 'string') return [];
  try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
};
const eventTitle = (e) => typeof e === 'string' ? e.trim() : String(e?.title || e?.eventName || e?.eventId || '').trim();
const uniqueEvents = (...groups) => [...new Set(groups.flatMap((group) => Array.isArray(group) ? group.map(eventTitle).filter(Boolean) : []))];

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
    return res.status(405).json({ success: false, message: 'Method not allowed.' });
  }

  try {
    const body = req.body || {};
    let data = body;
    if (typeof body.data === 'string') {
      try { data = { ...body, ...JSON.parse(body.data) }; }
      catch { return res.status(400).json({ success: false, message: 'Invalid registration data.' }); }
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

    if (!name || !emailOk(email) || phone.length !== 10 || !college || !dept || !incomingEventList.length) {
      return res.status(400).json({ success: false, message: 'Please complete all required registration fields.' });
    }

    const incomingTeamName = String(data.teamName || '').trim();
    const incomingTeamId = String(data.team_id || data.teamId || '').trim();

    const existingRows = await store.listRegs();
    const existing = existingRows.find((r) => String(r.email || '').trim().toLowerCase() === email);

    /* ── returning participant: merge details/events, keep payment state ── */
    if (existing) {
      const currentEvents = uniqueEvents(
        String(existing.event || '').split(',').map((x) => x.trim()),
        existing.eventsDetail,
      );
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
        return res.status(pricingError.statusCode || 400).json({ success: false, message: pricingError.message });
      }

      const detailMap = new Map();
      mergedDetails.forEach((item) => {
        const title = eventTitle(item);
        if (!title) return;
        const key = title.toLowerCase();
        if (!detailMap.has(key)) detailMap.set(key, item);
      });

      // Participant details only — payment_status / utr / verified_* untouched.
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
      if (canonicalMergedAmount !== (Number(existing.amount) || 0)) {
        existing.amount = canonicalMergedAmount;
      }
      existing.pre_registered_at = existing.pre_registered_at || new Date().toISOString();
      existing.updated_at = new Date().toISOString();
      await store.saveReg(existing);

      return res.status(200).json({
        success: true,
        existingRegistration: true,
        registrationId: existing.id,
        teamId: existing.team_id || null,
        amount: existing.amount,
        paymentStatus: existing.payment_status,
        events: mergedEvents,
        message: 'Details saved. Continue to payment to complete registration.',
      });
    }

    /* ── brand-new participant: create the AWAITING_PAYMENT record ── */
    const id = `REG-${String(await store.counter('reg')).padStart(4, '0')}`;
    const teamName = incomingTeamName;
    let teamId = incomingTeamId;
    if (teamName && !teamId) {
      teamId = `VAA-${String(await store.counter('team')).padStart(3, '0')}`;
      await store.saveTeam({ team_id: teamId, team_name: teamName, leader: name, leader_email: email, members: [{ name, email }], event: incomingEventList.join(', '), created_at: new Date().toISOString() });
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
      return res.status(pricingError.statusCode || 400).json({ success: false, message: pricingError.message });
    }

    const now = new Date().toISOString();
    const registration = {
      id,
      name,
      email,
      phone,
      college,
      dept,
      gender: String(data.gender || ''),
      year: String(data.year || ''),
      event: incomingEventList.join(', '),
      eventsDetail,
      teamName,
      team_id: teamId,
      amount: finalAmount,
      pricing_source: 'server-canonical-rules',
      pricing_unknown_events: [],
      utr: '',
      payment_status: AWAITING_PAYMENT,
      attendance_status: 'PENDING',
      verified_at: null,
      verified_by: null,
      has_screenshot: false,
      screenshot_stored: false,
      confirmation_mail_sent: false,
      pre_registered_at: now,
      created_at: now,
    };

    await store.saveReg(registration);

    return res.status(201).json({
      success: true,
      registrationId: id,
      teamId: teamId || null,
      amount: registration.amount,
      paymentStatus: registration.payment_status,
      events: incomingEventList,
      message: 'Details saved. Continue to payment to complete registration.',
    });
  } catch (error) {
    console.error('[pre-register] server error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : 'Details could not be saved. Please try again.',
    });
  }
}

module.exports = handler;
