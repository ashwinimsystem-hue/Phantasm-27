/**
 * PHANTASM'27 — frontend patch verification (jsdom, no browser needed).
 *
 * Loads the runtime patches against DOM fixtures shaped exactly like the
 * prebuilt bundle renders them, and asserts:
 *
 *   venue-ieee-cleanup:
 *     · the IEEE rule <li> is removed from the rules modal;
 *     · event-card / rules-modal "pin venue · date" lines keep date+fee only;
 *     · About "Venue & Date" box becomes "Event Date" with the venue line gone;
 *     · the footer contact address is NOT touched;
 *   preregister-before-payment:
 *     · saving the form draft POSTs the details to /api/pre-register once;
 *     · unknown event ids are skipped, valid ones still post;
 *     · the /payment "details saved" note appears with the returned ref;
 *   admin-mail-resend:
 *     · each matched admin row gets a working "Resend mail" button;
 *     · AWAITING_PAYMENT rows are relabelled "Awaiting payment";
 *     · unmatched rows are left completely alone.
 *
 * Run: node tools/verify-content-patches.mjs
 */
import { JSDOM } from 'jsdom';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (name) => readFileSync(join(root, 'public/assets', name), 'utf8');

let failures = 0;
const check = (name, pass, extra = '') => {
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${extra ? `  -> ${extra}` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function runScript(window, src) {
  const tag = window.document.createElement('script');
  tag.textContent = src;
  window.document.body.appendChild(tag);
}

/* ── 1. venue + IEEE cleanup ─────────────────────────────────────── */
{
  const dom = new JSDOM(
    `<!doctype html><html><body><div id="root">
      <div class="event-card"><p id="card-line"></p></div>
      <div class="rules-content"><ul id="rules">
        <li>Maximum 12 slides (excluding title and thank you slides).</li>
        <li>IEEE format recommended; original work only (plagiarism = disqualification).</li>
      </ul><p id="modal-line"></p></div>
      <div class="about-box"><h3>Venue &amp; Date</h3>
        <p>📅 SEP 17 ,18 2026</p><p>📍 MECHANICAL DEPARTMENT, GCEB</p></div>
      <footer><p>📍 Government College of Engineering</p>
        <p>NH 46, Chennai–Bangalore Highway</p></footer>
    </div></body></html>`,
    { url: 'http://localhost/events', runScripts: 'dangerously' },
  );
  const { window } = dom;
  const doc = window.document;
  // Bundle renders children arrays as adjacent text nodes — mimic exactly.
  const card = doc.getElementById('card-line');
  ['📍 ', '3rd Year Classroom', '  •  📅 ', '17-09-2026'].forEach((t) => card.appendChild(doc.createTextNode(t)));
  const modal = doc.getElementById('modal-line');
  ['📍 ', 'Cad lab', '  •  📅 ', '17-09-2026', '  •  SOLO: ₹200'].forEach((t) => modal.appendChild(doc.createTextNode(t)));

  runScript(window, load('phantasm-venue-ieee-cleanup-v1.js'));
  await wait(300);

  check('IEEE rule li removed', !doc.getElementById('rules').textContent.includes('IEEE format recommended'));
  check('other rules kept', doc.getElementById('rules').textContent.includes('Maximum 12 slides'));
  check('event card keeps date, drops venue', card.textContent === '📅 17-09-2026', JSON.stringify(card.textContent));
  check('modal keeps date+fee, drops venue', modal.textContent === '📅 17-09-2026  •  SOLO: ₹200', JSON.stringify(modal.textContent));
  check('About box retitled + venue line gone',
    doc.querySelector('.about-box h3').textContent === 'Event Date'
    && !doc.querySelector('.about-box').textContent.includes('MECHANICAL DEPARTMENT')
    && doc.querySelector('.about-box').textContent.includes('SEP 17'));
  check('footer address untouched', doc.querySelector('footer').textContent.includes('📍 Government College of Engineering'));

  // Late-mounted modal (observer path): inject a fresh card after load.
  const late = doc.createElement('p');
  late.id = 'late-line';
  ['📍 ', 'Ground', '  •  📅 ', '18-09-2026'].forEach((t) => late.appendChild(doc.createTextNode(t)));
  doc.getElementById('root').appendChild(late);
  await wait(300);
  check('observer cleans late-mounted nodes', late.textContent === '📅 18-09-2026', JSON.stringify(late.textContent));
  dom.window.close();
}

/* ── 2. pre-register before payment ───────────────────────────────── */
{
  const posts = [];
  const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
    url: 'http://localhost/register', runScripts: 'dangerously',
  });
  const { window } = dom;
  window.fetch = async (url, opts) => {
    posts.push({ url, body: JSON.parse(opts.body) });
    return { json: async () => ({ success: true, registrationId: 'REG-0042' }), status: 201 };
  };
  runScript(window, load('phantasm-preregister-before-payment-v1.js'));
  await wait(50);

  window.sessionStorage.setItem('vaagai_form_draft', JSON.stringify({
    name: 'Patch Test', email: 'patch@local.test', phone: '9111111111',
    college: 'GCE Bargur', dept: 'Mechanical', year: '2', gender: 'Female',
    teamName: 'Drafters',
    selectedEvents: [
      { eventId: 'paper-presentation', mode: 'TEAM' },
      { eventId: 'chess', mode: 'SOLO' },
      { eventId: 'some-future-event', mode: 'SOLO' },
    ],
  }));
  await wait(150);
  check('draft save POSTs to /api/pre-register', posts.length === 1 && posts[0].url === '/api/pre-register', JSON.stringify(posts.map((p) => p.url)));
  check('payload titles resolved, unknown skipped',
    posts[0]?.body.event === 'Paper Presentation, Chess'
    && posts[0]?.body.teamName === 'Drafters'
    && posts[0]?.body.eventsDetail.length === 2, JSON.stringify(posts[0]?.body.event));
  check('returned ref stored', window.sessionStorage.getItem('vaagai_prereg_id') === 'REG-0042');

  // Identical draft again -> no duplicate POST (server is idempotent anyway).
  window.sessionStorage.setItem('vaagai_form_draft', window.sessionStorage.getItem('vaagai_form_draft'));
  await wait(150);
  check('identical draft not reposted', posts.length === 1, `${posts.length} posts`);

  // Incomplete draft -> nothing posted, setItem still works natively.
  window.sessionStorage.setItem('vaagai_form_draft', JSON.stringify({ name: 'Half' }));
  await wait(150);
  check('incomplete draft ignored', posts.length === 1 && JSON.parse(window.sessionStorage.getItem('vaagai_form_draft')).name === 'Half');
  dom.window.close();
}

