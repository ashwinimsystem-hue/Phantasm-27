# Admin runbook — payment recovery and mail diagnosis

This runbook is for the VAAGAI '26 / PHANTASM'27 organisers. The admin panel
is the source of truth; never create a second registration for the same email.

## Payment status meanings

- `AWAITING_PAYMENT`: the participant completed the details form, but the
  payment page has not reached the server yet. No participant acknowledgment
  mail is sent at this stage.
- `PENDING_VERIFICATION`: a payment submit was received, or an organiser
  manually marked the payment as received. Check the UTR and screenshot before
  approving it.
- `VERIFIED`: payment was approved. The confirmation mail and matching event
  guide PDFs are sent when verification succeeds.

## A participant says the payment submit showed “Server error”

1. Ask them to use the same email address and submit the payment again. The
   server merges by email and keeps the same `REG-xxxx` record; it does not
   create a duplicate.
2. Ask them to use a clear screenshot. The site compresses large images in the
   browser before upload, but an image that cannot be decoded or is still more
   than 4 MB should be cropped or re-saved.
3. Refresh the admin registrations list and look for the existing email. A
   saved row with `AWAITING_PAYMENT` means the details arrived before payment;
   it is not evidence that the payment was received.

## Recover an `AWAITING_PAYMENT` row

Use the row's **Mark received** action only after the organiser has independently
confirmed the payment in the UPI/bank account. The action is deliberately
one-way:

1. Open the admin registrations panel.
2. Confirm the participant name, email, amount, and payment reference outside
   the website.
3. Click **Mark received** on the exact `Awaiting payment` row. If a different
   row is shown, do not use the action.
4. The row becomes `PENDING_VERIFICATION`, and the operator email/time are
   saved as `payment_marked_received_by` and `payment_marked_received_at`.
5. The participant receives the normal “registration received” acknowledgment.
   If mail is unavailable, the row is still recovered; use **Resend mail** after
   fixing mail configuration.
6. Verify the payment normally after checking the UTR/screenshot.

The endpoint behind the action is:

```text
PUT /api/admin/payment/mark-received/REG-0001
Authorization: Bearer <admin-token>
```

It refuses `PENDING_VERIFICATION` and `VERIFIED` rows with HTTP 409, so it
cannot accidentally re-open or approve a payment.

## Missing acknowledgment or confirmation mail

1. Check the participant email in the row for spelling errors.
2. Click **Resend mail**. Verified rows receive the confirmation and event
   guides; other rows receive the acknowledgment. A failure is shown in the
   button title and in the API response as `mailError`.
3. Ask the participant to check Spam, Promotions, and All Mail for the stable
   sender address, then mark it **Not spam** and add it to contacts.
4. If the mail configuration was fixed, retry the button. Do not verify/undo a
   payment just to trigger another email.

## Gmail “Show original” probe

The probe is admin-authenticated, sends only to `ADMIN_EMAIL`, and is limited
to five attempts per hour. It is useful for distinguishing a Gmail SMTP
configuration problem from participant mailbox filtering.

```bash
TOKEN=$(curl -s -X POST https://YOUR-APP.vercel.app/api/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"ADMIN_EMAIL","password":"ADMIN_PASSWORD"}' \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>console.log(JSON.parse(s).token))")

curl -s https://YOUR-APP.vercel.app/api/admin/mail/probe \
  -H "Authorization: Bearer $TOKEN"
```

A successful response has `mailSent: true`. Open the received message in Gmail,
choose **Show original**, and check that SPF, DKIM, DMARC, Message-ID, and
List-Unsubscribe are present. A `503` response includes `mailError`; the usual
causes are a missing/expired Gmail App Password or a sending quota limit. A
`429` means the five-probe hourly limit was reached.

## Environment checks

Required production variables are `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
`ADMIN_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`,
`EMAIL_USER`, and `EMAIL_PASS`. `EMAIL_PASS` must be a Gmail App Password, not
the normal account password. `CONTACT_TO` and `MAIL_REPLY_TO` may be used to
control organiser replies.

After changing Vercel environment variables, redeploy. Do not put credentials
in registration records, screenshots, logs, issues, or chat.
