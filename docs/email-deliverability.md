# Email deliverability — spam folder + missing verification mail

All server mail now goes through one transport: `api/mailer.js`. This note
explains what was wrong, what changed, and what to check when a participant
says "I didn't get the mail".

## The two reported problems

| # | Symptom | Root cause |
|---|---------|------------|
| 1 | The acknowledgment mail after submitting ("registration received") lands in **spam** | Mail was built inline in two API files with no `Reply-To`, no `Message-ID`, no `List-Unsubscribe`, an inconsistent From display name, and shouty subjects — classic content-filter triggers. |
| 2 | The **verification (confirmation) mail is not received** after admin approval | Same weak envelope, plus: PDF event guides attached to every confirmation (heavier mails get filtered more), silent failures (a Gmail auth/limit error only appeared in server logs), and no way to retry except verify → undo → verify. |

## What changed in code

- **One shared mailer** (`api/mailer.js`) for registration, verification,
  admin notifications and the contact form: stable From identity
  (`Vaagai 26 <EMAIL_USER>`), `Reply-To`, unique `Message-ID`,
  `List-Unsubscribe` plus `List-Unsubscribe-Post: List-Unsubscribe=One-Click`,
  plain-text + HTML bodies that say the same thing, calm personalised subjects
  (`Vaagai 26 registration received for Asha - REG-0001`), and an organiser
  footer (who we are + why they got the mail).
- Registration records are saved before mail starts. The admin and participant
  notifications run concurrently, while the SMTP transport has connection,
  socket, and 15-second send limits. A slow mail server therefore cannot turn a
  successful registration into a server error.
- Payment screenshots are compressed in the browser by
  `phantasm-payment-upload-fix-v1.js` to keep multipart requests below the
  Vercel body limit. Proxy HTML errors are converted to actionable messages in
  the payment page.
- **Attachments can never eat a confirmation**: if sending *with* the event
  guides fails, the mailer automatically retries *without* them.
- **Admin "Resend mail" button** on every registration row
  (`public/assets/phantasm-admin-mail-resend-v1.js` → `PUT
  /api/admin/confirmation/resend/:id`). Verified rows re-send the confirmation
  with guides; other rows re-send the pending acknowledgment. A failed retry
  shows the real server error in the button tooltip.
- **Verify reports mail errors**: `PUT /api/admin/payment/verify/:id` now
  returns `mailError` (admin-only) instead of a silent miss, so you know
  immediately whether the confirmation actually went out.
- **Pre-register sends no mail** — the acknowledgment still goes out exactly
  once, at payment submit, so participants are never double-mailed.

No existing registrations were touched: statuses, UTRs and verification
history are unchanged. The only new status is `AWAITING_PAYMENT` (details
saved, payment not submitted yet), which the admin grid renders as
"Awaiting payment".

## Setup checklist (Vercel → Settings → Environment Variables)

1. `EMAIL_USER` = `vaagai2k26@gmail.com` (the account that sends).
2. `EMAIL_PASS` = a **Gmail App Password** (16 chars, no spaces) — NOT the
   normal Gmail password. From that account: myaccount.google.com →
   Security → 2-Step Verification ON → search **App Passwords** → create one
   for *Mail*. If the account password changes, the App Password dies too —
   generate a fresh one and redeploy.
3. `CONTACT_TO` = where contact-form + admin mails land (usually the same).
4. Optional: `MAIL_FROM_NAME` (default `Vaagai 26`), `MAIL_REPLY_TO`
   (default = `CONTACT_TO`). Keep the From name stable over time.
5. After changing env vars: **Deployments → ⋯ → Redeploy**.

SPF/DKIM/DMARC need **no action**: mail is relayed through Gmail SMTP, so
Google signs and authenticates every message automatically.

## When a participant says "mail not received"

1. In the admin panel, find their row and click **✉️ Resend mail**. If it
   reports failure, the tooltip shows why (usually `EMAIL_PASS` expired or
   Gmail's ~500-mails/day limit hit — wait and retry).
2. Ask the participant to check **Spam / Promotions / All Mail** for
   `vaagai2k26@gmail.com`, then **"Report not spam"** and add the address to
   contacts — this trains Gmail for the next mails.
3. Confirm they typed their email correctly (check the row — a typo means the
   mail went to a stranger's inbox; there is nothing to resend to).

## Quick API reference (alternative to the button)

```bash
# 1. admin login -> token
TOKEN=$(curl -s -X POST https://<your-app>.vercel.app/api/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"ADMIN_EMAIL","password":"ADMIN_PASSWORD"}' | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>console.log(JSON.parse(s).token))")

# 2. resend the mail for one registration
curl -s -X PUT https://<your-app>.vercel.app/api/admin/confirmation/resend/REG-0001 \
  -H "Authorization: Bearer $TOKEN"
```

`{"mailSent":true}` = accepted by Gmail. `mailError` tells you what Gmail
rejected (auth, quota, malformed address, …).

For an authenticated organiser-only diagnostic, use
`GET /api/admin/mail/probe`. It sends to `ADMIN_EMAIL`, is capped at five
attempts per hour, and puts the exact message headers in a real inbox so Gmail
**Show original** can be inspected. See `docs/admin-runbook.md` for the curl
command and payment recovery procedure.
