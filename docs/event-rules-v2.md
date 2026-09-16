# Event rules refresh — Sep 2026 poster set

## What was updated

The organisers published 8 updated rulebook PDFs. They now live at the repo
root under the canonical names (the names the verification mailer attaches):

| New upload (removed after swap) | Canonical file (emailed as guide) |
|---|---|
| `Paper_presentation.pdf` | `VAAGAI26_PAPER_PRESENTATION.pdf` |
| `WATER ROCKET.pdf` | `VAAGAI26_WATER_ROCKETRY.pdf` |
| `TECHNICAL QUIZ.pdf` | `VAAGAI26_TECHNICAL_QUIZ.pdf` |
| `CAD MODELLING.pdf` | `VAAGAI26_CAD_MODELLING.pdf` |
| `ANSYS SIMULATION.pdf` | `VAAGAI26_ANSYS_SIMULATION.pdf` |
| `GLIDER COMPETITION.pdf` | `VAAGAI26_GLIDER_COMPETITION.pdf` |
| `LINE FOLLOWER.pdf` | `VAAGAI26_LINE_FOLLOWER.pdf` |
| `non technical poster.pdf` | `VAAGAI26_NON_TECHNICAL.pdf` |

Each technical PDF has 2 pages (cover poster + rules/judging/prizes/
coordinators). The non-technical PDF has 6 pages (one poster per event, no
rules text). Old PDFs are preserved in git history. Total 13.2 MB — under
the 14 MB per-mail attachment cap (`MAX_GUIDE_BYTES` in `api/index.js`).

The on-site rules modals show the same updated wording via
`public/assets/phantasm-event-rules-v2.js` (the bundle is prebuilt and
cannot be edited, so this runtime patch replaces the lists in place):

- Paper Presentation, CAD Modeling, ANSYS Simulation Challenge, Technical
  Quiz, Water Rocketry, Glider Competition, Line Follower — rules + judging
  replaced verbatim from the posters. The old IEEE rule is gone from both
  the poster and the site (the earlier IEEE-stripping patch stays as a
  harmless no-op safety net).
- IPL Auction — the bundle displayed **Treasure Hunt rules here by mistake**
  and the poster set has no IPL rules text, so the modal's rules/judging
  lists AND the card's inline judging block are removed (prizes/date/fee/
  team size kept) and the card's "Rules & Judging" button is hidden until
  real IPL rules are supplied.
- The 7 technical events are patched in **both** places the bundle renders
  judging: the modal and the card's inline "View Details" block, so the two
  can never contradict each other.
- Carrom / Chess / Free Fire / Treasure Hunt — untouched (posters carry no
  replacement rules text for non-technical events).

## Deliberately NOT changed — needs organiser decision

The posters disagree with the website on money, dates and one event. These
were left exactly as-is because changing them affects payments and existing
registrations:

| # | Poster says | Website says |
|---|---|---|
| 1 | Technical Quiz ₹100 **per head** | ₹100 flat per team |
| 2 | Treasure Hunt ₹50 **per head** | ₹100 flat per team |
| 3 | IPL Auction ₹200 **per team** | ₹100 per team |
| 4 | Chess ₹100 **per head**, **17 Sep** | ₹50 solo, 18 Sep |
| 5 | Free Fire ₹200 **per team** | ₹100 per team |
| 6 | Carrom ₹200 **for duo**, **17 Sep** | ₹100 per team, 18 Sep |
| 7 | **Mehendi** competition ₹30/head (girls only), 18 Sep | Event does not exist on the site |

Per-head pricing cannot be silently applied: the registration form does not
collect team-member counts for these events, and existing paid registrations
would instantly look underpaid. Confirm the intended fees/team sizes first —
then pricing (`api/pricing.js` + site display) and the Mehendi event (site +
pricing + guide mapping) can follow in a separate change.
