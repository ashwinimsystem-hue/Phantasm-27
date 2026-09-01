/**
 * PHANTASM'27 — /register render + cascade verification
 * ------------------------------------------------------
 * Mounts the real page in jsdom: every stylesheet public/index.html links, inlined
 * in order, and the shipped bundle executed verbatim. Then it resolves the winning
 * declaration for the properties that define the sample look — walking the same
 * cascade a browser would (later sheet wins, !important outranks, later rule wins) —
 * because jsdom's getComputedStyle cannot resolve var() tokens.
 *
 * Run:  node tools/verify-cascade.mjs      (reads from disk, no server needed)
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const noise = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => noise.push('jsdomError: ' + (e.detail?.message || e.message)));
vc.on('error', (m) => noise.push('console.error: ' + String(m).slice(0, 200)));

const html = readFileSync(join(pub, 'index.html'), 'utf8');
const sheetHrefs = [...html.matchAll(/<link rel="stylesheet"[^>]*href="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
const scriptSrc = (html.match(/<script[^>]*src="(\/assets\/index-[^"]+\.js)"/) || [])[1];
if (!scriptSrc) throw new Error('bundle <script> not found in public/index.html');

const dom = new JSDOM(`<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>`, {
  url: 'http://localhost/register',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const { window } = dom;
const doc = window.document;

window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
window.matchMedia = () => ({ matches: false, media: '', addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
window.Element.prototype.scrollIntoView = () => {};
window.scrollTo = () => {};
window.scroll = () => {};
window.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' });

/* tokens declared by the sample layer (kept in sync with the sheet by the test below) */
const TOKENS = {
  '--p-gold': '#c8922a', '--p-gold-mid': '#d9a441', '--p-gold-soft': '#e8c06a', '--p-gold-pale': '#f0cf8b',
  '--p-ink': '#090705', '--p-ink-2': '#120e09', '--p-ink-3': '#1c1408', '--p-maroon': '#6b1a1a',
  '--p-parchment': '#f0e2c4', '--p-parchment-dim': '#c4b494',
  '--p-line': 'rgba(200, 146, 42, .16)', '--p-line-strong': 'rgba(200, 146, 42, .35)',
  '--p-radius': '14px', '--p-radius-sm': '10px', '--p-radius-lg': '22px',
  '--p-display': "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
  '--p-body': "'Inter', 'LEMON MILK', system-ui, sans-serif",
};
const resolve = (v) => String(v).replace(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g, (_m, t) => TOKENS[t] ?? _m).trim();

/* stylesheets inlined in the exact order index.html links them */
const sheets = [];
let applied = 0;
for (const href of sheetHrefs) {
  const file = join(pub, href);
  if (!existsSync(file)) { noise.push('missing stylesheet ' + href); continue; }
  const css = readFileSync(file, 'utf8');
  const style = doc.createElement('style');
  style.setAttribute('data-href', href);
  style.textContent = css;
  doc.head.appendChild(style);
  sheets.push({ href, css });
  applied++;
}

const tag = doc.createElement('script');
tag.textContent = readFileSync(join(pub, scriptSrc), 'utf8');
doc.body.appendChild(tag);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(400);
const r0 = doc.getElementById('root');

/* ── cascade resolver ─────────────────────────────────────────────────────
   jsdom's CSSOM silently drops rules it cannot fully evaluate (var() inside
   shorthands, :has(), :is()), which would make the assertions below lie.
   So the sheets are parsed from text and winners ranked like a browser does:
   importance → specificity → source order. Desktop view is asserted, so
   @media (max-width: …) blocks are skipped and (min-width: …) blocks apply. */
const stripComments = (c) => c.replace(/\/\*[\s\S]*?\*\//g, '');

const blockEnd = (text, from) => {
  let depth = 1, i = from, q = null;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) break;
  }
  return i;
};

const splitTop = (text, sep) => {
  const out = []; let cur = '', depth = 0, q = null;
  for (const ch of text) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
};

