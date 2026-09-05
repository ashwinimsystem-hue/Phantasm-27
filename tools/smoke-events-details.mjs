/* Smoke test: render the app bundle in jsdom, open the Events page,
   expand "View Details" and open the Rules modal to verify the new
   date/venue/judging-criteria/prize UI is rendered. */
import { JSDOM } from "jsdom";
import fs from "node:fs";

const html = `<!doctype html><html><head><script>
  window.__RUNTIME_CONFIG__ = {};
</script></head><body><div id="root"></div></body></html>`;

const dom = new JSDOM(html, {
  url: "http://localhost/events",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const { window } = dom;

// jsdom lacks these; the bundle may reference them
window.matchMedia = window.matchMedia || (() => ({
  matches: false, media: "", addListener() {}, removeListener() {},
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
}));
window.scrollTo = window.scrollTo || (() => {});
window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
if (!window.crypto?.randomUUID) {
  window.crypto = { ...window.crypto, randomUUID: () => Math.random().toString(36).slice(2) };
}
window.fetch = window.fetch || (() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));

const bundle = fs.readFileSync("public/assets/index-BVThDX27.js", "utf8");
try {
  window.eval(bundle);
} catch (err) {
  // Fail hard only on syntax errors; runtime network hiccups are tolerated
  if (err instanceof SyntaxError) throw err;
  console.log("(bundle init note:", String(err).slice(0, 120), ")");
}

const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
};

await new Promise((r) => setTimeout(r, 2500));

const bodyText = window.document.body.textContent;

// --- Events page rendered with all 13 events ---
const titles = ["Paper Presentation", "ANSYS Simulation Challenge", "CAD Modeling",
  "Glider Competition", "Line Follower", "Technical Quiz", "Water Rocketry",
  "IPL Auction", "Carrom", "Chess", "Free Fire", "Mehandi", "Treasure Hunt"];
const missing = titles.filter((t) => !bodyText.includes(t));
check("all 13 event cards render", missing.length === 0, missing.length ? "missing: " + missing.join(", ") : "");

// --- Every card now shows date + venue ---
check("dates shown on cards (17-09-2026 & 18-09-2026)",
  bodyText.includes("17-09-2026") && bodyText.includes("18-09-2026"));

// --- Open "View Details" on IPL Auction (had no rules before) ---
const buttons = [...window.document.querySelectorAll("button")];
const iplView = buttons.find((b) => b.textContent === "View Details" &&
  b.closest("article")?.textContent.includes("IPL Auction"));
check("found IPL Auction View Details button", !!iplView);
if (iplView) {
  iplView.click();
  await new Promise((r) => setTimeout(r, 400));
  const card = iplView.closest("article");
  const cardText = card.textContent;
  check("View Details shows Date", cardText.includes("Date: 18-09-2026"));
  check("View Details shows Venue", cardText.includes("Venue: Seminar Hall"));
  check("View Details shows Participation mode", cardText.includes("Participation: Team"));
  check("View Details shows team size", cardText.includes("Team size: up to 4"));
  check("View Details shows labelled prize amount", cardText.includes("Prizes:") && cardText.includes("1st ₹500"));
}

// --- Open Rules modal on Paper Presentation (has 3 prizes + judging criteria) ---
const ppRules = buttons.find((b) => b.textContent === "Rules" &&
  b.closest("article")?.textContent.includes("Paper Presentation"));
check("found Paper Presentation Rules button", !!ppRules);
if (ppRules) {
  ppRules.click();
  await new Promise((r) => setTimeout(r, 500));
  const modal = window.document.querySelector(".rules-modal");
  check("rules modal opens", !!modal);
  if (modal) {
    const mText = modal.textContent;
    check("modal title updated", mText.includes("Rules & Details"));
    check("modal shows date meta", mText.includes("17-09-2026"));
    check("modal shows venue meta", mText.includes("3rd Year Classroom, Mech Block"));
    check("modal shows Rules heading", mText.includes("Rules"));
    check("modal shows Judging Criteria heading", mText.includes("Judging Criteria"));
    check("modal judging criteria content", mText.includes("Originality, technical depth"));
    check("modal shows Prize Amount heading", mText.includes("Prize Amount"));
    check("modal shows 1st prize ₹2000", mText.includes("₹2000"));
    check("modal shows 2nd prize ₹1500", mText.includes("₹1500"));
    check("modal shows 3rd prize ₹1000", mText.includes("₹1000"));
  }
}

// --- Rules modal for Carrom (newly added rules) ---
const close = window.document.querySelector(".rules-modal .btn");
close?.click();
await new Promise((r) => setTimeout(r, 300));
const carromRules = [...window.document.querySelectorAll("button")].find((b) =>
  b.textContent === "Rules" && b.closest("article")?.textContent.includes("Carrom"));
if (carromRules) {
  carromRules.click();
  await new Promise((r) => setTimeout(r, 500));
  const modal = window.document.querySelector(".rules-modal");
  const mText = modal?.textContent || "";
  check("Carrom modal has rules now", mText.includes("Team of 2 members"));
  check("Carrom modal has judging criteria", mText.includes("Boards won"));
  check("Carrom modal shows prize ₹400", mText.includes("₹400"));
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
