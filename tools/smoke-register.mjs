/**
 * PHANTASM'27 — registration smoke test (jsdom)
 * Renders the patched bundle at /register and asserts:
 *   · the page mounts (no runtime error)
 *   · no FREE / "Register for Free" copy anywhere
 *   · fee lines show standard rupee prices for every gender
 *   · the sample-UI structure (labelled fields, cards, summary) is present
 * Run: node tools/smoke-register.mjs
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = readFileSync(join(root, 'public/assets/index-BVThDX27.js'), 'utf8');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + e.message));
vc.on('error', (m) => errors.push('console.error: ' + m));

const dom = new JSDOM(
  `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>`,
  { url: 'http://localhost/register', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc }
);
const { window } = dom;

/* environment shims the site expects in a browser */
window.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' });
window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
window.IntersectionObserver = window.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
window.scrollTo = () => {};
window.Element.prototype.scrollIntoView = () => {};

const tag = window.document.createElement('script');
tag.textContent = bundle;
window.document.body.appendChild(tag);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function click(el) {
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}
function setValue(el, value, type = 'input') {
  const proto = el.constructor;
  const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new window.Event(type, { bubbles: true }));
}

const results = [];
const check = (name, pass, extra = '') => {
  results.push({ name, pass, extra });
  console.log(`${pass ? '✓' : '✗'} ${name}${extra ? '  → ' + extra : ''}`);
};

await wait(250);
const doc = window.document;
const root1 = doc.getElementById('root');
check('page mounts', root1 && root1.childElementCount > 0, root1 ? `${root1.innerHTML.length} chars rendered` : 'empty #root');

const text = () => root1.textContent.replace(/\s+/g, ' ');   /* #root only — excludes the <script> source */

/* ── sample-UI structure ─────────────────────────────────────────────── */
check('.register-page wrapper', !!doc.querySelector('.register-page'));
check('.reg-head with kicker', !!doc.querySelector('.reg-head .reg-kicker'));
check('.register-frame card', !!doc.querySelector('.Formcontainer.register-frame'));
check('labelled fields', doc.querySelectorAll('.reg-field .reg-field-label').length >= 6, `${doc.querySelectorAll('.reg-field .reg-field-label').length} labels`);
check('field labels are real text', ['Full name', 'Email', 'Phone', 'College', 'Department', 'Year of study', 'Gender'].every((l) => text().includes(l)));
check('event cards rendered', doc.querySelectorAll('.event-card.reg-card').length > 0, `${doc.querySelectorAll('.event-card.reg-card').length} cards`);
check('gold pill tabs', doc.querySelectorAll('.reg-tab').length === 4);
check('summary + total', !!doc.querySelector('.reg-summary .reg-total') && !!doc.querySelector('.reg-submit'));

/* ── no "free" pricing anywhere ──────────────────────────────────────── */
check('no FREE badge text', !/\bFREE\b/i.test(text()), (text().match(/.{40}\bfree\b.{40}/i) || [''])[0]);
check('no "Register for Free"', !/register\s+for\s+free/i.test(text()));
check('no struck-out prices', doc.querySelectorAll('.event-card s, .event-card del, .event-card strike').length === 0);

/* ── fee is gender-independent ───────────────────────────────────────── */
const feeTexts = () => [...doc.querySelectorAll('.reg-card-fee')].map((n) => n.textContent.replace(/\s+/g, ' ').trim());
const anyZero = () => feeTexts().filter((t) => /₹0\b/.test(t));
check('every card shows a ₹ price', feeTexts().length > 0 && feeTexts().every((t) => /₹\s?\d/.test(t)), feeTexts().slice(0, 3).join(' | '));

const gender = doc.querySelector('select[name="gender"]');
click(doc.querySelector('.event-card.reg-card'));
await wait(120);
const totalOf = () => {
  const n = doc.querySelector('.reg-total b');
  return n ? n.textContent.trim() : '';
};
const feeBefore = feeTexts(),
  totalBefore = totalOf();
setValue(gender, 'Female', 'change');
await wait(160);
check('selecting a card updates total', totalBefore.startsWith('₹') && totalBefore !== '₹', `total ${totalBefore}`);
check('gender does not change fees', JSON.stringify(feeBefore) === JSON.stringify(feeTexts()), `${feeBefore.slice(0, 2)} vs ${feeTexts().slice(0, 2)}`);
check('gender does not zero the total', totalOf() === totalBefore, `${totalBefore} → ${totalOf()}`);
setValue(gender, 'Male', 'change');
await wait(160);
check('male total identical', totalOf() === totalBefore, `${totalBefore} → ${totalOf()}`);

/* submit label */
const btn = doc.querySelector('.reg-submit');
check('submit reads "Pay & Register ₹N"', /Pay & Register ₹\d+/.test(btn.textContent), JSON.stringify(btn.textContent));

/* mode select appears on a selected multi-mode card */
const cards = [...doc.querySelectorAll('.event-card.reg-card')];
const multi = cards.find((c) => /SOLO/.test(c.querySelector('.reg-card-fee')?.textContent || '') && /TEAM/.test(c.querySelector('.reg-card-fee')?.textContent || ''));
if (multi) {
  if (!multi.className.includes('selected')) click(multi);
  await wait(120);
  const sel = multi.querySelector('.reg-card-mode');
  check('mode picker on selected multi-mode card', !!sel && !/FREE/i.test(sel.textContent), sel ? sel.textContent : 'none');
}

check('no runtime errors', errors.length === 0, errors.slice(0, 3).join(' | '));

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