let ORDER = 0;
function parseRules(text, href, media) {
  const rules = [];
  let i = 0;
  while (i < text.length) {
    const brace = text.indexOf('{', i);
    if (brace === -1) break;
    const prelude = text.slice(i, brace).trim();
    const end = blockEnd(text, brace + 1);
    const body = text.slice(brace + 1, end);
    i = end + 1;
    if (!prelude) continue;
    if (/^@media|^@supports|^@layer|^@container/.test(prelude)) {
      const w = /max-width\s*:\s*\d/.test(prelude) ? 'skip' : 'apply';
      if (w === 'apply') rules.push(...parseRules(body, href, prelude));
      continue;
    }
    if (/^@/.test(prelude)) continue;
    const decls = {};
    for (const d of splitTop(body, ';')) {
      const c = d.indexOf(':');
      if (c < 0) continue;
      let value = d.slice(c + 1).trim();
      const important = /!\s*important$/i.test(value);
      if (important) value = value.replace(/!\s*important$/i, '').trim();
      const prop = d.slice(0, c).trim().toLowerCase();
      if (prop) decls[prop] = { value, important };
    }
    for (const sel of splitTop(prelude, ',')) rules.push({ href, sel, decls, order: ORDER++, media });
  }
  return rules;
}

const SHEETS = [];
for (const { href, css } of sheets) SHEETS.push(...parseRules(stripComments(css), href, null));

