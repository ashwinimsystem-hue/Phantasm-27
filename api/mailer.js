'use strict';

/* Vaagai'26 / Phantasm'27 — shared mail transport.
 *
 * Why this file exists
 * --------------------
 * Participants reported two mail problems: the acknowledgment mail sent right
 * after registration lands in spam, and the verification (confirmation) mail
 * sometimes never arrives. Both mails used to be built inline in two different
 * API files with no deliverability headers. This module centralises every mail
 * the server sends so they all share the same safe envelope:
 *
 *   · one consistent From identity ("Vaagai 26 <EMAIL_USER>") — never changes
 *     per mail, so mailbox providers can build a stable sender reputation;
 *   · Reply-To pointing at the organisers (MAIL_REPLY_TO / CONTACT_TO);
 *   · a unique standards-compliant Message-ID per mail;
 *   · List-Unsubscribe (mailto) so Gmail/Outlook treat us as a legit sender;
 *   · plain-text AND html bodies that say the same thing (spam filters punish
 *     html-only mail);
 *   · calm, factual, ASCII-only subjects — no ALL-CAPS, no emoji, no
 *     exclamation-heavy marketing phrasing that trips content filters;
 *   · a footer identifying the organiser (name + college + why they got the
 *     mail), which is what Gmail's bulk-sender guidance asks for.
 *
 * NOTE on Gmail delivery: mail is relayed through Gmail SMTP, so SPF/DKIM
 * authentication is handled by Google automatically. If mail still lands in
 * spam it is a content/reputation verdict, not an authentication failure —
 * see docs/email-deliverability.md for the checklist (Gmail App Password,
 * daily limits, "mark as not spam", resend flow).
 *
 * Existing registrations are never touched by this module — it only sends.
 */

const crypto = require('crypto');

const EMAIL_USER = () => String(process.env.EMAIL_USER || '').trim();
const EMAIL_PASS = () => String(process.env.EMAIL_PASS || '').trim();
const CONTACT_TO = () => String(process.env.CONTACT_TO || EMAIL_USER()).trim();
const FROM_NAME = () => String(process.env.MAIL_FROM_NAME || 'Vaagai 26').trim() || 'Vaagai 26';
const REPLY_TO = () => String(process.env.MAIL_REPLY_TO || CONTACT_TO()).trim() || EMAIL_USER();

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function mailConfigured() {
  return Boolean(EMAIL_USER() && EMAIL_PASS());
}

function getTransporter() {
  if (!mailConfigured()) return null;
  const nodemailer = require('nodemailer');
  const port = Number(process.env.EMAIL_PORT || 465);
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user: EMAIL_USER(), pass: EMAIL_PASS() },
  });
}

function newMessageId() {
  const domain = (EMAIL_USER().split('@')[1] || 'vaagai26.local').trim() || 'vaagai26.local';
  return `<${Date.now()}.${crypto.randomBytes(8).toString('hex')}@${domain}>`;
}

const footerText = (replyTo) => [
  '',
  '',
  '--',
  'Vaagai 26 - National Level Technical Symposium',
  'Department of Mechanical Engineering, Government College of Engineering, Bargur',
  'You received this email because you registered for Vaagai 26.',
  `For help, reply to this email or write to ${replyTo}.`,
].join('\n');

const footerHtml = (replyTo) => [
  '<hr style="border:none;border-top:1px solid #ddd;margin:18px 0 10px">',
  '<p style="font-size:12px;color:#666;line-height:1.6">Vaagai 26 - National Level Technical Symposium<br>',
  'Department of Mechanical Engineering, Government College of Engineering, Bargur<br>',
  'You received this email because you registered for Vaagai 26.<br>',
  `For help, reply to this email or write to ${esc(replyTo)}.</p>`,
].join('');

/**
 * Send one transactional mail.
 * Never throws — always resolves to { sent, error, attachmentsSkipped }.
 * A mail with attachments that fails is retried once WITHOUT attachments so a
 * participant never loses their confirmation because of a PDF problem.
 */
