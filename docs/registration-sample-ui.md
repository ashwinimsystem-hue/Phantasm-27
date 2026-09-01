# Registration page — sample UI + single standard fee

**Scope:** `/register` (React bundle `public/assets/index-BVThDX27.js`), one new
stylesheet layer, and the asset list in `public/index.html`.

## Why

FREE / "Register for Free" had been hidden repeatedly at runtime
(`phantasm-registration-free-label-fix.js`, `phantasm-standard-fee-display-v2.js`
DOM-patched the React tree, which caused flicker and could fight React state), while
the bundle still *computed* a ₹0 total: the old code waived the fee for
`gender === "Female"` on SOLO Technical/Workshop events and, whenever the total hit
₹0, skipped the payment step entirely and posted a synthetic `FREE-<timestamp>` UTR.
The visual layer had also grown into a dozen stacked override sheets fighting each
other for the same elements.

Both problems are now fixed at the source.

## What changed

### 1 · Pricing — one standard fee, always payable

| Bundle site | Before | After |
| --- | --- | --- |
| total calculation | gender-based waiver forced the fee to `0` | `U = L.fee?.[mode]` — gender is never a pricing input |
| event card | `₹200 ~~struck~~ FREE` | `Fee: ₹200` / `SOLO ₹200 · TEAM ₹400` |
| submit CTA | `W === 0 ? "Register for Free" : "Pay & Register ₹N"` | `Pay & Register ₹N` (plain `Register` while nothing is selected) |
| submit handler | `if (W === 0)` → POST `/api/register` with `FREE-<ts>` UTR, skip payment | always hands off to `/payment` (UPI + UTR + screenshot) |
| success page | amount rendered as `FREE` when `0` | `₹<amount>` |

This matches the server, which was already authoritative and gender-neutral
(`api/pricing.js`).

### 2 · Markup — labelled sections instead of inline-styled inputs

The registration component now renders the structure the sample page uses:

```
.container.section.register-page
  header.reg-head            → .reg-kicker · h1.Registertitle · .reg-rule · .reg-sub · .already-team
  .Formcontainer.register-frame
    form
      section.reg-section    → .reg-section-title + .reg-grid of label.reg-field (label + control)
      section.reg-section    → team name (only while a team event is selected)
      section.reg-section    → .reg-search · .reg-tabs · h3.register-category-title · .reg-cards
                                each card = .event-card.reg-card (.reg-card-head, .reg-card-fee, .reg-card-mode)
      section.reg-summary    → .reg-summary-note · .reg-total · button.btn.reg-submit
```

Cards are keyboard-operable (`role="button"`, `tabindex`, Enter/Space) and announce
selection via `aria-pressed`; the "Selected / Tap to select" chip replaces the old
cyan border.

### 3 · One visual layer: `public/assets/phantasm-registration-sample.css`

Translates the approved sample (`index (2).html` + `style.css`) onto the form:
ink `#090705` ground, gold `#c8922a / #d9a441 / #e8c06a`, parchment `#f0e2c4` text,
Cormorant Garamond display type with Inter for UI, the certificate frame with the
maroon top-glow, hairline gold rules, 999px pill tabs and gold gradient CTA.
Responsive: 4→2→1 field columns, 3→2→1 cards, stacked summary; `prefers-reduced-motion` respected.

Every rule is rooted at `#root .register-page` so it cannot lose a cascade fight to an
older sheet, and it is linked **last** in `public/index.html`.

### 4 · Superseded layers unlinked (files kept on disk for reference)

CSS removed from `public/index.html`: `registration-page-v3.css`,
`phantasm-registration-final.css`, `phantasm-registration-alignment-v1.css`,
`phantasm-registration-pc-alignment-v1.css`, `phantasm-registration-pricing-ui.css`,
`phantasm-mobile-registration-step4.css`.

Scripts removed: `gender-neutral-pricing.js` (no-op),
`phantasm-standard-fee-display-v2.js` and `phantasm-registration-free-label-fix.js`
(runtime DOM patchers — nothing left for them to correct).
`phantasm-home-registration-v1.css` stays: it also styles the home-page register CTA.

## Re-applying / verifying

The bundle is a generated artifact, so the edits are expressed as a replayable patch:

```bash
node tools/patch-registration.mjs     # anchors on the shipped bundle, refuses to double-apply
node --check public/assets/index-BVThDX27.js
node tools/verify-cascade.mjs         # 45 assertions: mount, cascade winner per property, no FREE copy
node tools/smoke-register.mjs         # behaviour: selection, totals, gender-independence, mode picker
node tools/verify-routes.mjs          # every route still mounts with no runtime error
```

`verify-cascade.mjs` resolves the cascade from the stylesheet text (importance →
specificity → source order) rather than trusting `getComputedStyle`, because jsdom
drops rules containing `var()` inside shorthands and would report a false loss.