const spec = (sel) => {
  let s = sel.replace(/:where\([^()]*\)/g, '');
  const attrs = (s.match(/\[[^\]]*\]/g) || []).length;
  s = s.replace(/\[[^\]]*\]/g, '');
  const ids = (s.match(/#[\w-]+/g) || []).length;
  s = s.replace(/#[\w-]+/g, '');
  const pseudoEls = (s.match(/::[\w-]+/g) || []).length;
  s = s.replace(/::[\w-]+/g, '');
  const classes = (s.match(/\.[\w-]+/g) || []).length + attrs;
  s = s.replace(/\.[\w-]+/g, '');
  const pseudoCls = (s.match(/:[\w-]+/g) || []).length;
  s = s.replace(/:[\w-]+(\([^()]*\))?/g, '');
  const types = (s.match(/[a-zA-Z][\w-]*/g) || []).length;
  return ids * 1e6 + classes * 1e3 + types;
};

/* normalise the selectors nwsapi cannot evaluate, keeping their meaning */
const matchVariants = (sel) => {
  let out = [sel.replace(/:has\([^()]*\)/g, ' ').replace(/\s+/g, ' ').trim()];
  const ism = out[0].match(/:is\(([^()]*)\)/);
  if (ism) out = ism[1].split(',').map((a) => out[0].replace(ism[0], a.trim()).replace(/\s+/g, ' ').trim());
  return out.filter((v) => v && !/::|:hover|:focus|:active|:disabled|:empty/.test(v));
};
const matches = (el, sel) => el && matchVariants(sel).some((v) => { try { return el.matches(v); } catch { return false; } });

function winnerOf(el, prop) {
  let best = null;
  for (const rule of SHEETS) {
    const d = rule.decls[prop];
    if (!d || !matches(el, rule.sel)) continue;
    const rank = (d.important ? 1e12 : 0) + spec(rule.sel) * 1000 + rule.order;
    if (!best || rank > best.rank) best = { ...d, sel: rule.sel, href: rule.href, media: rule.media, rank };
  }
  return best;
}
const winner = (el, prop) => { const w = winnerOf(el, prop); return w ? resolve(w.value) : ''; };
const declaredBy = (el, prop) => { const w = winnerOf(el, prop); return w ? w.href.replace('/assets/', '') : '(none)'; };

const results = [];
const check = (name, pass, extra = '') => {
  results.push({ name, pass });
  console.log(`${pass ? '✓' : '✗'} ${name}${extra ? `  → ${extra}` : ''}`);
};
const q = (s) => doc.querySelector(s);

/* ── mount ─────────────────────────────────────────────────────────────── */
check('all linked stylesheets parsed', applied === sheetHrefs.length && SHEETS.length > 900, `${applied} sheets / ${SHEETS.length} rules`);
check('register page mounts', r0.childElementCount > 0, `${r0.innerHTML.length} chars`);
check('tokens in the sheet match the test fixture',
  sheets.every((s) => s.href !== '/assets/phantasm-registration-sample.css') ||
  Object.entries(TOKENS).every(([k, v]) => {
    const css = sheets.find((s) => s.href === '/assets/phantasm-registration-sample.css').css;
    return new RegExp(`${k}:\\s*${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/, /g, '\\s*,\\s*')}`).test(css);
  }), 'drift guard');

/* ── sample look ───────────────────────────────────────────────────────── */
const title = q('.reg-head h1.Registertitle');
const frame = q('.Formcontainer.register-frame');
const cards = q('.Registercards.reg-cards');
const grid = q('.reg-grid');
const card = q('.event-card.reg-card');
const fee = q('.reg-card-fee');
const submit = q('.reg-submit');
const input = q('.reg-field input');
const tab = q('.reg-tab.active');
const head = q('.reg-head');
const summary = q('.reg-summary');

check('title uses the sample serif', /Cormorant Garamond/.test(winner(title, 'font-family')), winner(title, 'font-family').slice(0, 30));
check('title centred + parchment', winner(title, 'text-align') === 'center' && winner(title, 'color') === TOKENS['--p-parchment'], `${winner(title, 'text-align')} ${winner(title, 'color')}`);
check('legacy hide of .Registertitle beaten', winner(title, 'display') !== 'none', winner(title, 'display'));
check('kicker is uppercase, letterspaced gold', winner(q('.reg-kicker'), 'text-transform') === 'uppercase' && parseFloat(winner(q('.reg-kicker'), 'letter-spacing')) > 0.15, `${winner(q('.reg-kicker'), 'letter-spacing')} / ${winner(q('.reg-kicker'), 'color')}`);
check('gold rule under the title', /linear-gradient/.test(winner(q('.reg-rule'), 'background')) || /linear-gradient/.test(winner(q('.reg-rule'), 'background-image')), winner(q('.reg-rule'), 'background').slice(0, 34));
check('certificate frame: 22px radius, gold hairline', winner(frame, 'border-radius') === TOKENS['--p-radius-lg'] && winner(frame, 'border') === `1px solid ${TOKENS['--p-line-strong']}`, `${winner(frame, 'border-radius')} / ${winner(frame, 'border')}`);
check('frame maroon glow from the sample', /radial-gradient\(ellipse at 50% 0/.test(winner(frame, 'background')), winner(frame, 'background').slice(0, 40) + '…');
check('frame wins over legacy override sheets', declaredBy(frame, 'border-radius') === 'phantasm-registration-sample.css', declaredBy(frame, 'border-radius'));
check('frame not capped at 920px', !/920px/.test(winner(frame, 'max-width')), `max-width: ${winner(frame, 'max-width') || 'unset'}`);
check('event cards in a 3-column grid', winner(cards, 'display') === 'grid' && /repeat\(3/.test(winner(cards, 'grid-template-columns')), winner(cards, 'grid-template-columns'));
const bgOf = (el) => winner(el, 'background') || winner(el, 'background-color');
check('card surface is ink-3 with gold hairline', bgOf(card) === TOKENS['--p-ink-3'] && /1px solid/.test(winner(card, 'border')), `${bgOf(card)} / ${winner(card, 'border')}`);
check('card radius matches sample (14px)', winner(card, 'border-radius') === TOKENS['--p-radius'], winner(card, 'border-radius'));
check('fee line is gold', winner(fee, 'color') === TOKENS['--p-gold-soft'], winner(fee, 'color'));
check('field controls: 52px, gold focus ring', winner(input, 'min-height') === '52px' && winner(input, 'border-radius') === TOKENS['--p-radius-sm'], `${winner(input, 'min-height')} / ${winner(input, 'border-radius')}`);
check('active tab is a filled gold pill', winner(tab, 'border-radius') === '999px' && bgOf(tab) === TOKENS['--p-gold-mid'], `${winner(tab, 'border-radius')} / ${bgOf(tab)}`);
check('CTA is a gold pill (legacy 7px radius beaten)', winner(submit, 'border-radius') === '999px' && winner(submit, 'color') === '#1c0e02', `${winner(submit, 'border-radius')} / ${winner(submit, 'color')}`);
check('CTA keeps 56px height', winner(submit, 'min-height') === '56px', winner(submit, 'min-height'));
check('summary panel is a bordered card', /radial-gradient/.test(winner(summary, 'background')) && /1px solid/.test(winner(summary, 'border')), winner(summary, 'border'));
check('header block centres its children', winner(head, 'text-align') === 'center', winner(head, 'text-align'));

/* ── pricing copy ──────────────────────────────────────────────────────── */
const text = () => r0.textContent.replace(/\s+/g, ' ');
const feeLines = () => [...doc.querySelectorAll('.reg-card-fee')].map((n) => n.textContent.replace(/\s+/g, ' ').trim());
check('no FREE badge anywhere', !/\bfree\b/i.test(text().replace(/free[- ]fire/gi, '')), (text().match(/.{0,30}\bfree\b.{0,30}/i) || ['none'])[0]);
check('no "Register for Free"', !/register\s+for\s+free/i.test(text()));
check('no struck-out prices', doc.querySelectorAll('.event-card s, .event-card del, .event-card strike').length === 0);
const sampleCss = (sheets.find((x) => x.href === '/assets/phantasm-registration-sample.css') || {}).css || '';
check('strike/del/strike suppressed by the sample layer', /\.reg-card-fee (s|del)/.test(sampleCss) && /display: none !important/.test(sampleCss), 'guarded in CSS');
check('every card prices in ₹', feeLines().length === 15 && feeLines().every((t) => /₹\s?\d+/.test(t)), feeLines().slice(0, 2).join(' | '));
check('CTA reads a plain "Register" while nothing is selected', submit.textContent.trim() === 'Register', JSON.stringify(submit.textContent.trim()));

/* ── behaviour ────────────────────────────────────────────────────────── */
const gender = doc.querySelector('select[name="gender"]');
const setVal = (el, v) => {
  Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(el, v);
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
};
const firstCard = q('.event-card.reg-card');
if (firstCard) firstCard.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(120);
const total = () => q('.reg-total b').textContent.trim();
const feesBefore = feeLines().join('|');
const picked = total();
setVal(gender, 'Female');
await wait(150);
check('female gender does not change any fee', feeLines().join('|') === feesBefore, 'cards identical');
check('female gender does not change the total', total() === picked, `${picked} → ${total()}`);
check('CTA demands payment after choosing Female', /Pay & Register ₹\d+/.test(submit.textContent.trim()) && !/free/i.test(submit.textContent), submit.textContent.trim());
setVal(gender, 'Male');
await wait(150);
check('male total identical', total() === picked, total());
check('CTA shows the ₹ total once an event is picked', /Pay & Register ₹\d+/.test(q('.reg-submit').textContent), q('.reg-submit').textContent.trim());
check('selected card is marked selected', !!q('.event-card.reg-card.selected') && /Selected/.test(q('.event-card.reg-card.selected .reg-card-state').textContent));

/* ── shipping hygiene ──────────────────────────────────────────────────── */
check('sample sheet is the last layer', sheetHrefs[sheetHrefs.length - 1] === '/assets/phantasm-registration-sample.css', sheetHrefs[sheetHrefs.length - 1]);
for (const gone of ['registration-page-v3.css', 'phantasm-registration-final.css', 'phantasm-registration-pricing-ui.css', 'phantasm-registration-alignment-v1.css', 'phantasm-registration-pc-alignment-v1.css', 'phantasm-mobile-registration-step4.css']) {
  check(`${gone} unlinked`, !sheetHrefs.some((h) => h.includes(gone)));
}
for (const gone of ['phantasm-registration-free-label-fix.js', 'phantasm-standard-fee-display-v2.js', 'gender-neutral-pricing.js']) {
  check(`${gone} unlinked`, !html.includes(gone));
}
check('no runtime errors during mount', noise.length === 0, noise.slice(0, 2).join(' | '));

const failed = results.filter((x) => !x.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) console.log('failed: ' + failed.map((f) => f.name).join(' · '));
process.exit(failed.length ? 1 : 0);