async function sendMail(to, { subject, text, html, attachments = [], kind = 'transactional' } = {}) {
  const cleanTo = String(to || '').trim();
  if (!cleanTo) return { sent: false, error: 'No recipient address.' };
  const transporter = getTransporter();
  if (!transporter) {
    return { sent: false, error: 'Email is not configured on the server (EMAIL_USER / EMAIL_PASS missing).' };
  }
  const replyTo = REPLY_TO() || EMAIL_USER();
  const base = {
    from: `${FROM_NAME()} <${EMAIL_USER()}>`,
    to: cleanTo,
    replyTo,
    subject: String(subject || 'Vaagai 26 update'),
    text: String(text || ''),
    html: String(html || ''),
    messageId: newMessageId(),
    headers: {
      'List-Unsubscribe': `<mailto:${replyTo}?subject=unsubscribe>`,
      'X-Vaagai-Mail-Kind': String(kind || 'transactional'),
    },
  };
  try {
    await transporter.sendMail(attachments && attachments.length ? { ...base, attachments } : base);
    return { sent: true, error: null };
  } catch (error) {
    if (attachments && attachments.length) {
      try {
        await transporter.sendMail(base);
        console.warn('[mailer] attachments failed, delivered without them:', error.message);
        return { sent: true, error: null, attachmentsSkipped: true };
      } catch (retryError) {
        console.error('[mailer] send failed (also without attachments):', retryError.message);
        return { sent: false, error: retryError.message || String(retryError) };
      }
    }
    console.error('[mailer] send failed:', error.message);
    return { sent: false, error: error.message || String(error) };
  }
}

/* ── participant mails ─────────────────────────────────────────────── */

function pendingMail(reg) {
  const replyTo = REPLY_TO() || EMAIL_USER();
  const subject = `Vaagai 26 registration received - ${reg.id}`;
  const text = [
    `Hi ${reg.name},`,
    '',
    `Your registration ${reg.id} has been received and is now pending payment verification.`,
    `Events: ${reg.event}`,
    `Amount: Rs.${reg.amount}`,
    reg.team_id ? `Team ID: ${reg.team_id}` : null,
    '',
    'What happens next: our team will verify your payment and you will receive',
    'a confirmation email with your event guide(s). This usually takes some time',
    'during the registration rush, so please keep your registered email active.',
    footerText(replyTo),
  ].filter((line) => line !== null).join('\n');
  const html = [
    `<p>Hi ${esc(reg.name)},</p>`,
    `<p>Your registration <b>${esc(reg.id)}</b> has been received and is now <b>pending payment verification</b>.</p>`,
    `<p><b>Events:</b> ${esc(reg.event)}<br><b>Amount:</b> Rs.${esc(reg.amount)}${reg.team_id ? `<br><b>Team ID:</b> ${esc(reg.team_id)}` : ''}</p>`,
    '<p>What happens next: our team will verify your payment and you will receive a confirmation email with your event guide(s). This usually takes some time during the registration rush, so please keep your registered email active.</p>',
    footerHtml(replyTo),
  ].join('');
  return { subject, text, html };
}

function confirmationMail(reg, guideFiles = []) {
  const replyTo = REPLY_TO() || EMAIL_USER();
  const subject = `Vaagai 26 registration confirmed - ${reg.id}`;
  const attached = guideFiles.filter(Boolean);
  const guideNoteText = attached.length
    ? `\nEvent guide(s) for your registered events are attached to this email:\n${attached.map((f) => `- ${f}`).join('\n')}`
    : '';
  const guideNoteHtml = attached.length
    ? `<p>The event guide(s) for your registered events are attached to this email:<br>${attached.map((f) => esc(f)).join('<br>')}</p>`
    : '';
  const text = [
    `Hi ${reg.name},`,
    '',
    `Your registration ${reg.id} has been verified and approved. Your seat for the listed events is confirmed.`,
    `Events: ${reg.event}`,
    `Amount: Rs.${reg.amount}`,
    reg.team_id ? `Team ID: ${reg.team_id}` : null,
    guideNoteText,
    '',
    'Please carry your college ID card to the venue and report at the registration desk on the event day.',
    footerText(replyTo),
  ].filter((line) => line !== null).join('\n');
  const html = [
    `<p>Hi ${esc(reg.name)},</p>`,
    `<p>Your registration <b>${esc(reg.id)}</b> has been <b>verified and approved</b>. Your seat for the listed events is confirmed.</p>`,
    `<p><b>Events:</b> ${esc(reg.event)}<br><b>Amount:</b> Rs.${esc(reg.amount)}${reg.team_id ? `<br><b>Team ID:</b> ${esc(reg.team_id)}` : ''}</p>`,
    guideNoteHtml,
    '<p>Please carry your college ID card to the venue and report at the registration desk on the event day.</p>',
    footerHtml(replyTo),
  ].join('');
  return { subject, text, html };
}

