/* PHANTASM'27 — GENDER-NEUTRAL PRICING
   Pricing is handled by the application and server canonical rules.
   Gender is participant information only and is never a pricing input.

   This legacy runtime patch is intentionally disabled. It previously changed
   React-controlled form values and removed DOM nodes, which could cause the
   registration page to freeze or display a black screen when gender changed.
*/
(function () {
  // Intentionally no-op. Do not mutate registration state or DOM here.
})();
