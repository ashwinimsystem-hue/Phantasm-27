/* PHANTASM'27 — REGISTRATION LABEL CLEANUP
   The Vite bundle is a generated artifact. Keep its pricing logic untouched and
   remove obsolete FREE / Register for Free presentation at the registration UI.
*/
(function(){
  const clean=()=>{
    if(!/\/register\/?$/i.test(location.pathname)) return;
    const root=document.getElementById('root'); if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[]; let n; while(n=walker.nextNode()) nodes.push(n);
    nodes.forEach(node=>{
      const raw=node.nodeValue||'';
      if(!/register\s+for\s+free|\bfree\b/i.test(raw)) return;
      const parent=node.parentElement;
      if(!parent || /SCRIPT|STYLE|OPTION/.test(parent.tagName)) return;
      const replacement=raw.replace(/register\s+for\s+free/gi,'Register').replace(/\bFREE\b/gi,'').replace(/[ \t]{2,}/g,' ').trim();
      if(replacement!==raw) node.nodeValue=replacement;
    });
  };
  const start=()=>{clean(); let timer; const root=document.getElementById('root'); if(!root)return; new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(clean,150)}).observe(root,{childList:true,subtree:true});};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
})();
