'use strict';
/* PHANTASM'27 — STANDARD FEE DISPLAY v5
   Display-only layer. Published event fees are identical for all genders. */
(function () {
  const isRegister = () => /\/register\/?$/i.test(window.location.pathname);
  const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const FEES = [
    ['advanced cnc machining and precision manufacturing',200],['advanced cnc machining',200],['precision manufacturing',200],
    ['paper presentation',200],['ansys simulation challenge',200],['ansys simulation',200],['cad modeling',200],['cad modelling',200],
    ['glider competition',200],['glider',200],['line follower',300],['line follower robot',300],['technical quiz',100],
    ['water rocketry',200],['water rocket',200],['free fire',100],['freefire',100],['carrom',100],['ipl auction',100],
    ['college ipl auction',100],['chess',50]
  ];
  const fee = (title) => { const n=norm(title); const hit=FEES.find(([k])=>n===k||n.includes(k)||k.includes(n)); return hit?.[1] ?? null; };
  function run(root=document){
    if(!isRegister()) return;
    const cards=root.querySelectorAll('article,li,section,[class*="event-card" i],[class*="eventCard" i],[class*="event" i]');
    cards.forEach(card=>{
      const heading=[...card.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,b')].find(x=>fee(x.textContent)!=null);
      const value=heading&&fee(heading.textContent); if(value==null) return;
      card.querySelectorAll('*').forEach(node=>{
        if(node.children.length) return;
        const text=String(node.textContent||'').replace(/\s+/g,' ').trim();
        if(/^free$/i.test(text)||/^₹0(?:\.00)?$/i.test(text)) node.textContent=`₹${value}`;
      });
    });
  }
  function start(){const r=document.getElementById('root'); if(!r)return; run(r); new MutationObserver(()=>run(r)).observe(r,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
