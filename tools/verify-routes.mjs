/**
 * PHANTASM'27 — route smoke test
 * Mounts every route of the shipped bundle in jsdom (with all linked stylesheets
 * parsed by the browser engine) and fails on any uncaught error or blank render,
 * so the registration edits can be proven not to affect the rest of the site.
 *
 * Run:  node tools/verify-routes.mjs
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const html = readFileSync(join(pub, 'index.html'), 'utf8');
const scriptSrc = (html.match(/<script[^>]*src="(\/assets\/index-[^"]+\.js)"/) || [])[1];
const sheetHrefs = [...html.matchAll(/<link rel="stylesheet"[^>]*href="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
const bundle = readFileSync(join(pub, scriptSrc), 'utf8');
const css = sheetHrefs.map((h) => readFileSync(join(pub, h), 'utf8'));

const ROUTES = [
  ['/', /PHANTASM/i],
  ['/events', /event/i],
  ['/register', /Register/],
  ['/payment', /.{10,}/],
  ['/success', /.{10,}/],
  ['/pending', /.{10,}/],
  ['/contact', /Touch|Contact/i],
  ['/admin', /.{10,}/],
  ['/syn2026', /.{10,}/],
];

let bad = 0;
for (const [route, expect] of ROUTES) {
  const noise = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => noise.push(e.detail?.message || e.message));
  vc.on('error', (m) => noise.push(String(m).slice(0, 160)));
  const dom = new JSDOM(`<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>`, {
    url: `http://localhost${route}`, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  });
  const { window } = dom;
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  window.matchMedia = () => ({ matches: false, media: '', addEventListener() {}, removeEventListener() {} });
  window.Element.prototype.scrollIntoView = () => {};
  window.scrollTo = () => {};
  window.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' });
  for (const style of css) {
    const el = window.document.createElement('style');
    el.textContent = style;
    window.document.head.appendChild(el);
  }
  const tag = window.document.createElement('script');
  tag.textContent = bundle;
  window.document.body.appendChild(tag);
  await new Promise((r) => setTimeout(r, 350));
  const text = window.document.getElementById('root').textContent.replace(/\s+/g, ' ');
  const fatal = noise.filter((n) => !/Could not load|Not implemented/i.test(n));
  const ok = window.document.getElementById('root').childElementCount > 0 && expect.test(text) && fatal.length === 0;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${route.padEnd(10)} ${text.length} chars rendered${fatal.length ? `  → ${fatal[0].slice(0, 140)}` : ''}`);
}
console.log(bad ? `\n${bad} route(s) broken` : '\nall routes render cleanly');
process.exit(bad ? 1 : 0);