/* ── 2b. payment-page note ───────────────────────────────────────── */
{
  const dom = new JSDOM(`<!doctype html><html><body><div id="root">
      <div class="container section payment-page"><h1>Complete Payment</h1></div>
    </div></body></html>`, { url: 'http://localhost/payment', runScripts: 'dangerously' });
  const { window } = dom;
  window.fetch = async () => ({ json: async () => ({ success: true }), status: 200 });
  window.sessionStorage.setItem('vaagai_prereg_id', 'REG-0042');
  runScript(window, load('phantasm-preregister-before-payment-v1.js'));
  await wait(1200); // covers the deferred retries, not just first paint
  const note = window.document.getElementById('phantasm-prereg-note');
  check('payment note shows stored ref', !!note && note.textContent.includes('REG-0042'), note?.textContent || '(missing)');
  dom.window.close();
}

/* ── 3. admin resend button ──────────────────────────────────────── */
{
  const calls = [];
  const REGISTRATIONS = [
    { id: 'REG-0007', name: 'Ada Lovelace', email: 'ada@local.test', college: 'GCE Bargur', team_id: '', event: 'Chess', amount: 50, utr: 'UTRADA0001', payment_status: 'VERIFIED' },
    { id: 'REG-0008', name: 'Grace Hopper', email: 'grace@local.test', college: 'GCE Bargur', team_id: '', event: 'Carrom', amount: 100, utr: '', payment_status: 'AWAITING_PAYMENT' },
  ];
  const dom = new JSDOM(`<!doctype html><html><body><div id="root">
      <div class="admin-row header admin-grid-row"><div>Name</div></div>
      <div class="admin-row admin-grid-row" id="row-verified">
        <div>Ada Lovelace</div><div>GCE Bargur</div><div>-</div><div>Chess</div><div>₹50</div><div>UTRADA0001</div>
        <div><span class="status verified">✅ Verified</span></div><div>att</div>
        <div><button class="screenshot-btn">Shot</button></div>
      </div>
      <div class="admin-row admin-grid-row" id="row-awaiting">
        <div>Grace Hopper</div><div>GCE Bargur</div><div>-</div><div>Carrom</div><div>₹100</div><div></div>
        <div><span class="status paid">⏳ Pending</span></div><div>att</div>
        <div><button class="screenshot-btn">Shot</button></div>
      </div>
      <div class="admin-row admin-grid-row" id="row-stranger">
        <div>Unknown Person</div><div>Elsewhere</div><div>-</div><div>Chess</div><div>₹50</div><div>NOPE</div>
        <div><span class="status paid">⏳ Pending</span></div><div>att</div>
        <div><button class="screenshot-btn">Shot</button></div>
      </div>
    </div></body></html>`, { url: 'http://localhost/admin/panel', runScripts: 'dangerously' });
  const { window } = dom;
  window.fetch = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET' });
    if (String(url).includes('/api/admin/registrations')) {
      return { json: async () => ({ success: true, registrations: REGISTRATIONS }) };
    }
    if (String(url).includes('/api/admin/confirmation/resend/REG-0007')) {
      return { json: async () => ({ success: true, mailSent: true, message: 'Confirmation email re-sent.' }) };
    }
    return { json: async () => ({ success: false }) };
  };
  window.sessionStorage.setItem('vaagai_admin_token', 'test-token');
  runScript(window, load('phantasm-admin-mail-resend-v1.js'));
  await wait(800);

  const doc = window.document;
  const btnVerified = doc.querySelector('#row-verified .phantasm-resend-btn');
  const btnAwaiting = doc.querySelector('#row-awaiting .phantasm-resend-btn');
  const btnStranger = doc.querySelector('#row-stranger .phantasm-resend-btn');
  check('matched rows get resend buttons', !!btnVerified && !!btnAwaiting);
  check('unmatched row left alone', !btnStranger && !doc.getElementById('row-stranger').hasAttribute('data-phantasm-reg-id'));
  check('rows tagged with correct ids',
    doc.getElementById('row-verified').getAttribute('data-phantasm-reg-id') === 'REG-0007'
    && doc.getElementById('row-awaiting').getAttribute('data-phantasm-reg-id') === 'REG-0008');
  check('awaiting-payment relabelled', doc.querySelector('#row-awaiting .status.paid').textContent === '⏳ Awaiting payment', doc.querySelector('#row-awaiting .status.paid').textContent);
  check('verified badge untouched', doc.querySelector('#row-verified .status.verified').textContent === '✅ Verified');

  btnVerified.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await wait(200);
  check('click calls resend endpoint for that id', calls.some((c) => c.url === '/api/admin/confirmation/resend/REG-0007' && c.method === 'PUT'), JSON.stringify(calls.map((c) => `${c.method} ${c.url}`)));
  check('button flashes success', btnVerified.textContent === 'Sent ✓', btnVerified.textContent);
  dom.window.close();
}

