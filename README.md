# 🚀 Deploy Vaagai'26 to Vercel — step by step

This folder is a **production-ready Vercel package**: static site in `public/`
+ the whole API as one serverless function (`api/index.js`) + durable data via
free Upstash Redis. The admin-login crash bug that takes the Render deployment
offline **cannot happen here** (validate-first handlers + global error trap).

---

## 1. Deploy (choose one)

**Option A — CLI (fastest)**
```bash
npm i -g vercel
cd vaagai-26-vercel
vercel login
vercel --prod
```

**Option B — GitHub + Vercel dashboard (every `git push` auto-deploys)**
1. Create an empty repo on GitHub (e.g. `vaagai-26`) — Public or Private, both work.
2. Push **the contents of this folder as the repo root**:
   ```bash
   cd vaagai-26-vercel
   git init
   git add .
   git commit -m "Vaagai'26 — production"
   git branch -M main
   git remote add origin https://github.com/<your-username>/vaagai-26.git
   git push -u origin main
   ```
   (`.gitignore` already excludes `node_modules/` and all secrets.)
3. vercel.com → **Add New → Project** → *Import* your `vaagai-26` repo.
4. Framework Preset: **Other** (auto-detected) · Root Directory: `./` ·
   Build Command: *leave empty* · Output Directory: `public` (from vercel.json).
5. Click **Deploy**. (Add the env vars from step 4 below, then redeploy.)
   After that, every push to `main` redeploys automatically; PRs get preview URLs.

> If you instead push the whole export (both folders) to one repo, set
> Vercel → Settings → Root Directory = `vaagai-26-vercel`.

## 2. Create the free database (Upstash Redis) — 3 minutes

1. Go to **upstash.com** → sign in (free, no credit card).
2. *Create Database* → name `vaagai26` → Region: pick the one closest
   (e.g. `ap-south-1` Mumbai / Global).
3. In the database page scroll to **REST API** → copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

## 3. Create the mail app password (Gmail) — 2 minutes

Using **vaagai2k26@gmail.com**:
1. myaccount.google.com → **Security** → enable **2-Step Verification**.
2. Search **App Passwords** → create one for *Mail* → copy the 16-char code.

## 4. Set environment variables

Vercel → your project → **Settings → Environment Variables** (Production +
Preview):

| Key | Value |
|---|---|
| `ADMIN_EMAIL` | your admin login email |
| `ADMIN_PASSWORD` | strong admin password |
| `ADMIN_SECRET` | long random string (signs admin tokens) |
| `UPSTASH_REDIS_REST_URL` | from step 2 |
| `UPSTASH_REDIS_REST_TOKEN` | from step 2 |
| `EMAIL_USER` | `vaagai2k26@gmail.com` (sends mail) |
| `EMAIL_PASS` | 16-char app password from step 3 |
| `CONTACT_TO` | `vaagai2k26@gmail.com` (receives contact form) |
| `GOOGLE_SHEETS_ID` | `1xNgjW0muXdapmnhfXS28-mJATrnRnaRcyQRRi6jmyF0` (the registration spreadsheet ID, from its URL) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | service-account e-mail (see "Google Sheets sync" below) |
| `GOOGLE_PRIVATE_KEY` | service-account private key (see "Google Sheets sync" below) |

Then **Deployments → ⋯ → Redeploy** so the function picks them up.

## 3b. Google Sheets sync (optional but recommended)

Makes `/admin/panel` write every registration straight into [the registration
spreadsheet](https://docs.google.com/spreadsheets/d/1xNgjW0muXdapmnhfXS28-mJATrnRnaRcyQRRi6jmyF0/edit)
— no more exporting the Excel file. When configured:

- **New registration** → a row is appended automatically (Team Name, Team ID,
  Registration ID, Name, Email, Phone, College, Department, Year, Events,
  Amount, UTR, Payment Status, Attendance, Verified By, Verified At, Registered At).
- **Verify / Undo payment, attendance, +Add Event, Delete** → the row updates in place.
- **"⟳ Sync Sheets" button** (next to Export Excel) → one-click full upsert,
  including registrations created before the feature was switched on.

One-time setup:

1. <https://console.cloud.google.com> → create a project (free).
2. **APIs & Services → Library** → enable **Google Sheets API**.
3. **APIs & Services → Credentials → Create credentials → Service account**
   (name doesn't matter; skip permissions) → open it → **Keys → Add key →
   Create new key → JSON** → the key file downloads.
4. Open the JSON file: copy `client_email` → that is `GOOGLE_SERVICE_ACCOUNT_EMAIL`;
   copy `private_key` → that is `GOOGLE_PRIVATE_KEY` (paste the whole thing,
   including the `-----BEGIN PRIVATE KEY-----` lines — the `\n` sequences can
   stay as-is).
5. Open the spreadsheet → **Share** → add the service-account e-mail as **Editor**.
6. Add the three `GOOGLE_*` env vars above → **Redeploy** → in the panel hit
   **⟳ Sync Sheets** once.

Notes: rows go to a **"Registrations"** tab that the sync creates itself — the
rest of the spreadsheet (e.g. form-response tabs) is never touched. If that tab
name is taken by something else, set `GOOGLE_SHEETS_TAB` to a fresh name.
Until the env vars are set the feature stays off and the button reports exactly
that — nothing else changes.

## 5. Verify the live site

| Check | URL |
|---|---|
| Site loads | `https://<your-app>.vercel.app/` |
| Admin panel | `https://<your-app>.vercel.app/admin` (ADMIN_EMAIL/PASSWORD) |
| Payment screenshots | `/admin/panel` → Registrations → **🧾 Screenshot** button on each row (lightbox with ID / UTR / amount, plus Verify / Undo) |
| API healthy | `https://<your-app>.vercel.app/api/admin/event-count` → `401 Admin login required` |
| Crash-proof | wrong admin password → `401` JSON, site stays up |

Optional: add your custom domain in *Settings → Domains*.

---

## ⚠️ Vercel-specific limits (know these)

| Limit | Detail | Mitigation |
|---|---|---|
| **Request body ≤ 4.5 MB** | Serverless functions reject bigger uploads (client says "max 5 MB"). Screenshots between ~4.3–5 MB fail. | Payment screenshots are normally ≪ 1 MB; server already returns a clean message. |
| **No local disk** | That's why data lives in Upstash Redis. | Set the two Redis env vars — without them data is per-instance memory (lost on cold start). |
| **Screenshot entry cap** | Screenshots are stored in Redis only if ≤ ~750 KB (base64). Bigger ones keep metadata (`has_screenshot: true`) and are logged. | Ask students to keep screenshots small; admin view endpoint returns 404 for unstored ones. |
| **Cold starts** | First request after idle ≈ 0.3–1 s. | Normal for serverless; harmless here. |

## Local development

```bash
npm install
npm start        # http://localhost:3000 — full site + API, file-based data
```

## What's inside

```
vaagai-26-vercel/
├── api/
│   ├── index.js    ← entire API as one Vercel function (Express app export)
│   ├── register.js ← registration endpoint (multipart + screenshot)
│   ├── sheets.js   ← Google Sheets sync (service account, no deps)
│   └── store.js    ← Upstash Redis (REST) + file/memory fallback
├── public/         ← the exact site currently live (HTML/JS/CSS/logos)
├── tools/          ← jsdom verification scripts (node tools/verify-*.mjs)
├── vercel.json     ← routing: /api/* → function, everything else → SPA
└── package.json
```

Status strings the admin panel depends on (do not change):
`payment_status`: `PENDING_VERIFICATION` → `VERIFIED` ·
`attendance_status`: `PENDING` → `VERIFIED`.