function addedEventsMail(reg, addedEvents) {
  const replyTo = REPLY_TO() || EMAIL_USER();
  const subject = `Vaagai 26 registration ${reg.id} updated - new events added`;
  const pending = reg.payment_status === 'PENDING_VERIFICATION';
  const text = [
    `Hi ${reg.name},`,
    '',
    'Your additional event selection has been received.',
    `Added events: ${addedEvents.join(', ')}`,
    `Your current events: ${reg.event}`,
    pending
      ? 'Your updated payment is pending admin verification. You will receive a confirmation email once it is verified.'
      : 'Your registration remains active.',
    footerText(replyTo),
  ].join('\n');
  const html = [
    `<p>Hi ${esc(reg.name)},</p>`,
    '<p>Your additional event selection has been received.</p>',
    `<p><b>Added events:</b> ${esc(addedEvents.join(', '))}</p>`,
    `<p><b>Your current events:</b> ${esc(reg.event)}</p>`,
    pending
      ? '<p>Your updated payment is pending admin verification. You will receive a confirmation email once it is verified.</p>'
      : '<p>Your registration remains active.</p>',
    footerHtml(replyTo),
  ].join('');
  return { subject, text, html };
}

/* ── organiser mails ───────────────────────────────────────────────── */

function adminNewRegistrationMail(reg) {
  const subject = `New Vaagai 26 registration ${reg.id} (${reg.name})`;
  const text = [
    'A new event registration was submitted.',
    '',
    `Registration ID: ${reg.id}`,
    `Name: ${reg.name}`,
    `Email: ${reg.email}`,
    `Phone: ${reg.phone}`,
    `College: ${reg.college}`,
    `Department: ${reg.dept}`,
    `Events: ${reg.event}`,
    `Amount: Rs.${reg.amount}`,
    `UTR: ${reg.utr || 'Not provided'}`,
    `Screenshot: ${reg.has_screenshot ? 'Uploaded' : 'Not uploaded'}`,
    `Status: ${reg.payment_status}`,
  ].join('\n');
  const html = [
    '<h2>New event registration</h2>',
    `<p><b>Registration ID:</b> ${esc(reg.id)}</p>`,
    `<p><b>Name:</b> ${esc(reg.name)}</p>`,
    `<p><b>Email:</b> ${esc(reg.email)}</p>`,
    `<p><b>Phone:</b> ${esc(reg.phone)}</p>`,
    `<p><b>College:</b> ${esc(reg.college)}</p>`,
    `<p><b>Department:</b> ${esc(reg.dept)}</p>`,
    `<p><b>Events:</b> ${esc(reg.event)}</p>`,
    `<p><b>Amount:</b> Rs.${esc(reg.amount)}</p>`,
    `<p><b>UTR:</b> ${esc(reg.utr || 'Not provided')}</p>`,
    `<p><b>Screenshot:</b> ${reg.has_screenshot ? 'Uploaded' : 'Not uploaded'}</p>`,
    `<p><b>Status:</b> ${esc(reg.payment_status)}</p>`,
  ].join('');
  return { subject, text, html };
}

function adminUpdatedRegistrationMail(reg, addedEvents) {
  const subject = `Vaagai 26 registration ${reg.id} updated (${reg.name})`;
  const text = [
    'Additional events were added to an existing registration.',
    '',
    `Registration ID: ${reg.id}`,
    `Name: ${reg.name}`,
    `Email: ${reg.email}`,
    `Added Events: ${addedEvents.join(', ')}`,
    `All Events: ${reg.event}`,
    `Amount: Rs.${reg.amount}`,
    `Status: ${reg.payment_status}`,
  ].join('\n');
  const html = [
    '<h2>Additional events added</h2>',
    `<p><b>Registration ID:</b> ${esc(reg.id)}</p>`,
    `<p><b>Name:</b> ${esc(reg.name)}</p>`,
    `<p><b>Email:</b> ${esc(reg.email)}</p>`,
    `<p><b>Added Events:</b> ${esc(addedEvents.join(', '))}</p>`,
    `<p><b>All Events:</b> ${esc(reg.event)}</p>`,
    `<p><b>Amount:</b> Rs.${esc(reg.amount)}</p>`,
    `<p><b>Status:</b> ${esc(reg.payment_status)}</p>`,
  ].join('');
  return { subject, text, html };
}

function contactMail({ cleanName, cleanEmail, cleanMessage }) {
  const subject = `Vaagai 26 website enquiry - ${cleanName}`;
  const text = `From: ${cleanName} <${cleanEmail}>\n\n${cleanMessage}`;
  const html = `<p><b>From:</b> ${esc(cleanName)} &lt;${esc(cleanEmail)}&gt;</p><p>${esc(cleanMessage)}</p>`;
  return { subject, text, html };
}

module.exports = {
  mailConfigured,
  sendMail,
  pendingMail,
  confirmationMail,
  addedEventsMail,
  adminNewRegistrationMail,
  adminUpdatedRegistrationMail,
  contactMail,
  CONTACT_TO,
};
