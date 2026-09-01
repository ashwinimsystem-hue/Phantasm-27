/* PHANTASM'27 — safe registration UI text cleanup */
(function () {
  const TITLE = "PHANTASM'27";
  const SKIP = new Set(['SCRIPT','STYLE','NOSCRIPT','OPTION','TEXTAREA']);

  function cleanTextNode(node) {
    if (!node || !node.parentElement || SKIP.has(node.parentElement.tagName)) return;
    const text = node.nodeValue || '';
    if (!/register\s+for\s+free|\bFREE\b/i.test(text)) return;
    let next = text.replace(/register\s+for\s+free/gi, 'Register');
    // Remove standalone FREE labels, but do not mutate words such as FREEFORM.
    next = next.replace(/\bFREE\b/gi, '').replace(/[ \t]{2,}/g, ' ').trim();
    if (next !== text.trim() && next) node.nodeValue = next;
    else if (!next && /\bFREE\b/i.test(text)) node.nodeValue = '';
  }

  function fix() {
    document.title = TITLE;
    const root = document.getElementById('root') || document.body;
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(cleanTextNode);
    root.querySelectorAll('h1,h2,h3,h4,[class*="title" i]').forEach((el) => {
      const t = (el.textContent || '').trim();
      if (/^PHANTASM(?:.|\s)*(?:27|2k27)?$/i.test(t) || /^PHANTASM/i.test(t)) {
        el.textContent = TITLE;
      }
    });
  }

  const start = () => {
    fix();
    const root = document.getElementById('root') || document.body;
    if (!root) return;
    let timer = 0;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(fix, 30);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
