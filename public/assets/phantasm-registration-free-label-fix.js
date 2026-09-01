/* PHANTASM'27 — REGISTRATION FREE LABEL FIX
   Registration is paid according to the event's standard fee.
   Replace legacy "Register for Free" wording without touching pricing logic.
*/
(function () {
  const PATTERN = /register\s+for\s+free/gi;

  function fixText(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);

    nodes.forEach((textNode) => {
      if (!PATTERN.test(textNode.nodeValue)) return;
      PATTERN.lastIndex = 0;
      textNode.nodeValue = textNode.nodeValue.replace(PATTERN, 'Register');
    });
  }

  function run() {
    fixText(document.getElementById('root') || document.body);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }

  const root = document.getElementById('root') || document.body;
  const observer = new MutationObserver(() => {
    window.clearTimeout(window.__phantasmFreeLabelTimer);
    window.__phantasmFreeLabelTimer = window.setTimeout(run, 0);
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true });
})();