/* ── 4. event rules v2 (Sep 2026 poster wording) ───────────────────── */
{
  const modal = (title, rules, judging) => `
    <div class="rules-modal"><div class="rules-header"><h2>${title} – Rules</h2></div>
    <div class="rules-content"><p>tagline</p>
      <ul>${rules.map((r) => `<li>${r}</li>`).join('')}</ul>
      <div><h4>Judging Criteria</h4><ul>${judging.map((j) => `<li>${j}</li>`).join('')}</ul></div>
      <div><h4>Prizes</h4><p>prizes here</p></div>
      <p>info line</p>
    </div></div>`;
  const dom = new JSDOM(`<!doctype html><html><body><div id="root">
      ${modal('Paper Presentation', ['Old rule A', 'IEEE format recommended; original work only (plagiarism = disqualification).'], ['Old judging'])}
      ${modal('CAD Modeling', ['R1', 'R2', 'R3', 'R4'], ['J1', 'J2'])}
      ${modal('IPL Auction', ['Team of up to 4 members.', 'Teams receive the first clue at the start point; each clue leads to the next.'], ['Completion time to the final marker'])}
      ${modal('Treasure Hunt', ['Team of up to 4 members.'], ['Completion time to the final marker'])}
      ${modal('', ['Should stay'], ['Stay'])}
    </div></body></html>`, { url: 'http://localhost/events', runScripts: 'dangerously' });
  const { window } = dom;
  const doc = window.document;
  const modals = doc.querySelectorAll('.rules-modal');
  const paperFirstLi = modals[0].querySelector('.rules-content > ul > li');
  runScript(window, load('phantasm-event-rules-v2.js'));
  await wait(400);

  const paperRules = [...modals[0].querySelectorAll('.rules-content > ul > li')].map((li) => li.textContent);
  check('paper rules replaced (IEEE gone, deadline rule in)',
    paperRules.length === 5
    && paperRules[4] === 'Papers must be submitted by the specified deadline'
    && !paperRules.join(' ').includes('IEEE'), JSON.stringify(paperRules));
  const paperJudging = [...modals[0].querySelectorAll('.rules-content > div ul > li')].map((li) => li.textContent);
  check('paper judging replaced', paperJudging.length === 3 && paperJudging[0] === 'Originality, technical depth, and relevance', JSON.stringify(paperJudging));
  check('existing li nodes updated in place (React-safe)',
    modals[0].querySelector('.rules-content > ul > li') === paperFirstLi && paperFirstLi.textContent.startsWith('Topics must be related'));
  const cadRules = [...modals[1].querySelectorAll('.rules-content > ul > li')].map((li) => li.textContent);
  check('CAD rules grow 4 -> 8 with new wording',
    cadRules.length === 8 && cadRules[0] === 'Individual participation only' && cadRules[7].startsWith('If not completed in time'), `${cadRules.length} rules`);
  const cadJudging = [...modals[1].querySelectorAll('.rules-content > div ul > li')].map((li) => li.textContent);
  check('CAD judging replaced (5 items)', cadJudging.length === 5 && cadJudging[4].startsWith('Model completion:'), `${cadJudging.length} items`);
  check('IPL wrong rules + judging stripped, prizes kept',
    modals[2].querySelectorAll('.rules-content > ul').length === 0
    && !modals[2].textContent.includes('Judging Criteria')
    && modals[2].textContent.includes('prizes here'), modals[2].textContent.replace(/\s+/g, ' ').slice(0, 90));
  check('non-covered event untouched', modals[3].querySelector('.rules-content > ul > li').textContent === 'Team of up to 4 members.');
  check('empty-title modal untouched', modals[4].querySelector('.rules-content > ul > li').textContent === 'Should stay');
  dom.window.close();
}

