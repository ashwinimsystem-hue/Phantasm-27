/* PHANTASM'27 — registration text cleanup */
(function(){
  const TITLE="PHANTASM'27";
  const BAD=/\bFREE\b/gi;
  const REGISTER_FREE=/register\s+for\s+free/gi;
  function clean(root=document){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(n=>{
      const p=n.parentElement;
      if(!p || ['SCRIPT','STYLE','NOSCRIPT','OPTION'].includes(p.tagName)) return;
      let t=n.nodeValue;
      if(REGISTER_FREE.test(t)) t=t.replace(REGISTER_FREE,'Register');
      BAD.lastIndex=0;
      if(BAD.test(t)) t=t.replace(BAD,'').replace(/\s{2,}/g,' ').replace(/:\s*$/,'');
      if(t!==n.nodeValue) n.nodeValue=t;
    });
  }
  function fixTitle(){
    document.querySelectorAll('.Formcontainer h1,.Formcontainer h2,.Formcontainer h3,.Registertitle,.register-title').forEach(el=>{
      const text=(el.textContent||'').trim();
      if(/PHANTASM/i.test(text)) el.textContent=TITLE;
    });
    document.title="PHANTASM'27";
  }
  function run(){fixTitle();clean();}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',run,{once:true}); else run();
  const obs=new MutationObserver(()=>{fixTitle();clean();});
  obs.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
})();
