/** Regression coverage using the shipped bundle AND its production repair scripts. */
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { calculateCanonicalAmount, RULES } = require('../api/pricing');
const read = (path) => readFileSync(new URL('../public/' + path, import.meta.url), 'utf8');
const html = read('index.html');
const scripts = [...html.matchAll(/<script[^>]*src="\/([^"]+)"/g)].map(m => m[1]);
const pause = () => new Promise(resolve => setTimeout(resolve, 200));
for (const mobile of [false, true]) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM('<div id="root"></div>', {
    url: 'https://phantasmgceb.in/events', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  });
  const w = dom.window;
  w.HTMLCanvasElement.prototype.getContext = () => null;
  w.matchMedia = () => ({ matches: mobile, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.scrollTo = w.Element.prototype.scrollIntoView = () => {};
  w.fetch = async () => ({ ok: true, json: async () => ({}) });
  for (const src of scripts) w.eval(read(src));
  await pause();
  const cards = [...w.document.querySelectorAll('.events-page .event-card')];
  assert.equal(cards.length, 12);
  assert.doesNotMatch(w.document.body.textContent, /\b(mehandi|mehndi|mehendi|henna)\b/i);
  let tested = 0;
  for (const card of cards) {
    const button = [...card.querySelectorAll('button')].find(b => b.textContent === 'Rules & Judging');
    if (!button) continue;
    // The old capture guard cancelled keyboard and pointer events alike.
    assert(button.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    button.click();
    await pause();
    const modal = w.document.querySelector('.rules-modal');
    assert(modal, 'Rules button must open modal');
    assert(modal.querySelectorAll('li').length > 0);
    assert.match(modal.textContent, /Judging Criteria/);
    modal.querySelector('button').click();
    await pause();
    assert.equal(w.document.querySelector('.rules-modal'), null);
    tested++;
  }
  assert(tested >= 7);
  const details = [...cards[0].querySelectorAll('button')].find(b => b.textContent === 'View Details');
  details.click(); await pause();
  assert(cards[0].querySelector('.event-details.open'));
  details.click(); await pause();
  assert.equal(cards[0].querySelector('.event-details.open'), null);
  assert.equal(cards[0].querySelectorAll('a[href="/register"]').length, 1);
  assert.deepEqual(errors, []);
  dom.window.close();
  console.log(`✓ ${mobile ? 'Mobile' : 'Desktop'}: ${tested} rules dialogs, close, details toggle, registration link`);
}
for (const title of ['Mehandi', 'Mehndi', 'Mehendi', 'Henna', 'Mehandi Chess', 'ch']) {
  assert.equal(calculateCanonicalAmount({ eventList: [title] }).fullyKnown, false);
}
for (const rule of RULES) for (const alias of rule.aliases) {
  assert.equal(calculateCanonicalAmount({ eventList: [alias] }).fullyKnown, true);
}
assert.equal(RULES.length, 12);
console.log('✓ Disabled/unknown events rejected; all supported pricing aliases accepted');

// Home CTAs deliberately use full navigation: the legacy mobile hero moves
// React-owned nodes, so an SPA unmount is unsafe. jsdom reports navigation
// attempts rather than following them; assert both that attempt and its href.
for (const mobile of [false, true]) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM('<div id="root"></div>', {
    url: 'https://phantasmgceb.in/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  });
  const w = dom.window;
  w.HTMLCanvasElement.prototype.getContext = () => null;
  w.matchMedia = () => ({ matches: mobile, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.scrollTo = w.Element.prototype.scrollIntoView = () => {};
  w.fetch = async () => ({ ok: true, json: async () => ({}) });
  for (const src of scripts) w.eval(read(src));
  await pause();
  const link = [...w.document.querySelectorAll('a')].find(el => el.textContent === 'View Events');
  assert(link);
  assert.equal(link.getAttribute('href'), '/events');
  link.click();
  assert.equal(errors.filter(e => /navigation/i.test(e)).length, 1, 'Exactly one navigation attempt');
  assert.deepEqual(errors.filter(e => !/navigation/i.test(e)), []);
  dom.window.close();
  console.log(`✓ ${mobile ? 'Mobile' : 'Desktop'}: View Events navigation`);
}