/* ── 4b. event rules v2: inline "View Details" judging + IPL button ── */
{
  const card = (title, judging, rulesBtn) => `
    <div class="event-card"><div class="event-card-body"><h3>${title}</h3>
      <p>card info</p>
      <div><button class="btn">View Details</button>${rulesBtn ? '<button class="btn outline">Rules & Judging</button>' : ''}</div>
      <div class="event-details open"><p><b>Team size: </b>up to 4</p><p><b>Prizes: </b>prizes here</p>
        ${judging ? `<div><p>Judging Criteria:</p><ul>${judging.map((j) => `<li>${j}</li>`).join('')}</ul></div>` : ''}
      </div>
    </div></div>`;
  const dom = new JSDOM(`<!doctype html><html><body><div id="root">
      ${card('Paper Presentation', ['Old judging A', 'Old judging B'], true)}
      ${card('IPL Auction', ['Completion time to the final marker', 'All checkpoints cleared and signed'], true)}
      ${card('Treasure Hunt', ['Completion time to the final marker'], true)}
      ${card('Chess', null, false)}
    </div></body></html>`, { url: 'http://localhost/events', runScripts: 'dangerously' });
  const { window } = dom;
  const doc = window.document;
  const cards = doc.querySelectorAll('.event-card');
  runScript(window, load('phantasm-event-rules-v2.js'));
  await wait(400);

  const paperInline = [...cards[0].querySelectorAll('.event-details ul > li')].map((li) => li.textContent);
  check('inline paper judging matches modal wording',
    paperInline.length === 3 && paperInline[0] === 'Originality, technical depth, and relevance', JSON.stringify(paperInline));
  check('inline paper keeps team size + prizes',
    cards[0].querySelector('.event-details').textContent.includes('up to 4')
    && cards[0].querySelector('.event-details').textContent.includes('prizes here'));
  check('paper Rules button kept', [...cards[0].querySelectorAll('button')].some((b) => b.textContent === 'Rules & Judging'));
  check('IPL inline judging stripped, rest kept',
    !cards[1].querySelector('.event-details').textContent.includes('Judging Criteria')
    && cards[1].querySelector('.event-details').textContent.includes('prizes here'));
  const iplBtns = [...cards[1].querySelectorAll('button')].map((b) => b.textContent);
  check('IPL Rules button hidden, View Details kept',
    !iplBtns.includes('Rules & Judging') && iplBtns.includes('View Details'), JSON.stringify(iplBtns));
  check('non-covered inline card untouched',
    cards[2].querySelector('.event-details ul > li').textContent === 'Completion time to the final marker'
    && [...cards[2].querySelectorAll('button')].some((b) => b.textContent === 'Rules & Judging'));
  check('card without judging block survives', cards[3].querySelector('.event-details').textContent.includes('up to 4'));
  dom.window.close();
}

