/* PHANTASM'27 — STANDARD FEE DISPLAY v7
   Keep one authoritative visible fee per event card.
   Gender never changes pricing. Remove stale crossed-out SOLO/TEAM variants,
   then show the canonical fee for the selected participation mode.
*/
(function(){
  const isRegister=()=>/\/register\/?$/i.test(location.pathname);
  const norm=v=>String(v||'').replace(/\s+/g,' ').trim().toLowerCase();
  const FEES={
    'advanced cnc machining and precision manufacturing':200,'advanced cnc machining':200,'precision manufacturing':200,
    'paper presentation':200,'ansys simulation challenge':200,'ansys simulation':200,'cad modeling':200,'cad modelling':200,
    'glider competition':200,'glider':200,'line follower robot':300,'line follower':300,'technical quiz':100,
    'water rocketry':200,'water rocket':200,'free fire':100,'freefire':100,'ipl auction':100,'college ipl auction':100,
    'carrom':100,'chess':50,'bachelor samayal':100
  };
  const feeFor=name=>{const n=norm(name); const hit=Object.keys(FEES).find(k=>n===k||n.includes(k)||k.includes(n)); return hit?FEES[hit]:null;};
  const findTitle=card=>{
    for(const el of card.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,b,[class*="title" i],[class*="name" i]')){
      const t=el.textContent.trim(); if(feeFor(t)!=null) return t;
    }
    const text=norm(card.textContent||'');
    const key=Object.keys(FEES).find(k=>text.includes(k)); return key||'';
  };
  const leafNodes=el=>[...el.querySelectorAll('*')].filter(n=>n.children.length===0 && !['SCRIPT','STYLE','OPTION'].includes(n.tagName));
  function cleanCard(card){
    const title=findTitle(card), fee=feeFor(title); if(fee==null)return;
    const leaves=leafNodes(card);
    // Remove stale fee text that contains crossed-out SOLO/TEAM pricing.
    leaves.forEach(n=>{
      const t=n.textContent.replace(/\s+/g,' ').trim();
      if(!t)return;
      if(/^(?:fee\s*:\s*)?solo\s*[-–—:]?\s*₹?\s*\d+\s*\|\s*team\s*[-–—:]?\s*₹?\s*\d+$/i.test(t)){
        n.textContent=`Fee: ₹${fee}`; return;
      }
      if(/^fee\s*:\s*₹?\s*\d+(?:\.\d+)?(?:\s*[|,].*)?$/i.test(t) && /\bsolo\b|\bteam\b/i.test(t)){
        n.textContent=`Fee: ₹${fee}`; return;
      }
      if(/^fee\s*:/i.test(t) && /\bfree\b/i.test(t)) n.textContent=`Fee: ₹${fee}`;
      else if(/^free$/i.test(t)) n.textContent=`₹${fee}`;
      else if(/^₹\s*0(?:\.00)?$/i.test(t)) n.textContent=`₹${fee}`;
    });
    // Crossed-out price fragments can sit in separate leaf nodes. If a card has
    // a fee label, replace the entire visible fee row with one canonical value.
    const feeRows=[...card.querySelectorAll('p,div,span,small,strong')].filter(el=>{
      const t=el.textContent.replace(/\s+/g,' ').trim();
      return /^(fee\s*:)/i.test(t) || (/solo/i.test(t)&&/team/i.test(t)&&/₹/.test(t));
    });
    feeRows.forEach(el=>{
      if(el.children.length===0) el.textContent=`Fee: ₹${fee}`;
      else if(/solo/i.test(el.textContent)&&/team/i.test(el.textContent)) el.textContent=`Fee: ₹${fee}`;
    });
    // Never show gender-specific or duplicated fee rows.
    [...card.querySelectorAll('*')].filter(el=>el.children.length===0).forEach(el=>{
      const t=norm(el.textContent);
      if(/^(male|female)\s*(fee|price)\s*[:\-]?/.test(t)) el.remove();
    });
  }
  function cleanTotal(root){
    const candidates=[...root.querySelectorAll('*')].filter(el=>el.children.length===0);
    candidates.forEach(el=>{
      const t=el.textContent.replace(/\s+/g,' ').trim();
      if(/^total\s*[:\-]/i.test(t) || /^(grand\s+)?total\s+amount/i.test(t)){
        const m=t.match(/(?:₹|rs\.?|inr)\s*([0-9][0-9,]*(?:\.\d+)?)/i);
        if(m) el.textContent=`Total: ₹${m[1].replace(/,/g,'')}`;
      }
    });
  }
  function fix(root){
    if(!root||!isRegister())return;
    root.querySelectorAll('article,li,section,[class*="event-card" i],[class*="eventCard" i],[class*="event-item" i],[class*="eventoption" i],[class*="workshop" i]').forEach(cleanCard);
    cleanTotal(root);
  }
  function start(){
    if(!isRegister())return; const root=document.getElementById('root'); if(!root)return;
    fix(root); [200,600,1200,2500].forEach(t=>setTimeout(()=>fix(root),t));
    if(root.dataset.feeDisplayV7)return; root.dataset.feeDisplayV7='true'; let timer=null;
    new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>fix(root),120)}).observe(root,{childList:true,subtree:true});
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
})();