/* ── 5. emailed event guides (VAAGAI26_*.pdf) ─────────────────────── */
{
  const EXPECTED = [
    'VAAGAI26_ANSYS_SIMULATION.pdf',
    'VAAGAI26_CAD_MODELLING.pdf',
    'VAAGAI26_GLIDER_COMPETITION.pdf',
    'VAAGAI26_LINE_FOLLOWER.pdf',
    'VAAGAI26_NON_TECHNICAL.pdf',
    'VAAGAI26_PAPER_PRESENTATION.pdf',
    'VAAGAI26_TECHNICAL_QUIZ.pdf',
    'VAAGAI26_WATER_ROCKETRY.pdf',
  ];
  const missing = EXPECTED.filter((f) => !existsSync(join(root, f)));
  check('all 8 guide PDFs present at repo root', missing.length === 0, missing.join(', '));
  const sizes = EXPECTED.map((f) => { try { return statSync(join(root, f)).size; } catch { return 0; } });
  check('every guide is non-empty', sizes.every((s) => s > 0), sizes.join(', '));
  const total = sizes.reduce((a, b) => a + b, 0);
  const CAP = 14 * 1024 * 1024; // must stay in sync with MAX_GUIDE_BYTES in api/index.js
  check('guides total under the 14 MB mail cap', total <= CAP, `${(total / 1024 / 1024).toFixed(1)} MB`);
  const apiSrc = readFileSync(join(root, 'api/index.js'), 'utf8');
  const referenced = [...apiSrc.matchAll(/file:\s*'(VAAGAI26_[^']+\.pdf)'/g)].map((m) => m[1]);
  const unmapped = [...new Set(referenced)].filter((f) => !existsSync(join(root, f)));
  check('every EVENT_GUIDES filename resolves on disk', referenced.length > 0 && unmapped.length === 0, `${referenced.length} refs, unmapped: ${unmapped.join(', ')}`);
  // No stray duplicates: the space-named uploads must be gone (replaced, not duplicated).
  const strays = ['Paper_presentation.pdf', 'WATER ROCKET.pdf', 'TECHNICAL QUIZ.pdf', 'CAD MODELLING.pdf', 'ANSYS SIMULATION.pdf', 'GLIDER COMPETITION.pdf', 'LINE FOLLOWER.pdf', 'non technical poster.pdf']
    .filter((f) => existsSync(join(root, f)));
  check('no stray duplicate uploads at root', strays.length === 0, strays.join(', '));
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll patch checks passed.');
process.exit(failures ? 1 : 0);
